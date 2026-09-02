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
    /// Shared buffer for streaming: worker writes samples here during recording.
    streaming_buffer: Arc<Mutex<(Vec<f32>, u32)>>,
    /// Shared VAD speech-active flag: worker thread updates this on every VAD frame.
    /// Streaming pipeline reads it to split chunks at speech pauses.
    vad_speech_active: Arc<Mutex<bool>>,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            cmd_tx: Mutex::new(None),
            worker: Mutex::new(None),
            is_recording: Arc::new(Mutex::new(false)),
            auto_stop_rx: Mutex::new(None),
            streaming_buffer: Arc::new(Mutex::new((Vec::new(), 0))),
            vad_speech_active: Arc::new(Mutex::new(false)),
        }
    }

    pub fn is_recording(&self) -> bool {
        *self.is_recording.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Returns true if the VAD currently detects an active speech segment.
    /// Used by the streaming transcription pipeline for VAD-aware chunk splitting.
    pub fn is_vad_speech_active(&self) -> bool {
        *self.vad_speech_active.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Get current streaming samples and sample rate. Returns (samples_since_last_call, sample_rate).
    /// This is used by the streaming transcription pipeline.
    pub fn take_streaming_samples(&self) -> (Vec<f32>, u32) {
        let mut buf = self.streaming_buffer.lock().unwrap_or_else(|e| e.into_inner());
        let samples = std::mem::take(&mut buf.0);
        let rate = buf.1;
        (samples, rate)
    }

    pub fn start(&self, app_handle: AppHandle, silence_timeout_sec: u64, _silence_threshold: f32) -> Result<()> {
        if self.is_recording() {
            return Ok(());
        }

        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (auto_stop_tx, auto_stop_rx) = mpsc::channel::<RecordedAudio>();
        let is_recording = self.is_recording.clone();
        let streaming_buf = self.streaming_buffer.clone();
        let vad_active_flag = self.vad_speech_active.clone();

        // Clear streaming buffer and reset VAD flag
        {
            let mut buf = streaming_buf.lock().unwrap_or_else(|e| e.into_inner());
            buf.0.clear();
            buf.1 = 0;
        }
        {
            let mut vad_flag = vad_active_flag.lock().unwrap_or_else(|e| e.into_inner());
            *vad_flag = false;
        }

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
            let mut last_streaming_write: usize = 0;

            // Silence auto-stop tracking: count consecutive silent 512-sample chunks
            let silence_chunks_limit = if silence_timeout_sec == 0 {
                u64::MAX
            } else {
                // chunks are emitted ~every 512 samples
                (silence_timeout_sec * sample_rate as u64) / 512
            };
            let mut silent_chunks: u64 = 0;
            // Don't start silence detection until at least 3 seconds of audio
            // This prevents brief pauses during speech from triggering auto-stop
            let min_chunks_before_silence = (sample_rate as u64 * 3) / 512;

            // VAD detector with adaptive threshold
            let mut vad = VadDetector::new(512);

            // Pre-recording buffer: keep the last 0.5 seconds of audio so we
            // can prepend it when speech is first detected.
            let pre_buf_samples = (sample_rate as usize / 2) as usize; // 0.5 s
            let mut pre_recording_buf = PreRecordingBuffer::new(pre_buf_samples);
            let mut speech_started = false;
            let mut final_buffer: Vec<f32> = Vec::new();

            let drain_audio = |audio_rx: &mpsc::Receiver<Vec<f32>>,
                               buffer: &mut Vec<f32>,
                               app_handle: &AppHandle,
                               silent_chunks: &mut u64,
                               total_chunks: &mut u64,
                               vad: &mut VadDetector,
                               pre_recording_buf: &mut PreRecordingBuffer,
                               speech_started: &mut bool,
                               final_buffer: &mut Vec<f32>,
                               vad_active_flag: &Arc<Mutex<bool>>| {
                while let Ok(chunk) = audio_rx.try_recv() {
                    buffer.extend_from_slice(&chunk);

                    // Emit RMS level every ~512 new samples (modulo check detects
                    // when buffer crosses a 512-sample boundary; chunk.len() guard prevents
                    // duplicate emissions for small chunks)
                    if buffer.len() % 512 < chunk.len() {
                        *total_chunks += 1;
                        let recent = &buffer[buffer.len().saturating_sub(512)..];
                        let rms = (recent.iter().map(|s| s * s).sum::<f32>() / recent.len() as f32).sqrt();
                        let _ = app_handle.emit("audio-level", rms.min(1.0));

                        // Feed frame into VAD
                        if !*speech_started {
                            // During calibration, process_frame collects noise
                            // samples and always returns false.
                            let speech_onset = vad.process_frame(recent);

                            if speech_onset {
                                // Speech onset detected — flush the pre-recording
                                // buffer (samples *before* this frame) into
                                // final_buffer, then mark speech as started.
                                *speech_started = true;
                                let pre = pre_recording_buf.take();
                                log::info!("VAD: speech started, prepended {} pre-speech samples", pre.len());
                                final_buffer.extend_from_slice(&pre);
                            } else {
                                // Pre-speech: keep a rolling buffer of recent audio
                                pre_recording_buf.push(recent);
                            }
                        } else {
                            // Already in speech — just track VAD state
                            let _ = vad.process_frame(recent);
                        }

                        // Update shared VAD speech-active flag for streaming pipeline
                        if let Ok(mut flag) = vad_active_flag.lock() {
                            *flag = vad.is_speech_active();
                        }

                        // Only count silence after minimum recording duration
                        if *total_chunks > min_chunks_before_silence && *speech_started {
                            if !vad.is_speech_active() {
                                *silent_chunks += 1;
                            } else {
                                *silent_chunks = 0;
                            }
                        }
                    }

                    // Once speech has started, accumulate into final buffer
                    if *speech_started {
                        final_buffer.extend_from_slice(&chunk);
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
                    &mut vad,
                    &mut pre_recording_buf,
                    &mut speech_started,
                    &mut final_buffer,
                    &vad_active_flag,
                );

                // Copy new samples to streaming buffer for real-time transcription
                if buffer.len() > last_streaming_write {
                    if let Ok(mut sb) = streaming_buf.lock() {
                        sb.0.extend_from_slice(&buffer[last_streaming_write..]);
                        sb.1 = sample_rate;
                    }
                    last_streaming_write = buffer.len();
                }

                // Silence auto-stop (only after speech has started)
                if speech_started && silent_chunks >= silence_chunks_limit {
                    log::info!("Silence timeout reached, auto-stopping recording");
                    drain_audio(
                        &audio_rx,
                        &mut buffer,
                        &app_handle,
                        &mut silent_chunks,
                        &mut total_chunks,
                        &mut vad,
                        &mut pre_recording_buf,
                        &mut speech_started,
                        &mut final_buffer,
                        &vad_active_flag,
                    );
                    *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                    let audio = RecordedAudio {
                        samples: std::mem::take(&mut final_buffer),
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
                            &mut vad,
                            &mut pre_recording_buf,
                            &mut speech_started,
                            &mut final_buffer,
                            &vad_active_flag,
                        );
                        *is_recording.lock().unwrap_or_else(|e| e.into_inner()) = false;
                        // Use final_buffer (contains pre-speech + speech) if
                        // speech was detected; otherwise fall back to full buffer
                        let audio = RecordedAudio {
                            samples: if speech_started {
                                std::mem::take(&mut final_buffer)
                            } else {
                                std::mem::take(&mut buffer)
                            },
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
    // Pre-allocate: 44-byte WAV header + 2 bytes per sample (16-bit mono).
    // Avoids repeated reallocation & memcpy for long recordings.
    let estimated_size = 44 + audio.samples.len() * 2;
    let mut cursor = Cursor::new(Vec::with_capacity(estimated_size));
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
    // and 4% of the signal peak. 4% is more aggressive than the original 8% to
    // preserve trailing words that naturally fade in volume. Soft endings like
    // "…the", "…of", "…and" where the final consonant is quiet can drop below
    // 8% of peak amplitude — lowering to 4% ensures they survive trimming.
    // 0.04 = 4% of peak amplitude; balances noise rejection vs. tail preservation
    let threshold = floor_threshold.max(peak * 0.04);
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

/// Calculate the RMS (root mean square) energy of the audio.
/// Returns a value in [0.0, 1.0] where 0.0 is silence and 1.0 is maximum amplitude.
pub fn audio_rms(audio: &RecordedAudio) -> f32 {
    if audio.samples.is_empty() {
        return 0.0;
    }
    let sum_of_squares: f32 = audio.samples.iter().map(|s| s * s).sum();
    (sum_of_squares / audio.samples.len() as f32).sqrt()
}

/// Returns true if the audio is mostly silent (RMS energy below the threshold).
/// Default threshold of ~0.005 filters out recordings where the user accidentally
/// triggered recording in a quiet room.
pub fn is_mostly_silent(audio: &RecordedAudio, threshold: f32) -> bool {
    audio_rms(audio) < threshold
}

/// Estimate the signal-to-noise ratio of the audio in decibels.
/// Uses peak signal vs. median absolute sample energy as a simple proxy.
/// Returns a value in dB (higher = better quality).
#[allow(dead_code)]
pub fn signal_to_noise_ratio(audio: &RecordedAudio) -> f32 {
    if audio.samples.is_empty() {
        return 0.0;
    }

    // Peak signal
    let peak = audio
        .samples
        .iter()
        .map(|s| s.abs())
        .fold(0.0_f32, f32::max);
    if peak == 0.0 {
        return 0.0;
    }

    // Median absolute sample as noise floor estimate
    let mut abs_samples: Vec<f32> = audio.samples.iter().map(|s| s.abs()).collect();
    abs_samples.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = abs_samples[abs_samples.len() / 2];

    // SNR = 20 * log10(peak / noise_floor)
    // Guard against log(0) when median is zero (very quiet signal with spikes)
    let noise_floor = if median > 0.0 { median } else { f32::MIN_POSITIVE };
    20.0 * (peak / noise_floor).log10()
}

// ── Voice Activity Detection ────────────────────────────────────────────────

/// Voice Activity Detector with adaptive noise-floor calibration.
///
/// During the first ~1 second of audio the detector calibrates its noise floor.
/// After calibration, a frame is classified as "speech" when its RMS energy
/// exceeds `noise_floor * 3.0 + minimum_threshold`.  Hysteresis is applied:
/// * 3 consecutive speech frames → speech **start**
/// * 5 consecutive silence frames → speech **end**
pub struct VadDetector {
    /// Adaptive threshold after calibration (noise_floor * multiplier + minimum)
    energy_threshold: f32,
    /// Count of consecutive frames above threshold
    speech_frames: usize,
    /// Count of consecutive frames below threshold
    silence_frames: usize,
    /// Number of samples per frame (e.g. 512)
    frame_size: usize,
    /// Current state: true = inside a speech segment
    is_speech: bool,
    /// Estimated noise-floor RMS
    noise_floor: f32,
    /// Collects per-frame RMS values during calibration
    noise_samples: Vec<f32>,
    /// True once the initial calibration window has completed
    calibration_complete: bool,
}

impl VadDetector {
    /// Frames needed for calibration (~1 second at 16 kHz / 512 samples).
    const CALIBRATION_FRAMES: usize = 32;
    /// Minimum number of consecutive speech frames to declare speech start.
    const SPEECH_HANGON: usize = 3;
    /// Minimum number of consecutive silence frames to declare speech end.
    const SILECE_HANGON: usize = 5;
    /// Floor for the adaptive threshold so quiet environments still work.
    const MIN_THRESHOLD: f32 = 0.01;
    /// Multiplier applied to the calibrated noise floor.
    const THRESHOLD_MULTIPLIER: f32 = 3.0;

    pub fn new(frame_size: usize) -> Self {
        Self {
            energy_threshold: Self::MIN_THRESHOLD,
            speech_frames: 0,
            silence_frames: 0,
            frame_size,
            is_speech: false,
            noise_floor: 0.0,
            noise_samples: Vec::with_capacity(Self::CALIBRATION_FRAMES),
            calibration_complete: false,
        }
    }

    /// Feed a slice of mono f32 samples (typically `frame_size` long).
    /// Returns `true` when the detector transitions to speech-active.
    pub fn process_frame(&mut self, samples: &[f32]) -> bool {
        let rms = compute_rms(samples);

        // ── calibration phase ──
        if !self.calibration_complete {
            self.noise_samples.push(rms);
            if self.noise_samples.len() >= Self::CALIBRATION_FRAMES {
                self.calibration_complete = true;
                // Use the 75th-percentile of collected noise samples as the
                // noise floor.  This is more robust than the mean because a
                // single noisy frame during calibration won't skew the result.
                let mut sorted = self.noise_samples.clone();
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let p75_idx = (sorted.len() as f32 * 0.75) as usize;
                self.noise_floor = sorted[p75_idx.min(sorted.len() - 1)];
                self.energy_threshold =
                    (self.noise_floor * Self::THRESHOLD_MULTIPLIER).max(Self::MIN_THRESHOLD);
                log::info!(
                    "VAD calibration complete: noise_floor={:.4}, threshold={:.4}",
                    self.noise_floor,
                    self.energy_threshold
                );
            }
            return false;
        }

        // ── detection phase ──
        let above = rms >= self.energy_threshold;
        let was_speech = self.is_speech;

        if above {
            self.speech_frames += 1;
            self.silence_frames = 0;
        } else {
            self.silence_frames += 1;
            self.speech_frames = 0;
        }

        if !self.is_speech && self.speech_frames >= Self::SPEECH_HANGON {
            self.is_speech = true;
        } else if self.is_speech && self.silence_frames >= Self::SILECE_HANGON {
            self.is_speech = false;
        }

        // Return true on the *transition* to speech
        self.is_speech && !was_speech
    }

    /// Returns `true` while the detector considers us inside a speech segment.
    pub fn is_speech_active(&self) -> bool {
        self.is_speech
    }

    /// Returns `true` once the calibration window has finished.
    pub fn is_calibrated(&self) -> bool {
        self.calibration_complete
    }

    /// Calibration progress in `[0.0, 1.0]`.
    pub fn calibration_progress(&self) -> f32 {
        if self.calibration_complete {
            1.0
        } else {
            self.noise_samples.len() as f32 / Self::CALIBRATION_FRAMES as f32
        }
    }

    /// The current adaptive threshold (after calibration).
    pub fn threshold(&self) -> f32 {
        self.energy_threshold
    }

    /// The estimated noise floor (after calibration).
    pub fn noise_floor(&self) -> f32 {
        self.noise_floor
    }
}

/// Compute the RMS energy of a slice of samples.
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

// ── Pre-recording buffer ────────────────────────────────────────────────────

/// Rolling buffer that keeps the last N seconds of audio so we can prepend
/// context before the detected speech onset.
///
/// At 16 kHz a 0.5 s buffer = 8 000 samples ≈ 64 KB of f32 — negligible.
pub struct PreRecordingBuffer {
    buffer: Vec<f32>,
    max_samples: usize,
}

impl PreRecordingBuffer {
    /// `duration_samples` is the number of samples to retain (e.g. 0.5 s × 16 kHz = 8000).
    pub fn new(duration_samples: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(duration_samples),
            max_samples: duration_samples,
        }
    }

    /// Push new samples into the rolling buffer, discarding the oldest when full.
    pub fn push(&mut self, samples: &[f32]) {
        self.buffer.extend_from_slice(samples);
        if self.buffer.len() > self.max_samples {
            let excess = self.buffer.len() - self.max_samples;
            self.buffer.drain(..excess);
        }
    }

    /// Consume the buffer, returning the stored samples and resetting the buffer.
    pub fn take(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.buffer)
    }

    /// Current number of buffered samples.
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }
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

    // --- audio_rms tests ---

    #[test]
    fn test_audio_rms_empty() {
        let audio = make_audio(vec![], 16000);
        assert_eq!(audio_rms(&audio), 0.0);
    }

    #[test]
    fn test_audio_rms_silence() {
        let audio = make_audio(vec![0.0; 16000], 16000);
        assert_eq!(audio_rms(&audio), 0.0);
    }

    #[test]
    fn test_audio_rms_known_value() {
        // Constant signal of 0.5 → RMS = 0.5
        let audio = make_audio(vec![0.5; 1000], 16000);
        let rms = audio_rms(&audio);
        assert!((rms - 0.5).abs() < 1e-6, "expected ~0.5, got {rms}");
    }

    #[test]
    fn test_audio_rms_mixed() {
        // Alternating +1/-1 → RMS = 1.0
        let samples: Vec<f32> = (0..1000).map(|i| if i % 2 == 0 { 1.0 } else { -1.0 }).collect();
        let audio = make_audio(samples, 16000);
        let rms = audio_rms(&audio);
        assert!((rms - 1.0).abs() < 1e-6, "expected ~1.0, got {rms}");
    }

    // --- is_mostly_silent tests ---

    #[test]
    fn test_is_mostly_silent_empty() {
        let audio = make_audio(vec![], 16000);
        assert!(is_mostly_silent(&audio, 0.005));
    }

    #[test]
    fn test_is_mostly_silent_quiet() {
        let audio = make_audio(vec![0.001; 16000], 16000);
        assert!(is_mostly_silent(&audio, 0.005));
    }

    #[test]
    fn test_is_mostly_silent_loud() {
        let audio = make_audio(vec![0.5; 16000], 16000);
        assert!(!is_mostly_silent(&audio, 0.005));
    }

    #[test]
    fn test_is_mostly_silent_at_threshold() {
        // RMS slightly above threshold → NOT silent
        let audio = make_audio(vec![0.006; 100], 16000);
        assert!(!is_mostly_silent(&audio, 0.005));
        // RMS slightly below threshold → IS silent
        let audio_quiet = make_audio(vec![0.004; 100], 16000);
        assert!(is_mostly_silent(&audio_quiet, 0.005));
    }

    // --- signal_to_noise_ratio tests ---

    #[test]
    fn test_snr_empty() {
        let audio = make_audio(vec![], 16000);
        assert_eq!(signal_to_noise_ratio(&audio), 0.0);
    }

    #[test]
    fn test_snr_all_zeros() {
        let audio = make_audio(vec![0.0; 16000], 16000);
        assert_eq!(signal_to_noise_ratio(&audio), 0.0);
    }

    #[test]
    fn test_snr_clean_signal() {
        // Constant signal: peak = median → SNR = 0 dB
        let audio = make_audio(vec![0.5; 1000], 16000);
        let snr = signal_to_noise_ratio(&audio);
        assert!((snr - 0.0).abs() < 0.1, "expected ~0 dB, got {snr}");
    }

    #[test]
    fn test_snr_signal_with_noise() {
        // Mostly quiet (0.001) with a few loud peaks (0.8)
        let mut samples = vec![0.001; 16000];
        samples[8000] = 0.8;
        samples[8001] = -0.8;
        let audio = make_audio(samples, 16000);
        let snr = signal_to_noise_ratio(&audio);
        // Peak (0.8) / median (~0.001) → ~58 dB; should be substantially positive
        assert!(snr > 30.0, "expected high SNR, got {snr}");
    }

    // --- VadDetector tests ---

    #[test]
    fn test_vad_calibration_progress() {
        let mut vad = VadDetector::new(512);
        assert!(!vad.is_calibrated());
        assert_eq!(vad.calibration_progress(), 0.0);

        // Feed 16 silence frames (halfway through calibration)
        for _ in 0..16 {
            vad.process_frame(&vec![0.001; 512]);
        }
        assert!(!vad.is_calibrated());
        assert!((vad.calibration_progress() - 0.5).abs() < 0.01);

        // Feed remaining 16 frames
        for _ in 0..16 {
            vad.process_frame(&vec![0.001; 512]);
        }
        assert!(vad.is_calibrated());
        assert_eq!(vad.calibration_progress(), 1.0);
    }

    #[test]
    fn test_vad_threshold_adapts_to_noise() {
        let mut vad = VadDetector::new(512);

        // Calibrate with very quiet noise (RMS ≈ 0.002)
        for _ in 0..32 {
            vad.process_frame(&vec![0.002; 512]);
        }
        assert!(vad.is_calibrated());
        // Threshold should be noise_floor * 3.0, but floored at 0.01
        assert!(vad.threshold() >= 0.01);
        assert!(vad.noise_floor() > 0.0);
    }

    #[test]
    fn test_vad_no_speech_during_silence() {
        let mut vad = VadDetector::new(512);

        // Calibrate with silence
        for _ in 0..32 {
            vad.process_frame(&vec![0.001; 512]);
        }

        // Continue with silence — should never declare speech
        for _ in 0..100 {
            let onset = vad.process_frame(&vec![0.001; 512]);
            assert!(!onset, "should not detect speech in silence");
        }
        assert!(!vad.is_speech_active());
    }

    #[test]
    fn test_vad_detects_loud_signal_after_calibration() {
        let mut vad = VadDetector::new(512);

        // Calibrate with silence
        for _ in 0..32 {
            vad.process_frame(&vec![0.001; 512]);
        }

        // Feed 2 loud frames — not enough (needs 3 consecutive)
        let mut onset = false;
        onset |= vad.process_frame(&vec![0.5; 512]);
        onset |= vad.process_frame(&vec![0.5; 512]);
        assert!(!onset, "should not detect speech with only 2 speech frames");
        assert!(!vad.is_speech_active());

        // Third loud frame — now speech should be declared
        onset = vad.process_frame(&vec![0.5; 512]);
        assert!(onset, "speech onset should be detected on 3rd loud frame");
        assert!(vad.is_speech_active());
    }

    #[test]
    fn test_vad_speech_end_after_silence() {
        let mut vad = VadDetector::new(512);

        // Calibrate with silence
        for _ in 0..32 {
            vad.process_frame(&vec![0.001; 512]);
        }

        // Trigger speech onset (3 consecutive loud frames)
        for _ in 0..3 {
            vad.process_frame(&vec![0.5; 512]);
        }
        assert!(vad.is_speech_active());

        // Feed 4 silence frames — not enough (needs 5)
        for _ in 0..4 {
            vad.process_frame(&vec![0.001; 512]);
        }
        assert!(vad.is_speech_active(), "should still be speech with 4 silence frames");

        // 5th silence frame — speech should end
        vad.process_frame(&vec![0.001; 512]);
        assert!(!vad.is_speech_active(), "speech should end after 5 silence frames");
    }

    #[test]
    fn test_vad_onset_returns_true_only_once() {
        let mut vad = VadDetector::new(512);

        // Calibrate
        for _ in 0..32 {
            vad.process_frame(&vec![0.001; 512]);
        }

        // Speech onset on 3rd frame
        assert!(!vad.process_frame(&vec![0.5; 512]));
        assert!(!vad.process_frame(&vec![0.5; 512]));
        assert!(vad.process_frame(&vec![0.5; 512])); // onset!

        // Continuing loud frames should NOT return onset again
        assert!(!vad.process_frame(&vec![0.5; 512]));
        assert!(!vad.process_frame(&vec![0.5; 512]));
    }

    #[test]
    fn test_vad_speech_resumes_after_pause() {
        let mut vad = VadDetector::new(512);

        // Calibrate
        for _ in 0..32 {
            vad.process_frame(&vec![0.001; 512]);
        }

        // First speech segment (3 frames → onset)
        for _ in 0..3 {
            vad.process_frame(&vec![0.5; 512]);
        }
        assert!(vad.is_speech_active());

        // Silence → speech ends (5 frames)
        for _ in 0..5 {
            vad.process_frame(&vec![0.001; 512]);
        }
        assert!(!vad.is_speech_active());

        // Second speech segment (3 frames → new onset)
        let mut onset = false;
        for _ in 0..3 {
            onset |= vad.process_frame(&vec![0.5; 512]);
        }
        assert!(onset, "should detect speech onset again after pause");
        assert!(vad.is_speech_active());
    }

    // --- PreRecordingBuffer tests ---

    #[test]
    fn test_pre_buffer_basic() {
        let mut buf = PreRecordingBuffer::new(1000);
        assert!(buf.is_empty());
        assert_eq!(buf.len(), 0);

        buf.push(&vec![1.0; 500]);
        assert_eq!(buf.len(), 500);
        assert!(!buf.is_empty());
    }

    #[test]
    fn test_pre_buffer_rolling_eviction() {
        let mut buf = PreRecordingBuffer::new(1000);

        // Push 500 samples — buffer at capacity
        buf.push(&vec![1.0; 500]);
        assert_eq!(buf.len(), 500);

        // Push 600 more — total would be 1100, but max is 1000
        buf.push(&vec![2.0; 600]);
        assert_eq!(buf.len(), 1000);

        // The first 100 of the original 1.0 samples should be evicted
        let data = buf.take();
        assert_eq!(data.len(), 1000);
        // The oldest 100 samples (1.0) are gone, next 400 are 1.0, then 600 are 2.0
        assert_eq!(data[0], 1.0); // still has old samples
        assert_eq!(data[399], 1.0); // last of the old
        assert_eq!(data[400], 2.0); // start of new
    }

    #[test]
    fn test_pre_buffer_take_resets() {
        let mut buf = PreRecordingBuffer::new(1000);
        buf.push(&vec![1.0; 500]);

        let data = buf.take();
        assert_eq!(data.len(), 500);
        assert!(buf.is_empty());

        // Second take should be empty
        let data2 = buf.take();
        assert!(data2.is_empty());
    }

    #[test]
    fn test_pre_buffer_exact_capacity() {
        let mut buf = PreRecordingBuffer::new(100);
        buf.push(&vec![0.5; 100]);
        assert_eq!(buf.len(), 100);

        // Push exactly at capacity — no eviction needed
        buf.push(&vec![0.0; 0]);
        assert_eq!(buf.len(), 100);
    }

    #[test]
    fn test_compute_rms() {
        // Constant signal → RMS equals the constant
        assert!((compute_rms(&vec![0.5; 100]) - 0.5).abs() < 1e-6);
        // Silence
        assert_eq!(compute_rms(&vec![0.0; 100]), 0.0);
        // Empty
        assert_eq!(compute_rms(&[]), 0.0);
    }
}
