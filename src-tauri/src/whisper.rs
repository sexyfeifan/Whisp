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
            let text = state.get_segment_text(i)?;
            let start = state.get_segment_t0(i)? as i64 * 10; // convert to ms
            let end = state.get_segment_t1(i)? as i64 * 10;

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
const KNOWN_MODELS: &[(&str, &str, u64)] = &[
    (
        "ggml-tiny.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
        77_871_433,
    ),
    (
        "ggml-tiny",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        77_871_713,
    ),
    (
        "ggml-base.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        147_964_741,
    ),
    (
        "ggml-base",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        147_964_461,
    ),
    (
        "ggml-small.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
        483_629_333,
    ),
    (
        "ggml-small",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        483_630_133,
    ),
    (
        "ggml-medium.en",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
        1_539_325_485,
    ),
    (
        "ggml-medium",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        1_539_325_205,
    ),
];

/// Download a Whisper model file from the HuggingFace hub.
/// `model_name` should be one of the known model stems (e.g. "ggml-tiny.en").
pub async fn download_model(client: &reqwest::Client, model_name: &str) -> Result<PathBuf> {
    let model_dir = WhisperEngine::model_dir()?;

    // Check known models first
    let url = if let Some((_, url, _)) = KNOWN_MODELS.iter().find(|(name, _, _)| *name == model_name) {
        url
    } else {
        // Assume it's a direct URL or a known model name with default base URL
        if model_name.starts_with("http://") || model_name.starts_with("https://") {
            model_name
        } else {
            anyhow::bail!(
                "Unknown model: {}. Available models: {}",
                model_name,
                KNOWN_MODELS.iter().map(|(n, _, _)| *n).collect::<Vec<_>>().join(", ")
            );
        }
    };

    let file_name = if url.ends_with(".bin") {
        url.rsplit_once('/').map(|(_, name)| name).unwrap_or("model.bin")
    } else {
        "model.bin"
    };

    let dest_path = model_dir.join(file_name);

    if dest_path.exists() {
        log::info!("Model already exists at {}", dest_path.display());
        return Ok(dest_path);
    }

    log::info!("Downloading model from {} to {}", url, dest_path.display());

    let response = client
        .get(url)
        .timeout(std::time::Duration::from_secs(1800))
        .send()
        .await
        .with_context(|| format!("Failed to download model from {}", url))?;

    if !response.status().is_success() {
        anyhow::bail!("Download failed with HTTP {} for {}", response.status(), url);
    }

    let total_size = response.content_length().unwrap_or(0);
    let dest_path_tmp = dest_path.with_extension("part");

    // Stream download to avoid loading entire model into memory
    let mut file = std::fs::File::create(&dest_path_tmp)
        .with_context(|| format!("Failed to create temp file: {}", dest_path_tmp.display()))?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = response.chunk().await.transpose() {
        let bytes = chunk.with_context(|| "Failed to read chunk")?;
        file.write_all(&bytes).with_context(|| "Failed to write chunk")?;
        downloaded += bytes.len() as u64;
        if total_size > 0 {
            log::info!(
                "Download progress: {:.1}% ({:.1} MB / {:.1} MB)",
                (downloaded as f64 / total_size as f64) * 100.0,
                downloaded as f64 / 1_048_576.0,
                total_size as f64 / 1_048_576.0
            );
        }
    }

    file.flush().with_context(|| "Failed to flush file")?;
    drop(file);

    // Verify downloaded size
    if total_size > 0 && downloaded != total_size {
        let _ = std::fs::remove_file(&dest_path_tmp);
        anyhow::bail!("Download incomplete: expected {} bytes, got {}", total_size, downloaded);
    }

    std::fs::rename(&dest_path_tmp, &dest_path).with_context(|| {
        format!(
            "Failed to rename {} to {}",
            dest_path_tmp.display(),
            dest_path.display()
        )
    })?;

    log::info!(
        "Model downloaded: {} ({:.1} MB)",
        file_name,
        downloaded as f64 / 1_048_576.0
    );

    Ok(dest_path)
}

/// List available models that can be downloaded
pub fn list_known_models() -> Vec<KnownModel> {
    KNOWN_MODELS
        .iter()
        .map(|(name, url, size)| KnownModel {
            name: name.to_string(),
            url: url.to_string(),
            size_bytes: *size,
        })
        .collect()
}

/// Information about a known downloadable model
#[derive(Debug, Clone, Serialize)]
pub struct KnownModel {
    pub name: String,
    pub url: String,
    pub size_bytes: u64,
}

/// Resample audio to 16kHz using linear interpolation
fn resample_to_16k(audio: &[f32], from_rate: u32) -> Vec<f32> {
    if from_rate == 16000 {
        return audio.to_vec();
    }

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
        // Should be approximately 16000 samples
        assert!((resampled.len() as i32 - 16000).unsigned_abs() <= 1);
    }

    #[test]
    fn test_resample_empty() {
        let audio: Vec<f32> = vec![];
        let resampled = resample_to_16k(&audio, 44100);
        assert!(resampled.is_empty());
    }
}
