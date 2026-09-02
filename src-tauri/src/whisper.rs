use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// Configuration for the offline Whisper engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperConfig {
    /// Path to the GGML model file
    pub model_path: String,
    /// Language hint (e.g. "zh", "en", "auto")
    pub language: String,
    /// Number of threads to use (0 = auto)
    pub n_threads: u32,
    /// Enable translate mode (transcribe to English)
    pub translate: bool,
    /// Initial prompt for the model
    pub prompt: String,
}

impl Default for WhisperConfig {
    fn default() -> Self {
        Self {
            model_path: String::new(),
            language: "auto".to_string(),
            n_threads: 0,
            translate: false,
            prompt: String::new(),
        }
    }
}

/// Result from offline transcription
#[derive(Debug, Clone, Serialize)]
pub struct WhisperResult {
    pub text: String,
    pub segments: Vec<WhisperSegment>,
    pub language: String,
    pub duration_sec: f64,
}

/// A single transcription segment with timing
#[derive(Debug, Clone, Serialize)]
pub struct WhisperSegment {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

/// Offline Whisper transcription engine
pub struct WhisperEngine {
    config: Mutex<WhisperConfig>,
}

impl WhisperEngine {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(WhisperConfig::default()),
        }
    }

    /// Update the engine configuration
    pub fn set_config(&self, config: WhisperConfig) {
        let mut cfg = self.config.lock().unwrap_or_else(|e| e.into_inner());
        *cfg = config;
    }

    /// Get current configuration
    pub fn get_config(&self) -> WhisperConfig {
        self.config.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Check if a valid model is loaded
    pub fn is_model_loaded(&self) -> bool {
        let cfg = self.config.lock().unwrap_or_else(|e| e.into_inner());
        !cfg.model_path.is_empty() && std::path::Path::new(&cfg.model_path).exists()
    }

    /// Get the model directory (~/.whisp/models/)
    pub fn model_dir() -> Result<PathBuf> {
        let dir = crate::data_dir().join("models");
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create model directory: {}", dir.display()))?;
        Ok(dir)
    }

    /// Get total disk usage of all downloaded models in bytes
    pub fn total_model_size() -> Result<u64> {
        let models = Self::list_models()?;
        Ok(models.iter().map(|m| m.size_bytes).sum())
    }

    /// Delete a downloaded model file by name
    pub fn delete_model(model_name: &str) -> Result<()> {
        let dir = Self::model_dir()?;
        let path = dir.join(format!("{}.bin", model_name));
        if path.exists() {
            std::fs::remove_file(&path).with_context(|| format!("Failed to delete model: {}", path.display()))?;
            log::info!("Deleted model: {}", path.display());
            Ok(())
        } else {
            anyhow::bail!("Model file not found: {}", path.display());
        }
    }

    /// List available GGML model files
    pub fn list_models() -> Result<Vec<ModelInfo>> {
        let dir = Self::model_dir()?;
        let mut models = Vec::new();

        if dir.exists() {
            for entry in std::fs::read_dir(&dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "bin" || ext == "ggml") {
                    let name = path
                        .file_stem()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    models.push(ModelInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        size_bytes: size,
                    });
                }
            }
        }

        models.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(models)
    }

    /// Transcribe audio data using the offline Whisper engine
    /// This is a placeholder that will be connected to whisper-rs when the feature is enabled
    pub fn transcribe(&self, audio_data: &[f32], sample_rate: u32) -> Result<WhisperResult> {
        let cfg = self.config.lock().unwrap_or_else(|e| e.into_inner());

        if cfg.model_path.is_empty() {
            anyhow::bail!("No Whisper model configured. Please download a model first.");
        }

        if !std::path::Path::new(&cfg.model_path).exists() {
            anyhow::bail!(
                "Model file not found: {}. Please download the model again.",
                cfg.model_path
            );
        }

        if audio_data.is_empty() {
            anyhow::bail!("Audio data is empty, nothing to transcribe.");
        }

        if sample_rate == 0 {
            anyhow::bail!("Invalid sample rate: 0. Audio data may be corrupted.");
        }

        // Resample to 16kHz if needed (Whisper expects 16kHz)
        let audio_16k = if sample_rate != 16000 {
            resample_to_16k(audio_data, sample_rate)
        } else {
            audio_data.to_vec()
        };

        #[cfg(feature = "offline-whisper")]
        {
            self.transcribe_with_whisper_rs(&audio_16k, &cfg)
        }

        #[cfg(not(feature = "offline-whisper"))]
        {
            let _ = &audio_16k;
            anyhow::bail!(
                "Offline Whisper engine is not enabled in this build. \
                 Rebuild with --features offline-whisper to enable local transcription."
            )
        }
    }

    #[cfg(feature = "offline-whisper")]
    fn transcribe_with_whisper_rs(&self, audio: &[f32], config: &WhisperConfig) -> Result<WhisperResult> {
        use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

        let ctx = WhisperContext::new_with_params(&config.model_path, WhisperContextParameters::default())
            .with_context(|| "Failed to load Whisper model")?;

        let mut state = ctx.create_state().with_context(|| "Failed to create Whisper state")?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        let n_threads = if config.n_threads == 0 {
            std::thread::available_parallelism()
                .map(|n| n.get() as i32)
                .unwrap_or(4)
        } else {
            config.n_threads as i32
        };
        log::info!("Whisper transcription using {} threads", n_threads);
        params.set_n_threads(n_threads);
        params.set_language(if config.language == "auto" {
            None
        } else {
            Some(&config.language)
        });
        params.set_translate(config.translate);

        if !config.prompt.is_empty() {
            params.set_initial_prompt(&config.prompt);
        }

        state
            .full(params, audio)
            .with_context(|| "Whisper transcription failed")?;

        let num_segments = state.full_n_segments()?;
        let mut segments = Vec::new();
        let mut full_text = String::new();

        for i in 0..num_segments {
            let text = state.full_get_segment_text(i)?;
            let start = state.full_get_segment_t0(i)? as i64 * 10; // convert to ms
            let end = state.full_get_segment_t1(i)? as i64 * 10;

            full_text.push_str(&text);
            segments.push(WhisperSegment {
                start_ms: start,
                end_ms: end,
                text: text.trim().to_string(),
            });
        }

        let duration_sec = audio.len() as f64 / 16000.0;

        Ok(WhisperResult {
            text: full_text.trim().to_string(),
            segments,
            language: config.language.clone(),
            duration_sec,
        })
    }
}

