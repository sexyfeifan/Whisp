use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat};
use std::io::Cursor;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct RecordedAudio {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

enum Cmd {
    Stop(mpsc::Sender<RecordedAudio>),
    Cancel,
}

pub struct AudioRecorder {
    cmd_tx: Mutex<Option<mpsc::Sender<Cmd>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
    is_recording: Arc<Mutex<bool>>,
    auto_stop_rx: Mutex<Option<mpsc::Receiver<RecordedAudio>>>,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            cmd_tx: Mutex::new(None),
            worker: Mutex::new(None),
            is_recording: Arc::new(Mutex::new(false)),
            auto_stop_rx: Mutex::new(None),
        }
    }

    pub fn is_recording(&self) -> bool {
        *self.is_recording.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn start(&self, app_handle: AppHandle, silence_timeout_sec: u64, silence_threshold: f32) -> Result<()> {
        if self.is_recording() {
            return Ok(());
        }

        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (auto_stop_tx, auto_stop_rx) = mpsc::channel::<RecordedAudio>();
        let is_recording = self.is_recording.clone();

        // Mark as recording before spawning thread to prevent double-start
        *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = true;

        // Build stream on worker thread so Stream doesn't need Send
        let worker = thread::spawn(move || {
            let host = cpal::default_host();
            let device = match host.default_input_device() {
                Some(d) => d,
                None => {
                    log::error!("No input device available");
                    *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                    return;
                }
            };
            let config = match device.default_input_config() {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Failed to get input config: {}", e);
                    *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                    return;
                }
            };
            let sample_rate = config.sample_rate().0;
            let channels = config.channels() as usize;

            let (audio_tx, audio_rx) = mpsc::channel::<Vec<f32>>();

            let stream = match config.sample_format() {
                SampleFormat::F32 => build_stream::<f32>(&device, &config.into(), audio_tx, channels),
                SampleFormat::I16 => build_stream::<i16>(&device, &config.into(), audio_tx, channels),
                SampleFormat::I32 => build_stream::<i32>(&device, &config.into(), audio_tx, channels),
                SampleFormat::U16 => build_stream::<u16>(&device, &config.into(), audio_tx, channels),
                _ => {
                    log::error!("Unsupported sample format");
                    *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                    return;
                }
            };
            let stream = match stream {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Failed to build stream: {}", e);
                    *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                    return;
                }
            };
            if let Err(e) = stream.play() {
                log::error!("Failed to play stream: {}", e);
                *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                return;
            }

            let mut buffer: Vec<f32> = Vec::new();
            let mut total_chunks: u64 = 0;

            // Silence auto-stop tracking: count consecutive silent 512-sample chunks
            let silence_chunks_limit = if silence_timeout_sec == 0 {
                u64::MAX
            } else {
                // chunks are emitted ~every 512 samples
                (silence_timeout_sec as u64 * sample_rate as u64) / 512
            };
            let mut silent_chunks: u64 = 0;
            // Don't start silence detection until at least 3 seconds of audio
            // This prevents brief pauses during speech from triggering auto-stop
            let min_chunks_before_silence = (sample_rate as u64 * 3) / 512;

            let drain_audio = |audio_rx: &mpsc::Receiver<Vec<f32>>,
                               buffer: &mut Vec<f32>,
                               app_handle: &AppHandle,
                               silent_chunks: &mut u64,
                               total_chunks: &mut u64| {
                while let Ok(chunk) = audio_rx.try_recv() {
                    buffer.extend_from_slice(&chunk);

                    if buffer.len() % 512 < chunk.len() {
                        *total_chunks += 1;
                        let recent = &buffer[buffer.len().saturating_sub(512)..];
                        let rms = (recent.iter().map(|s| s * s).sum::<f32>() / recent.len() as f32).sqrt();
                        let _ = app_handle.emit("audio-level", rms.min(1.0));
                        // Only count silence after minimum recording duration
                        if *total_chunks > min_chunks_before_silence {
                            if rms < silence_threshold {
                                *silent_chunks += 1;
                            } else {
                                *silent_chunks = 0;
                            }
                        }
                    }
                }
            };

            loop {
                // Drain audio data
                drain_audio(
                    &audio_rx,
                    &mut buffer,
                    &app_handle,
                    &mut silent_chunks,
                    &mut total_chunks,
                );

                // Silence auto-stop
                if silent_chunks >= silence_chunks_limit {
                    log::info!("Silence timeout reached, auto-stopping recording");
                    drain_audio(
                        &audio_rx,
                        &mut buffer,
                        &app_handle,
                        &mut silent_chunks,
                        &mut total_chunks,
                    );
                    *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                    let audio = RecordedAudio {
                        samples: std::mem::take(&mut buffer),
                        sample_rate,
                    };
                    let _ = auto_stop_tx.send(audio);
                    let _ = app_handle.emit("silence-auto-stop", ());
                    break;
                }

                // Check commands (blocking with timeout instead of polling)
                match cmd_rx.recv_timeout(std::time::Duration::from_millis(5)) {
                    Ok(Cmd::Stop(reply)) => {
                        // Drain remaining audio before returning
                        drain_audio(
                            &audio_rx,
                            &mut buffer,
                            &app_handle,
                            &mut silent_chunks,
                            &mut total_chunks,
                        );
                        *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                        let audio = RecordedAudio {
                            samples: std::mem::take(&mut buffer),
                            sample_rate,
                        };
                        let _ = reply.send(audio);
                        break;
                    }
                    Ok(Cmd::Cancel) => {
                        *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }

            drop(stream);
        });

        *self.cmd_tx.lock().unwrap_or_else(|e| e.into_inner()) = Some(cmd_tx);
        *self.worker.lock().unwrap_or_else(|e| e.into_inner()) = Some(worker);
        *self.auto_stop_rx.lock().unwrap_or_else(|e| e.into_inner()) = Some(auto_stop_rx);
        Ok(())
    }

    pub fn stop(&self) -> Result<RecordedAudio> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.send_cmd(Cmd::Stop(reply_tx));
        let audio = reply_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .context("Timeout waiting for audio data")?;
        self.join_worker();
        Ok(audio)
    }

    pub fn cancel(&self) {
        self.send_cmd(Cmd::Cancel);
        self.join_worker();
    }

    /// Returns audio if silence auto-stop fired, None otherwise (non-blocking).
    pub fn take_auto_stop_audio(&self) -> Option<RecordedAudio> {
        let rx = self.auto_stop_rx.lock().unwrap_or_else(|e| e.into_inner());
        rx.as_ref()?.try_recv().ok()
    }

    /// Joins the worker thread after silence auto-stop (worker already exited).
    pub fn join_worker_after_auto_stop(&self) {
        self.join_worker();
    }

    fn send_cmd(&self, cmd: Cmd) {
        if let Some(tx) = self.cmd_tx.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            let _ = tx.send(cmd);
        }
    }

    fn join_worker(&self) {
        if let Some(handle) = self.worker.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = handle.join();
        }
        *self.cmd_tx.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *self.auto_stop_rx.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

