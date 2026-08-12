use anyhow::{Context, Result};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::recorder::{self, RecordedAudio};
use crate::transcribe;

/// Static streaming state, accessible from lib.rs recording flow.
pub static STREAMING_STATE: std::sync::OnceLock<Mutex<Option<StreamingState>>> = std::sync::OnceLock::new();

/// Start recording with streaming transcription enabled.
/// Uses the existing recording flow but enables chunk-level transcription.
pub fn start_streaming_recording(app_handle: &AppHandle) -> Result<()> {
    let state = STREAMING_STATE.get_or_init(|| Mutex::new(None));
    *state.lock().unwrap_or_else(|e| e.into_inner()) = Some(StreamingState::new(16000));
    crate::toggle_recording(app_handle);
    Ok(())
}

/// Stop recording and finalize streaming transcription.
/// If streaming was active, emits a `streaming-final` event with the result.
pub fn stop_streaming_recording(app_handle: &AppHandle) -> Result<()> {
    crate::toggle_recording(app_handle);
    Ok(())
}

/// Configuration for real-time chunked streaming transcription.
#[derive(Debug, Clone)]
pub struct StreamingConfig {
    /// Whether streaming transcription is enabled.
    pub enabled: bool,
    /// Duration (in seconds) between chunk sends. Default: 3.
    pub chunk_duration_secs: u32,
    /// Language code for the transcription API (e.g., "en", "zh", "auto").
    pub language: String,
    /// Optional prompt to guide the transcription model.
    pub prompt: String,
    /// Use local Whisper model instead of cloud API.
    pub use_local_model: bool,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            chunk_duration_secs: 2,
            language: "auto".to_string(),
            prompt: String::new(),
            use_local_model: false,
        }
    }
}

/// Accumulated state for real-time streaming transcription.
///
/// Tracks all samples captured since recording started, the index of the last
/// sent chunk, and the accumulated partial transcription text.
pub struct StreamingState {
    /// All samples accumulated since recording started.
    samples: Vec<f32>,
    /// Index into `samples` marking where the last sent chunk ended.
    last_sent_index: usize,
    /// Sample rate of the captured audio.
    sample_rate: u32,
    /// Accumulated partial text from all sent chunks so far.
    partial_text: String,
}

impl StreamingState {
    /// Create a new streaming state for audio at the given sample rate.
    pub fn new(sample_rate: u32) -> Self {
        Self {
            samples: Vec::new(),
            last_sent_index: 0,
            sample_rate,
            partial_text: String::new(),
        }
    }

    /// Update the sample rate (called when actual device rate is known).
    pub fn set_sample_rate(&mut self, rate: u32) {
        if rate > 0 {
            self.sample_rate = rate;
        }
    }

    /// Total accumulated duration in seconds.
    fn total_duration_secs(&self) -> f64 {
        if self.sample_rate == 0 {
            return 0.0;
        }
        self.samples.len() as f64 / self.sample_rate as f64
    }

    /// Duration of unsent audio since the last chunk was sent, in seconds.
    fn duration_since_last_sent(&self) -> f64 {
        if self.sample_rate == 0 {
            return 0.0;
        }
        (self.samples.len() - self.last_sent_index) as f64 / self.sample_rate as f64
    }
}