/// Model information for the UI
#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Known Whisper models and their download URLs
/// Tuple: (name, url, size, description_en, description_zh, languages, params)
pub const KNOWN_MODELS: &[(&str, &str, u64, &str, &str, &str, &str)] = &[
    (
        "ggml-tiny.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
        77_871_433,
        "Smallest model, English only. Fast but less accurate.",
        "最小模型，仅英文。速度快但准确率较低。",
        "English",
        "39M",
    ),
    (
        "ggml-tiny",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        77_871_713,
        "Smallest multilingual model. Fast, basic accuracy. Good for real-time.",
        "最小型多语言模型。速度快，基础准确率。适合实时转写。",
        "97 languages",
        "39M",
    ),
    (
        "ggml-base.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        147_964_741,
        "English only. Better accuracy than tiny, moderate speed.",
        "仅英文。比 tiny 准确率更高，速度适中。",
        "English",
        "74M",
    ),
    (
        "ggml-base",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        147_964_461,
        "Multilingual. Good balance of speed and accuracy. Supports Chinese.",
        "多语言。速度与准确率平衡。支持中文。",
        "97 languages",
        "74M",
    ),
    (
        "ggml-small.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
        483_629_333,
        "English only. Good accuracy for clean audio.",
        "仅英文。对清晰音频有较好的准确率。",
        "English",
        "244M",
    ),
    (
        "ggml-small",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        483_630_133,
        "Multilingual. Decent accuracy, supports Chinese. Recommended minimum.",
        "多语言。准确率良好，支持中文。推荐最低配置。",
        "97 languages",
        "244M",
    ),
    (
        "ggml-medium.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
        1_539_325_485,
        "English only. Strong accuracy, larger model.",
        "仅英文。准确率强，模型较大。",
        "English",
        "769M",
    ),
    (
        "ggml-medium",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        1_539_325_205,
        "Multilingual. Strong accuracy. Good for Chinese transcription. ★ Recommended.",
        "多语言。准确率强。中文转写效果好。★ 推荐。",
        "97 languages",
        "769M",
    ),
    (
        "ggml-large-v3-turbo",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
        1_625_682_453,
        "Large model, 8x faster than large-v3. Excellent Chinese accuracy. ★ Best for Chinese.",
        "大型模型，比 large-v3 快 8 倍。中文准确率极高。★ 中文最佳。",
        "97 languages",
        "809M",
    ),
];

/// List available models that can be downloaded
pub fn list_known_models(ui_language: &str) -> Vec<KnownModel> {
    let is_zh = ui_language.starts_with("zh");
    KNOWN_MODELS
        .iter()
        .map(|(name, url, size, desc_en, desc_zh, languages, params)| KnownModel {
            name: name.to_string(),
            url: url.to_string(),
            size_bytes: *size,
            description: if is_zh {
                desc_zh.to_string()
            } else {
                desc_en.to_string()
            },
            languages: languages.to_string(),
            params: params.to_string(),
        })
        .collect()
}

