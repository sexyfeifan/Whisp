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
#[allow(dead_code)]
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
    /// Use VAD boundaries for smarter chunk splitting (split at speech pauses).
    pub vad_aware_chunking: bool,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            chunk_duration_secs: 2,
            language: "auto".to_string(),
            prompt: String::new(),
            use_local_model: false,
            vad_aware_chunking: true,
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
    /// Number of samples to overlap between consecutive chunks.
    /// Defaults to 8000 (0.5s at 16kHz) so words at chunk boundaries aren't split.
    overlap_samples: usize,
    /// Raw transcription text from the most recently sent chunk, used for
    /// deduplication against the overlapping region of the next chunk.
    last_chunk_text: String,
    /// Previous VAD speech-active state, for detecting speech→silence transitions.
    was_speech_active: bool,
}

impl StreamingState {
    /// Create a new streaming state for audio at the given sample rate.
    pub fn new(sample_rate: u32) -> Self {
        Self {
            samples: Vec::new(),
            last_sent_index: 0,
            sample_rate,
            partial_text: String::new(),
            overlap_samples: 8000,
            last_chunk_text: String::new(),
            was_speech_active: false,
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

    /// Check whether a VAD boundary should trigger a chunk send.
    ///
    /// Returns `true` if:
    /// - VAD just transitioned from speech→silence AND we have >1 second of unsent audio, OR
    /// - Unsent audio exceeds 2× chunk_duration (safety valve for continuous speech)
    ///
    /// Also updates the internal `was_speech_active` tracking state.
    pub fn should_send_at_vad_boundary(&mut self, is_speech_active: bool, chunk_duration_secs: u32) -> bool {
        let was_active = self.was_speech_active;
        self.was_speech_active = is_speech_active;

        let duration_since = self.duration_since_last_sent();

        // Speech→silence transition: ideal time to send if we have enough audio
        if was_active && !is_speech_active && duration_since >= 1.0 {
            log::info!(
                "VAD boundary: speech→silence with {:.1}s unsent — triggering chunk send",
                duration_since
            );
            return true;
        }

        // Safety valve: if unsent audio exceeds 2× the configured chunk duration,
        // send regardless of VAD state (prevents stalling during continuous speech)
        let max_wait = (chunk_duration_secs.max(1) * 2) as f64;
        if duration_since >= max_wait {
            log::info!(
                "VAD safety valve: {:.1}s unsent exceeds {:.1}s max — forcing chunk send",
                duration_since,
                max_wait
            );
            return true;
        }

        false
    }
}

/// Remove overlapping text between consecutive transcription chunks.
///
/// When audio chunks overlap, the speech API may produce identical words at the
/// boundary. This function finds the longest suffix of `previous` that matches a
/// prefix of `current` (minimum 4 characters) and returns only the non-overlapping
/// tail of `current`.
fn deduplicate_overlap(previous: &str, current: &str) -> String {
    if previous.is_empty() || current.is_empty() {
        return current.to_string();
    }

    let prev_chars: Vec<char> = previous.chars().collect();
    let curr_chars: Vec<char> = current.chars().collect();
    let max_check = prev_chars.len().min(curr_chars.len());

    // Search from longest to shortest for a suffix/prefix match.
    for len in (4..=max_check).rev() {
        if prev_chars[prev_chars.len() - len..] == curr_chars[..len] {
            let remainder: String = curr_chars[len..].iter().collect();
            return remainder.trim_start().to_string();
        }
    }
    current.to_string()
}

/// Append new audio samples to the streaming state. If the configured chunk
/// duration has elapsed since the last send, encode and transcribe the new
/// chunk, emit a `streaming-partial` event, and return the chunk's text.
///
/// Each chunk includes an overlap region from the end of the previous chunk so
/// that the speech API has context and doesn't split words at boundaries. The returned text is
/// deduplicated against the previous chunk's transcription to avoid repeating
/// overlapping content.
///
/// When `is_vad_speech_active` is `Some(...)` and `config.vad_aware_chunking` is
/// enabled, chunks are sent at VAD boundaries (speech→silence transitions) rather
/// than fixed time intervals, with the fixed interval as a safety-valve fallback.
///
/// Returns the newly transcribed (deduplicated) text for this chunk, or an
/// empty string if no chunk was ready yet or if chunk transcription failed
/// gracefully.
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
    is_vad_speech_active: Option<bool>,
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

        // Decide whether to send a chunk now.
        let should_send = if config.vad_aware_chunking {
            if let Some(vad_active) = is_vad_speech_active {
                // VAD-aware mode: send at speech→silence boundaries or safety valve
                st.should_send_at_vad_boundary(vad_active, config.chunk_duration_secs)
            } else {
                // VAD not available — fall back to fixed-interval chunking
                st.duration_since_last_sent() >= config.chunk_duration_secs.max(1) as f64
            }
        } else {
            // VAD-aware chunking disabled — use fixed-interval chunking
            st.duration_since_last_sent() >= config.chunk_duration_secs.max(1) as f64
        };

        if !should_send {
            return Ok(String::new());
        }

        // Take the unsent tail plus an overlap region from the previous chunk
        // so the speech API has context and doesn't split words at boundaries.
        let chunk_start = if st.last_sent_index > 0 {
            st.last_sent_index.saturating_sub(st.overlap_samples)
        } else {
            0
        };
        chunk_samples = st.samples[chunk_start..].to_vec();
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
            let mut st = state.lock().unwrap_or_else(|e| e.into_inner());
            let st = match st.as_mut() {
                Some(s) => s,
                None => return Ok(String::new()),
            };

            // Deduplicate: the overlap region may produce identical text at
            // the start of this chunk that was already captured at the end of
            // the previous chunk.
            let deduped_text = deduplicate_overlap(&st.last_chunk_text, &chunk_text);
            st.last_chunk_text = chunk_text;

            if !deduped_text.is_empty() {
                if !st.partial_text.is_empty() && !st.partial_text.ends_with(' ') {
                    st.partial_text.push(' ');
                }
                st.partial_text.push_str(&deduped_text);
            }

            // Emit a 'streaming-partial' event so the frontend can update in
            // real time.
            let _ = app_handle.emit(
                "streaming-partial",
                serde_json::json!({
                    "text": st.partial_text,
                    "chunk_text": deduped_text,
                }),
            );

            Ok(deduped_text)
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
        assert_eq!(st.overlap_samples, 8000);
        assert!(st.last_chunk_text.is_empty());
        assert!(!st.was_speech_active);
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
        assert!(cfg.vad_aware_chunking);
    }