/// Append new audio samples to the streaming state. If the configured chunk
/// duration has elapsed since the last send, encode and transcribe the new
/// chunk, emit a `streaming-partial` event, and return the chunk's text.
///
/// Returns the newly transcribed text for this chunk, or an empty string if no
/// chunk was ready yet or if chunk transcription failed gracefully.
pub async fn process_streaming_chunk(
    state: &Mutex<Option<StreamingState>>,
    new_samples: &[f32],
    sample_rate: u32,
    config: &StreamingConfig,
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
    app_handle: &AppHandle,
    request_timeout_secs: u64,
    retry_count: u8,
) -> Result<String> {
    // Lock state, append new samples, and check if enough time has elapsed.
    let chunk_samples: Vec<f32>;
    {
        let mut st = state.lock().unwrap_or_else(|e| e.into_inner());
        let st = match st.as_mut() {
            Some(s) => s,
            None => return Ok(String::new()),
        };
        st.samples.extend_from_slice(new_samples);

        let duration_since = st.duration_since_last_sent();
        if duration_since < config.chunk_duration_secs.max(1) as f64 {
            return Ok(String::new());
        }

        // Take the unsent tail as the chunk to transcribe.
        chunk_samples = st.samples[st.last_sent_index..].to_vec();
        st.last_sent_index = st.samples.len();
    }

    if chunk_samples.is_empty() {
        return Ok(String::new());
    }

    // Encode the chunk as a WAV file.
    let audio = RecordedAudio {
        samples: chunk_samples,
        sample_rate,
    };
    let wav_data = match recorder::encode_wav(&audio) {
        Ok(d) => d,
        Err(e) => {
            log::warn!("Failed to encode streaming chunk to WAV: {}", e);
            return Ok(String::new());
        }
    };

    // Transcribe the chunk — local Whisper or cloud API.
    let chunk_result: std::result::Result<String, anyhow::Error> = if config.use_local_model {
        // Use local Whisper engine for transcription
        let engine = crate::whisper::WhisperEngine::new();
        let whisper_config = crate::whisper::WhisperConfig {
            model_path: String::new(), // will be loaded from stored config
            language: config.language.clone(),
            n_threads: 0,
            translate: false,
            prompt: config.prompt.clone(),
        };
        engine.set_config(whisper_config);
        // Load the actual config from disk
        let stored_config = engine.get_config();
        if stored_config.model_path.is_empty() {
            // Try to get model path from stored whisper config
            let settings = crate::settings::get_settings();
            if !settings.whisper_config_json.is_empty() {
                if let Ok(wc) = serde_json::from_str::<crate::whisper::WhisperConfig>(&settings.whisper_config_json) {
                    engine.set_config(crate::whisper::WhisperConfig {
                        model_path: wc.model_path,
                        language: config.language.clone(),
                        n_threads: wc.n_threads,
                        translate: false,
                        prompt: config.prompt.clone(),
                    });
                }
            }
        }
        // Convert WAV to f32 samples
        let hound_reader = hound::WavReader::new(&wav_data[..]);
        match hound_reader {
            Ok(mut reader) => {
                let samples: std::result::Result<Vec<f32>, _> =
                    reader.samples::<i16>().map(|s| s.map(|v| v as f32 / 32768.0)).collect();
                match samples {
                    Ok(samples) => {
                        let sample_rate = reader.spec().sample_rate;
                        engine.transcribe(&samples, sample_rate).map(|r| r.text)
                    }
                    Err(e) => Err(anyhow::anyhow!("Failed to decode WAV samples: {}", e)),
                }
            }
            Err(e) => Err(anyhow::anyhow!("Failed to read WAV: {}", e)),
        }
    } else {
        // Build optional language and prompt for the API call.
        let lang_opt = if config.language == "auto" {
            None
        } else {
            Some(config.language.as_str())
        };
        let prompt_opt = if config.prompt.trim().is_empty() {
            None
        } else {
            Some(config.prompt.as_str())
        };
        transcribe::transcribe_audio(
            client,
            api_key,
            api_base_url,
            model,
            &wav_data,
            lang_opt,
            prompt_opt,
            request_timeout_secs,
            retry_count,
        )
        .await
    };

    match chunk_result {
        Ok(chunk_text) => {
            // Append this chunk's text to the accumulated partial text.
            let mut st = state.lock().unwrap_or_else(|e| e.into_inner());
            let st = match st.as_mut() {
                Some(s) => s,
                None => return Ok(String::new()),
            };
            if !chunk_text.is_empty() {
                if !st.partial_text.is_empty() && !st.partial_text.ends_with(' ') {
                    st.partial_text.push(' ');
                }
                st.partial_text.push_str(&chunk_text);
            }

            // Emit a 'streaming-partial' event so the frontend can update in
            // real time.
            let _ = app_handle.emit(
                "streaming-partial",
                serde_json::json!({
                    "text": st.partial_text,
                    "chunk_text": chunk_text,
                }),
            );

            Ok(chunk_text)
        }
        Err(e) => {
            // Chunk failure is non-fatal — log and continue.
            log::warn!("Streaming chunk transcription failed (continuing): {}", e);
            Ok(String::new())
        }
    }
}

