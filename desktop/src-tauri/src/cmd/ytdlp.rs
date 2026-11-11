use crate::ffmpeg::get_vibe_temp_folder;
use eyre::{bail, Context, ContextCompat, Result};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::error::LogError;

use super::files::get_ffmpeg_path;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Stdio;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn get_binary_name() -> &'static str {
    if cfg!(windows) {
        if cfg!(target_arch = "aarch64") {
            "yt-dlp_arm64.exe"
        } else {
            "yt-dlp.exe"
        }
    } else if cfg!(target_os = "linux") {
        if cfg!(target_arch = "aarch64") {
            "yt-dlp_linux_aarch64"
        } else {
            "yt-dlp_linux"
        }
    } else {
        "yt-dlp_macos"
    }
}

#[tauri::command]
pub async fn get_latest_ytdlp_version() -> Result<String> {
    let client = reqwest::Client::builder().user_agent("vibe-app").build()?;
    let resp = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await?
        .error_for_status()?;
    let json: Value = resp.json().await?;
    let tag = json["tag_name"]
        .as_str()
        .context("missing tag_name in latest release response")?
        .to_string();
    Ok(tag)
}

/// A yt-dlp release tag: calendar digits and dots, e.g. `2026.08.19` or `2026.08.19.1`.
fn is_release_tag(version: &str) -> bool {
    !version.is_empty() && version.len() <= 20 && version.chars().all(|c| c.is_ascii_digit() || c == '.')
}

/// The hash for `asset` in a release's `SHA2-256SUMS` (`<hex>  <name>` per line).
fn checksum_for(sums: &str, asset: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hash, name) = line.split_once(char::is_whitespace)?;
        let valid = hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit());
        (valid && name.trim().trim_start_matches('*') == asset).then(|| hash.to_ascii_lowercase())
    })
}

/// Install yt-dlp `version` for this platform into the app's data folder. The binary is checked
/// against the SHA-256 the release publishes in `SHA2-256SUMS`, and a mismatch keeps the old one
/// (IT review M7). Replaces a generic download command that fetched any URL to any path.
#[tauri::command]
pub async fn install_ytdlp(app_handle: AppHandle, version: String) -> Result<()> {
    if !is_release_tag(&version) {
        bail!("invalid yt-dlp version: {version}");
    }
    let name = get_binary_name();
    let base = format!("https://github.com/yt-dlp/yt-dlp/releases/download/{version}");
    let client = reqwest::Client::builder().user_agent("vibe-app").build()?;
    let sums = client
        .get(format!("{base}/SHA2-256SUMS"))
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let sha256 = checksum_for(&sums, name).with_context(|| format!("no checksum for {name} in yt-dlp {version}"))?;
    let destination = app_handle
        .path()
        .app_local_data_dir()
        .context("Can't get data directory")?
        .join(name);
    let integrity = super::download::DownloadIntegrity {
        size: None,
        sha256: Some(sha256),
    };
    match super::download::download_to_partial(&app_handle, &format!("{base}/{name}"), &destination, &integrity, false).await? {
        super::download::DownloadOutcome::Completed => Ok(()),
        super::download::DownloadOutcome::Cancelled => bail!("Download cancelled"),
    }
}