    // ---- should_send_at_vad_boundary tests ----

    #[test]
    fn test_vad_boundary_speech_to_silence_triggers_send() {
        let mut st = StreamingState::new(16000);
        // Simulate 2 seconds of audio with speech active
        st.samples = vec![0.0_f32; 32000];
        st.was_speech_active = true;

        // Speech→silence with >1s unsent should trigger
        let result = st.should_send_at_vad_boundary(false, 2);
        assert!(result, "speech→silence with 2s unsent should trigger send");
        assert!(!st.was_speech_active);
    }

    #[test]
    fn test_vad_boundary_speech_to_silence_short_audio_no_trigger() {
        let mut st = StreamingState::new(16000);
        // Only 0.5 seconds of audio
        st.samples = vec![0.0_f32; 8000];
        st.was_speech_active = true;

        // Speech→silence but <1s unsent — should NOT trigger
        let result = st.should_send_at_vad_boundary(false, 2);
        assert!(!result, "speech→silence with <1s unsent should not trigger");
    }

    #[test]
    fn test_vad_boundary_safety_valve() {
        let mut st = StreamingState::new(16000);
        // 5 seconds of audio, chunk_duration=2, safety valve at 2×2=4s
        st.samples = vec![0.0_f32; 80000];

        // Still speech-active (no pause), but exceeded 2× chunk_duration
        let result = st.should_send_at_vad_boundary(true, 2);
        assert!(result, "safety valve should trigger at 2× chunk_duration");
    }