/// Finalize streaming transcription: take any remaining unsent audio, send it
/// to the API for a complete final transcription, emit `streaming-final`, and
/// return the final text.
///
/// Consumes the state (takes ownership of `samples`).
pub async fn finalize_streaming(
    state: &Mutex<Option<StreamingState>>,
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
    app_handle: &AppHandle,
    request_timeout_secs: u64,
    retry_count: u8,
    language: Option<&str>,
    prompt: Option<&str>,
) -> Result<String> {
    let all_samples: Vec<f32>;
    let sample_rate: u32;
    {
        let mut st = state.lock().unwrap_or_else(|e| e.into_inner());
        let st = match st.as_mut() {
            Some(s) => s,
            None => return Ok(String::new()),
        };
        all_samples = std::mem::take(&mut st.samples);
        sample_rate = st.sample_rate;
    }

    if all_samples.is_empty() {
        let _ = app_handle.emit("streaming-final", serde_json::json!({ "text": "" }));
        return Ok(String::new());
    }

    // Encode all remaining audio (or full recording if nothing was sent yet)
    // as a single WAV for the final transcription.
    let audio = RecordedAudio {
        samples: all_samples,
        sample_rate,
    };
    let wav_data = recorder::encode_wav(&audio).context("Failed to encode final streaming WAV")?;

    let final_text = transcribe::transcribe_audio(
        client,
        api_key,
        api_base_url,
        model,
        &wav_data,
        language,
        prompt,
        request_timeout_secs,
        retry_count,
    )
    .await
    .context("Failed to transcribe final streaming audio")?;

    let _ = app_handle.emit("streaming-final", serde_json::json!({ "text": final_text }));

    Ok(final_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_streaming_state_initial() {
        let st = StreamingState::new(16000);
        assert!(st.samples.is_empty());
        assert_eq!(st.last_sent_index, 0);
        assert_eq!(st.sample_rate, 16000);
        assert!(st.partial_text.is_empty());
    }

    #[test]
    fn test_duration_since_last_sent() {
        let mut st = StreamingState::new(16000);
        // Add 3 seconds of audio (48000 samples at 16kHz)
        st.samples = vec![0.0_f32; 48000];
        assert!((st.duration_since_last_sent() - 3.0).abs() < 0.01);
    }

    #[test]
    fn test_duration_since_last_sent_after_send() {
        let mut st = StreamingState::new(16000);
        st.samples = vec![0.0_f32; 48000];
        st.last_sent_index = 32000; // 2 seconds already sent
        assert!((st.duration_since_last_sent() - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_total_duration() {
        let mut st = StreamingState::new(16000);
        st.samples = vec![0.0_f32; 16000];
        assert!((st.total_duration_secs() - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_total_duration_zero_rate() {
        let st = StreamingState::new(0);
        assert!((st.total_duration_secs()).abs() < f64::EPSILON);
    }

    #[test]
    fn test_streaming_config_default() {
        let cfg = StreamingConfig::default();
        assert!(!cfg.enabled);
        assert_eq!(cfg.chunk_duration_secs, 2);
        assert_eq!(cfg.language, "auto");
        assert!(cfg.prompt.is_empty());
    }
}
