use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::ffmpeg::find_ffmpeg_path;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Probe media metadata without making the absence of a timecode a transcription error.
#[tauri::command]
pub async fn probe_media_timecode(path: String) -> Result<String, String> {
    match tokio::task::spawn_blocking(move || probe_media_timecode_sync(path)).await {
        Ok(output) => Ok(output),
        Err(_) => Ok(String::new()),
    }
}

fn probe_media_timecode_sync(path: String) -> String {
    let input = PathBuf::from(path);
    if !input.is_file() {
        return String::new();
    }

    let mut candidates = Vec::new();
    if let Ok(path) = which::which(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" }) {
        candidates.push(path);
    }
    if let Some(ffmpeg) = find_ffmpeg_path() {
        if let Some(parent) = ffmpeg.parent() {
            let name = if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" };
            let sibling = parent.join(name);
            if sibling.is_file() && !candidates.contains(&sibling) {
                candidates.push(sibling);
            }
        }
    }

    for ffprobe in candidates {
        let output = hidden_command(&mut Command::new(ffprobe))
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,codec_tag_string,r_frame_rate,avg_frame_rate:stream_tags=timecode:format_tags=timecode",
                "-of",
                "json",
            ])
            .arg(&input)
            .output();
        if let Ok(output) = output {
            if output.status.success() {
                return String::from_utf8_lossy(&output.stdout).into_owned();
            }
        }
    }

    let Some(ffmpeg) = find_ffmpeg_path() else {
        return String::new();
    };
    let output = hidden_command(&mut Command::new(ffmpeg))
        .args(["-hide_banner", "-nostdin", "-i"])
        .arg(input)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output();
    match output {
        Ok(output) => format!("FFMPEG_BANNER\n{}", String::from_utf8_lossy(&output.stderr)),
        Err(_) => String::new(),
    }
}

#[cfg(windows)]
fn hidden_command(command: &mut Command) -> &mut Command {
    command.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(windows))]
fn hidden_command(command: &mut Command) -> &mut Command {
    command
}
