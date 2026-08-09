//! 插件系统：基于 JSON manifest 的 stdin/stdout IPC 插件协议。
//! 插件安装在 ~/.whisp/plugins/<name>/ 目录下，包含 plugin.json 清单文件。
//!
//! 插件清单格式 (plugin.json):
//! ```json
//! {
//!   "name": "my-plugin",
//!   "version": "1.0.0",
//!   "description": "A post-transcription plugin",
//!   "hooks": ["post-transcription"],
//!   "command": "python3",
//!   "args": ["main.py"],
//!   "env": {}
//! }
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

/// 插件清单，从 plugin.json 反序列化。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plugin {
    /// 插件唯一名称（对应目录名）
    pub name: String,
    /// 语义化版本号
    pub version: String,
    /// 插件描述
    #[serde(default)]
    pub description: String,
    /// 挂载的钩子名称列表，如 ["post-transcription"]
    #[serde(default)]
    pub hooks: Vec<String>,
    /// 可执行程序（如 "python3", "node", "/usr/bin/bash"）
    pub command: String,
    /// 命令行参数
    #[serde(default)]
    pub args: Vec<String>,
    /// 额外的环境变量
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// 是否启用（运行时判断，不从 JSON 反序列化）
    #[serde(skip)]
    pub enabled: bool,
    /// 插件目录路径（运行时填充，不从 JSON 反序列化）
    #[serde(skip)]
    pub plugin_dir: PathBuf,
}

/// 插件执行结果。
#[derive(Debug, Clone, Serialize)]
pub struct PluginResult {
    /// 插件名称
    pub plugin_name: String,
    /// 处理后的文本（成功时）
    pub output: Option<String>,
    /// 错误信息（失败时）
    pub error: Option<String>,
    /// 是否成功
    pub success: bool,
}

/// 获取插件根目录：~/.whisp/plugins/
pub fn plugins_dir() -> PathBuf {
    crate::data_dir().join("plugins")
}

/// 扫描 ~/.whisp/plugins/ 目录，发现并返回所有已安装插件。
/// 忽略没有 plugin.json 或 JSON 解析失败的目录。
pub fn list_plugins() -> Vec<Plugin> {
    let dir = plugins_dir();
    if !dir.exists() {
        return Vec::new();
    }

    let mut plugins = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let manifest_path = path.join("plugin.json");
            if !manifest_path.exists() {
                log::warn!("插件目录 {} 缺少 plugin.json，已跳过", path.display());
                continue;
            }
            match std::fs::read_to_string(&manifest_path) {
                Ok(content) => match serde_json::from_str::<Plugin>(&content) {
                    Ok(mut plugin) => {
                        plugin.plugin_dir = path.clone();
                        plugin.enabled = true;
                        log::info!("发现插件: {} v{} ({})", plugin.name, plugin.version, path.display());
                        plugins.push(plugin);
                    }
                    Err(e) => {
                        log::warn!("解析插件清单失败 {}: {}", manifest_path.display(), e);
                    }
                },
                Err(e) => {
                    log::warn!("读取插件清单失败 {}: {}", manifest_path.display(), e);
                }
            }
        }
    }

    // 按名称排序，保证确定性
    plugins.sort_by(|a, b| a.name.cmp(&b.name));
    plugins
}

/// 运行指定钩子的所有插件。
/// 每个插件的 stdin 接收 input_text，stdout 被捕获作为输出。
/// 如果插件输出非空文本，则替换 input_text 传递给下一个插件（管道式）。
/// 单个插件超时时间为 30 秒，超时则跳过该插件并使用原文本。
///
/// 返回最终的文本以及每个插件的执行结果列表。
pub async fn run_plugin_hook(hook_name: &str, input_text: &str) -> (String, Vec<PluginResult>) {
    let plugins = list_plugins();
    let mut current_text = input_text.to_string();
    let mut results = Vec::new();

    for plugin in &plugins {
        // 检查插件是否订阅了此钩子
        if !plugin.hooks.iter().any(|h| h == hook_name) {
            continue;
        }

        if !plugin.enabled {
            continue;
        }

        log::info!(
            "执行插件 {} 的钩子 {}: {} {}",
            plugin.name,
            hook_name,
            plugin.command,
            plugin.args.join(" ")
        );

        match execute_plugin(plugin, &current_text).await {
            Ok(output) => {
                let trimmed = output.trim().to_string();
                if trimmed.is_empty() {
                    log::info!("插件 {} 返回空输出，保留原文本", plugin.name);
                    results.push(PluginResult {
                        plugin_name: plugin.name.clone(),
                        output: None,
                        error: None,
                        success: true,
                    });
                } else {
                    log::info!(
                        "插件 {} 处理完成，输入 {} 字符 -> 输出 {} 字符",
                        plugin.name,
                        current_text.len(),
                        trimmed.len()
                    );
                    current_text = trimmed;
                    results.push(PluginResult {
                        plugin_name: plugin.name.clone(),
                        output: Some(current_text.clone()),
                        error: None,
                        success: true,
                    });
                }
            }
            Err(e) => {
                log::warn!("插件 {} 执行失败: {}", plugin.name, e);
                results.push(PluginResult {
                    plugin_name: plugin.name.clone(),
                    output: None,
                    error: Some(e),
                    success: false,
                });
            }
        }
    }

    (current_text, results)
}

/// 执行单个插件：通过 stdin 传入文本，捕获 stdout，30 秒超时。
async fn execute_plugin(plugin: &Plugin, input: &str) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new(&plugin.command);
    cmd.args(&plugin.args);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.current_dir(&plugin.plugin_dir);

    // 设置环境变量
    for (key, value) in &plugin.env {
        cmd.env(key, value);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("无法启动插件进程 {}: {}", plugin.command, e))?;

    // 写入 stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin
            .write_all(input.as_bytes())
            .await
            .map_err(|e| format!("写入 stdin 失败: {}", e))?;
        // stdin 会在 drop 时自动关闭
    }

    // 等待进程退出，30 秒超时
    let timeout = Duration::from_secs(30);
    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| format!("插件 {} 执行超时（30秒）", plugin.name))?
        .map_err(|e| format!("等待插件进程失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let code = output.status.code().unwrap_or(-1);
        return Err(format!("插件 {} 退出码 {}: {}", plugin.name, code, stderr.trim()));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("插件 {} 输出不是有效的 UTF-8: {}", plugin.name, e))?;

    Ok(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plugin_deserialize() {
        let json = r#"{
            "name": "test-plugin",
            "version": "1.0.0",
            "description": "A test plugin",
            "hooks": ["post-transcription"],
            "command": "python3",
            "args": ["main.py"],
            "env": {"KEY": "value"}
        }"#;
        let plugin: Plugin = serde_json::from_str(json).unwrap();
        assert_eq!(plugin.name, "test-plugin");
        assert_eq!(plugin.version, "1.0.0");
        assert_eq!(plugin.hooks, vec!["post-transcription"]);
        assert_eq!(plugin.command, "python3");
        assert_eq!(plugin.args, vec!["main.py"]);
        assert_eq!(plugin.env.get("KEY").unwrap(), "value");
    }

    #[test]
    fn test_plugin_deserialize_minimal() {
        let json = r#"{
            "name": "minimal",
            "version": "0.1.0",
            "command": "cat"
        }"#;
        let plugin: Plugin = serde_json::from_str(json).unwrap();
        assert_eq!(plugin.name, "minimal");
        assert!(plugin.hooks.is_empty());
        assert!(plugin.args.is_empty());
        assert!(plugin.env.is_empty());
        assert!(plugin.description.is_empty());
    }
}