/// Information about a known downloadable model
#[derive(Debug, Clone, Serialize)]
pub struct KnownModel {
    pub name: String,
    pub url: String,
    pub size_bytes: u64,
    pub description: String,
    pub languages: String,
    pub params: String,
}

/// Get total system memory in bytes using platform-specific APIs.
/// Returns 0 if detection fails (conservative fallback).
fn total_memory_bytes() -> u64 {
    #[cfg(target_os = "macos")]
    {
        // macOS: sysctl hw.memsize
        std::process::Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(0)
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: parse MemTotal from /proc/meminfo
        std::fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|content| {
                content.lines().find_map(|line| {
                    line.strip_prefix("MemTotal:").and_then(|rest| {
                        let kb: u64 = rest.split_whitespace().next()?.parse().ok()?;
                        Some(kb * 1024)
                    })
                })
            })
            .unwrap_or(0)
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: use GetPhysicallyInstalledSystemMemory via PowerShell
        std::process::Command::new("powershell")
            .args(["-Command", "(Get-CimInstance Win32_PhysicalMemoryArray).MaxCapacity"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .map(|kb| kb * 1024)
            .unwrap_or(0)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        0
    }
}

/// Recommendation result returned to the frontend
#[derive(Debug, Clone, Serialize)]
pub struct ModelRecommendation {
    /// The recommended model name (e.g. "ggml-base")
    pub recommended: String,
    /// Total system memory in bytes (0 if unknown)
    pub total_memory_bytes: u64,
    /// Human-readable reason for the recommendation
    pub reason: String,
}

/// Recommend a Whisper model based on available system memory.
///
/// - < 8 GB RAM  → ggml-tiny   (smallest, fastest, good for resource-limited machines)
/// - 8–16 GB RAM → ggml-base   (good balance of speed and accuracy)
/// - > 16 GB RAM → ggml-medium (strong accuracy, great for Chinese)
pub fn recommended_model() -> ModelRecommendation {
    let mem = total_memory_bytes();
    let mem_gb = mem as f64 / (1024.0 * 1024.0 * 1024.0);

    if mem == 0 {
        // Unknown memory — conservative default
        ModelRecommendation {
            recommended: "ggml-base".to_string(),
            total_memory_bytes: 0,
            reason: "System memory unknown; base model is a safe default.".to_string(),
        }
    } else if mem_gb < 8.0 {
        ModelRecommendation {
            recommended: "ggml-tiny".to_string(),
            total_memory_bytes: mem,
            reason: format!(
                "{:.1} GB RAM detected — tiny model recommended for machines with < 8 GB.",
                mem_gb
            ),
        }
    } else if mem_gb <= 16.0 {
        ModelRecommendation {
            recommended: "ggml-base".to_string(),
            total_memory_bytes: mem,
            reason: format!(
                "{:.1} GB RAM detected — base model offers a good speed/accuracy balance.",
                mem_gb
            ),
        }
    } else {
        ModelRecommendation {
            recommended: "ggml-medium".to_string(),
            total_memory_bytes: mem,
            reason: format!(
                "{:.1} GB RAM detected — medium model provides strong accuracy.",
                mem_gb
            ),
        }
    }
}

/// Minimum chunk size for rubato's sinc resampler
const RUBATO_CHUNK_SIZE: usize = 1024;

/// Resample audio to 16kHz using rubato sinc interpolation.
/// Falls back to linear interpolation for very short audio (< RUBATO_CHUNK_SIZE samples)
/// where rubato cannot operate.
fn resample_to_16k(audio: &[f32], from_rate: u32) -> Vec<f32> {
    if from_rate == 16000 {
        return audio.to_vec();
    }

    if audio.is_empty() {
        return Vec::new();
    }

    // For very short audio, rubato needs at least one full chunk; fall back to linear
    if audio.len() < RUBATO_CHUNK_SIZE {
        return resample_to_16k_linear(audio, from_rate);
    }

    resample_to_16k_sinc(audio, from_rate).unwrap_or_else(|e| {
        log::warn!("Sinc resample failed ({}), falling back to linear interpolation", e);
        resample_to_16k_linear(audio, from_rate)
    })
}

/// Sinc resampling using rubato's SincFixedIn resampler.
fn resample_to_16k_sinc(audio: &[f32], from_rate: u32) -> Result<Vec<f32>> {
    use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType};

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: rubato::WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(
        16000.0 / from_rate as f64,
        2.0, // max relative ratio (generous bound)
        params,
        RUBATO_CHUNK_SIZE,
        1, // mono channel
    )
    .with_context(|| "Failed to create rubato resampler")?;

    let expected_len = (audio.len() as f64 * 16000.0 / from_rate as f64).round() as usize;
    let mut output = Vec::with_capacity(expected_len + RUBATO_CHUNK_SIZE);
    let mut pos = 0;

    while pos < audio.len() {
        let end = (pos + RUBATO_CHUNK_SIZE).min(audio.len());
        let chunk = &audio[pos..end];

        if chunk.len() == RUBATO_CHUNK_SIZE {
            // Full chunk: use process()
            let input_frames = vec![chunk.to_vec()];
            let out_frames = resampler
                .process(&input_frames, None)
                .with_context(|| "rubato resample chunk failed")?;
            output.extend_from_slice(&out_frames[0]);
        } else {
            // Final partial chunk: use process_partial() which handles arbitrary sizes
            let input_frames = vec![chunk.to_vec()];
            let out_frames = resampler
                .process_partial(Some(&input_frames), None)
                .with_context(|| "rubato resample partial chunk failed")?;
            output.extend_from_slice(&out_frames[0]);
        }

        pos = end;
    }

    // Flush any remaining samples in the resampler's internal buffer
    let mut remaining = resampler
        .process_partial::<Vec<f32>>(None, None)
        .with_context(|| "rubato flush failed")?;
    if let Some(flushed) = remaining.pop() {
        output.extend_from_slice(&flushed);
    }

    // Trim to expected length — rubato's internal latency buffering can add extra samples
    output.truncate(expected_len);
    Ok(output)
}