    #[test]
    fn test_vad_boundary_no_trigger_during_speech() {
        let mut st = StreamingState::new(16000);
        // 1 second of audio
        st.samples = vec![0.0_f32; 16000];
        st.was_speech_active = true;

        // Still speech active, not enough for safety valve (2×2=4s)
        let result = st.should_send_at_vad_boundary(true, 2);
        assert!(!result, "should not trigger during active speech below safety valve");
    }

    #[test]
    fn test_vad_boundary_tracks_state_transitions() {
        let mut st = StreamingState::new(16000);
        st.samples = vec![0.0_f32; 32000];

        // Start: no speech
        st.was_speech_active = false;

        // Silence→speech: no trigger (only speech→silence triggers)
        let result = st.should_send_at_vad_boundary(true, 2);
        assert!(!result, "silence→speech should not trigger");
        assert!(st.was_speech_active);

        // Speech→silence: trigger
        st.samples.extend_from_slice(&vec![0.0_f32; 16000]); // more audio
        let result = st.should_send_at_vad_boundary(false, 2);
        assert!(result, "speech→silence should trigger");
    }

    #[test]
    fn test_vad_boundary_safety_valve_respects_minimum() {
        let mut st = StreamingState::new(16000);
        // chunk_duration_secs=0 → max(0,1)=1, safety=2×1=2s
        st.samples = vec![0.0_f32; 32000]; // 2s

        let result = st.should_send_at_vad_boundary(true, 0);
        assert!(result, "safety valve should work even with chunk_duration=0");
    }

    // ---- deduplicate_overlap tests ----

    #[test]
    fn test_dedup_exact_overlap() {
        // Previous ended with "world hello", current starts with "hello there"
        let result = deduplicate_overlap("world hello", "hello there");
        assert_eq!(result, "there");
    }

    #[test]
    fn test_dedup_no_overlap() {
        let result = deduplicate_overlap("the quick brown", "fox jumped over");
        assert_eq!(result, "fox jumped over");
    }

    #[test]
    fn test_dedup_empty_previous() {
        let result = deduplicate_overlap("", "hello world");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_dedup_empty_current() {
        let result = deduplicate_overlap("hello world", "");
        assert_eq!(result, "");
    }

    #[test]
    fn test_dedup_both_empty() {
        let result = deduplicate_overlap("", "");
        assert_eq!(result, "");
    }

    #[test]
    fn test_dedup_short_overlap_not_deduped() {
        // Overlap of only 3 chars should NOT be deduplicated (minimum threshold is 4)
        let result = deduplicate_overlap("the cat", "cat sat");
        assert_eq!(result, "cat sat");
    }

    #[test]
    fn test_dedup_long_overlap() {
        let result = deduplicate_overlap(
            "this is a long sentence with extra words at the end",
            "at the end of the sentence we continue",
        );
        assert_eq!(result, "of the sentence we continue");
    }

    #[test]
    fn test_dedup_full_current_contained_in_previous() {
        // If current is entirely contained in the overlap, return empty
        let result = deduplicate_overlap("hello world foo", "world foo");
        assert_eq!(result, "");
    }

    #[test]
    fn test_dedup_identical_strings() {
        // If previous and current are identical, entire current is overlap
        let result = deduplicate_overlap("same text", "same text");
        assert_eq!(result, "");
    }

    #[test]
    fn test_dedup_unicode() {
        // "世界早上好" (5 chars) overlaps with "世界早上好今天" prefix
        let result = deduplicate_overlap("你好世界早上好", "世界早上好今天天气不错");
        assert_eq!(result, "今天天气不错");
    }
}