fn build_stream<T: Sample + cpal::SizedSample + Send + 'static>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    tx: mpsc::Sender<Vec<f32>>,
    channels: usize,
) -> Result<cpal::Stream> {
    let stream = device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let mut mono = Vec::with_capacity(data.len() / channels);
            if channels == 1 {
                mono.extend(data.iter().map(|s| s.to_float_sample().to_sample::<f32>()));
            } else {
                for frame in data.chunks_exact(channels) {
                    let sum: f32 = frame.iter().map(|s| s.to_float_sample().to_sample::<f32>()).sum();
                    mono.push(sum / channels as f32);
                }
            }
            let _ = tx.send(mono);
        },
        |err| {
            log::error!("Audio stream error: {}", err);
        },
        None,
    )?;
    Ok(stream)
}

pub fn encode_wav(audio: &RecordedAudio) -> Result<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: audio.sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)?;
        for &sample in &audio.samples {
            let s = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            writer.write_sample(s)?;
        }
        writer.finalize()?;
    }
    Ok(cursor.into_inner())
}

pub fn trim_silence(audio: &RecordedAudio, floor_threshold: f32, padding_ms: u32) -> RecordedAudio {
    if audio.samples.is_empty() || audio.sample_rate == 0 {
        return audio.clone();
    }

    let peak = audio.samples.iter().map(|sample| sample.abs()).fold(0.0_f32, f32::max);
    if peak <= floor_threshold {
        return audio.clone();
    }

    // Adaptive threshold: use the larger of the noise floor (floor_threshold)
    // and 8% of the signal peak. The 8% value is a conservative speech detection
    // threshold that works well for typical recordings: quiet sections are
    // reliably distinguished from speech while avoiding false positives from
    // breathing, ambient noise, or slight microphone hiss.
    let threshold = floor_threshold.max(peak * 0.08);
    let start = audio.samples.iter().position(|sample| sample.abs() >= threshold);
    let end = audio.samples.iter().rposition(|sample| sample.abs() >= threshold);

    let (start, end) = match (start, end) {
        (Some(start), Some(end)) if end >= start => (start, end),
        _ => return audio.clone(),
    };

    let padding = ((audio.sample_rate as u64 * padding_ms as u64) / 1000) as usize;
    let trimmed_start = start.saturating_sub(padding);
    let trimmed_end = (end + padding + 1).min(audio.samples.len());

    let trimmed = RecordedAudio {
        samples: audio.samples[trimmed_start..trimmed_end].to_vec(),
        sample_rate: audio.sample_rate,
    };

    // If trimming made the audio too short (< 200ms), return the original
    let min_samples = (audio.sample_rate as u64 * 200 / 1000) as usize;
    if trimmed.samples.len() < min_samples {
        return audio.clone();
    }

    trimmed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_audio(samples: Vec<f32>, sample_rate: u32) -> RecordedAudio {
        RecordedAudio { samples, sample_rate }
    }

    #[test]
    fn test_trim_silence_empty() {
        let audio = make_audio(vec![], 16000);
        let trimmed = trim_silence(&audio, 0.015, 120);
        assert!(trimmed.samples.is_empty());
    }

    #[test]
    fn test_trim_silence_all_silent() {
        let audio = make_audio(vec![0.0; 16000], 16000); // 1s silence
        let trimmed = trim_silence(&audio, 0.015, 120);
        assert_eq!(trimmed.samples.len(), 16000); // Should return original
    }

    #[test]
    fn test_trim_silence_with_speech() {
        // 0.5s silence + 1s speech + 0.5s silence at 16kHz
        let mut samples = vec![0.0; 8000]; // leading silence
        samples.extend(vec![0.5; 16000]); // speech
        samples.extend(vec![0.0; 8000]); // trailing silence
        let audio = make_audio(samples, 16000);
        let trimmed = trim_silence(&audio, 0.015, 120);
        // Should trim silence but keep padding
        assert!(trimmed.samples.len() < 32000);
        assert!(trimmed.samples.len() > 16000); // speech + padding
    }

    #[test]
    fn test_encode_wav() {
        let audio = make_audio(vec![0.1, -0.1, 0.5, -0.5], 16000);
        let wav = encode_wav(&audio).unwrap();
        // WAV header starts with "RIFF"
        assert!(wav.starts_with(b"RIFF"));
        // Contains "WAVE"
        assert!(wav.windows(4).any(|w| w == b"WAVE"));
    }

    #[test]
    fn test_encode_wav_empty() {
        let audio = make_audio(vec![], 16000);
        let wav = encode_wav(&audio).unwrap();
        assert!(wav.starts_with(b"RIFF"));
    }

    #[test]
    fn test_trim_silence_zero_sample_rate() {
        let audio = make_audio(vec![0.5; 100], 0);
        let trimmed = trim_silence(&audio, 0.015, 120);
        assert_eq!(trimmed.samples.len(), 100); // Should return original
    }
}