/// Fallback linear interpolation resampling for short audio
fn resample_to_16k_linear(audio: &[f32], from_rate: u32) -> Vec<f32> {
    let ratio = from_rate as f64 / 16000.0;
    let output_len = (audio.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let pos = i as f64 * ratio;
        let idx = pos as usize;
        let frac = pos - idx as f64;

        let sample = if idx + 1 < audio.len() {
            audio[idx] * (1.0 - frac as f32) + audio[idx + 1] * frac as f32
        } else if idx < audio.len() {
            audio[idx]
        } else {
            0.0
        };
        output.push(sample);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whisper_config_default() {
        let config = WhisperConfig::default();
        assert_eq!(config.language, "auto");
        assert_eq!(config.n_threads, 0);
        assert!(!config.translate);
    }

    #[test]
    fn test_whisper_engine_new() {
        let engine = WhisperEngine::new();
        assert!(!engine.is_model_loaded());
    }

    #[test]
    fn test_resample_same_rate() {
        let audio = vec![0.0, 0.5, 1.0, 0.5];
        let resampled = resample_to_16k(&audio, 16000);
        assert_eq!(audio, resampled);
    }

    #[test]
    fn test_resample_downsample() {
        let audio: Vec<f32> = (0..48000).map(|i| (i as f32 / 48000.0)).collect();
        let resampled = resample_to_16k(&audio, 48000);
        // After trimming to expected length, should be exactly 16000
        assert_eq!(resampled.len(), 16000, "Expected exactly 16000, got {}", resampled.len());
    }

    #[test]
    fn test_resample_empty() {
        let audio: Vec<f32> = vec![];
        let resampled = resample_to_16k(&audio, 44100);
        assert!(resampled.is_empty());
    }

    #[test]
    fn test_resample_sinc_quality() {
        // Generate a 440Hz sine wave at 48kHz, 1 second long
        let sr = 48000u32;
        let freq = 440.0f64;
        let duration = 1.0f64;
        let n_samples = (sr as f64 * duration) as usize;
        let audio: Vec<f32> = (0..n_samples)
            .map(|i| (2.0 * std::f64::consts::PI * freq * i as f64 / sr as f64).sin() as f32)
            .collect();

        let resampled = resample_to_16k(&audio, sr);

        // The resampled signal should be exactly 1 second at 16kHz
        assert_eq!(resampled.len(), 16000, "Expected exactly 16000, got {}", resampled.len());

        // Count zero crossings to estimate dominant frequency
        let mut zero_crossings = 0usize;
        for i in 1..resampled.len() {
            if (resampled[i - 1] >= 0.0 && resampled[i] < 0.0)
                || (resampled[i - 1] < 0.0 && resampled[i] >= 0.0)
            {
                zero_crossings += 1;
            }
        }

        // Each cycle has 2 zero crossings; frequency = crossings / (2 * duration)
        let estimated_freq = zero_crossings as f64 / (2.0 * duration);
        // Allow ±15% tolerance (resampling + discrete counting introduces some error)
        assert!(
            (estimated_freq - freq).abs() / freq < 0.15,
            "Expected ~{}Hz, estimated {}Hz (zero_crossings={})",
            freq,
            estimated_freq,
            zero_crossings
        );
    }
}