/// Only web links go to yt-dlp; anything else (a local path, `file:`, an option) is refused.
fn is_web_link(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

#[tauri::command]
pub fn get_temp_path(ext: String) -> String {
    let mut base_path = get_vibe_temp_folder();
    let extension = ext.trim_start_matches('.');
    let extension =
        if !extension.is_empty() && extension.len() <= 10 && extension.chars().all(|character| character.is_ascii_alphanumeric())
        {
            extension.to_ascii_lowercase()
        } else {
            "m4a".to_string()
        };

    base_path.push(format!(
        "{}-{}.{}",
        crate::ffmpeg::get_local_time(),
        crate::ffmpeg::random_string(10),
        extension
    ));
    base_path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn release_tags_are_calendar_versions_only() {
        assert!(is_release_tag("2026.08.19"));
        assert!(is_release_tag("2026.08.19.1"));
        assert!(!is_release_tag("../../evil"));
        assert!(!is_release_tag("latest"));
        assert!(!is_release_tag(""));
    }

    #[test]
    fn checksums_are_picked_by_exact_asset_name() {
        let sums = "e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3  yt-dlp\n\
                    f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d  yt-dlp.exe\n\
                    0066dbac3c124028e2dcae2a197fccee33cd91f456313d24f7af89fd54590e98  yt-dlp_arm64.exe\n";
        assert_eq!(
            checksum_for(sums, "yt-dlp.exe").as_deref(),
            Some("f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d")
        );
        assert_eq!(checksum_for(sums, "yt-dlp_macos"), None);
    }

    #[test]
    fn only_web_links_reach_yt_dlp() {
        assert!(is_web_link("https://www.youtube.com/watch?v=x"));
        assert!(is_web_link("HTTP://example.com/a"));
        assert!(!is_web_link("--exec=calc"));
        assert!(!is_web_link("file:///etc/passwd"));
        assert!(!is_web_link("C:\\Users\\a.mp4"));
    }

    #[test]
    fn download_paths_are_always_staged_in_vibe_temp() {
        let path = PathBuf::from(get_temp_path("m4a".to_string()));

        assert_eq!(path.parent(), Some(get_vibe_temp_folder().as_path()));
        assert_eq!(path.extension().and_then(|ext| ext.to_str()), Some("m4a"));
    }

    #[test]
    fn concurrent_downloads_receive_distinct_safe_paths() {
        let first = get_temp_path("../wav".to_string());
        let second = get_temp_path("../wav".to_string());

        assert_ne!(first, second);
        assert_eq!(PathBuf::from(first).extension().and_then(|ext| ext.to_str()), Some("m4a"));
    }
}

#[tauri::command]
pub async fn download_audio(app_handle: AppHandle, url: String, out_path: String) -> Result<()> {
    tracing::debug!("download audio {}", url);
    if !is_web_link(&url) {
        bail!("Only http(s) links can be downloaded");
    }
    let name = get_binary_name();
    let path = app_handle.path().app_local_data_dir().context("Can't get data directory")?;
    let path = path.join(name);
    tracing::debug!("path is {}", path.display());
    let ffmpeg_path = get_ffmpeg_path();

    // Set permission
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = std::fs::metadata(path.clone())?;
        let mut perm = meta.permissions();
        // chmod +x
        perm.set_mode(0o755);
        std::fs::set_permissions(path.clone(), perm)?;
    }

    let mut cmd = std::process::Command::new(path);
    let cmd = cmd
        .args([
            "--progress-template",
            "{\"progress\": \"%(progress.percent)s\", \"total_bytes\": \"%(progress.total_bytes)s\", \"progress_str\": \"%(progress._percent_str)s\"}\n",
            "--no-playlist",
            "-x",
            "--audio-format",
            "m4a",
            "--ffmpeg-location",
            &ffmpeg_path,
            "-o",
            &out_path,
            // Everything after `--` is a link, never an option (IT review M7).
            "--",
            url.trim(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    let cmd = cmd.creation_flags(CREATE_NO_WINDOW);

    let cancel_flag = std::sync::Arc::new(AtomicBool::new(false));
    let cancel_flag_c = cancel_flag.clone();
    app_handle.once("ytdlp-cancel", move |_| {
        cancel_flag_c.store(true, Ordering::Relaxed);
    });

    let mut child = cmd.spawn()?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);

        // yt-dlp can print bytes that are not UTF-8 (a title in the platform's code page on
        // Windows), and `lines()` would abort the whole download on the first one.
        for line in reader.split(b'\n') {
            if cancel_flag.load(Ordering::Relaxed) {
                let _ = child.kill();
                break;
            }

            let mut line = String::from_utf8_lossy(&line?).into_owned();
            line = line.replace("\r", "").trim().to_string();

            if line.starts_with("{\"progress") {
                // try parse progress
                let result: Result<Value, _> = serde_json::from_str(&line);
                if let Ok(value) = result {
                    // remove % and parse to number
                    let percentage_str = value["progress_str"].as_str().unwrap_or_default().trim().replace("%", "");
                    if let Ok(percentage_number) = percentage_str.parse::<f32>() {
                        app_handle
                            .emit("ytdlp-progress", percentage_number)
                            .context("failed to emit")
                            .log_error();
                    }
                }
            }
        }
    }

    let ret = child.wait()?;
    if !ret.success() && !cancel_flag.load(Ordering::Relaxed) {
        let mut stderr_output: String = "".to_string();
        if let Some(stderr) = child.stderr.take() {
            stderr_output = BufReader::new(stderr)
                .split(b'\n')
                .map_while(Result::ok)
                .map(|line| String::from_utf8_lossy(&line).into_owned())
                .collect::<Vec<_>>()
                .join("\n");
            eprintln!("Error: {}", stderr_output);
        }
        bail!("Failed to download audio: {}", stderr_output);
    }
    Ok(())
}
