//! Render a copy of a video with the running source timecode burned into the picture
//! (white text on a black box, bottom right) and the start timecode written as a tmcd track.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::ffmpeg::{find_ffmpeg_path, get_vibe_temp_folder, random_string};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Burn-in layout, relative to the picture height so it looks the same at any resolution.
const FONT_HEIGHT_RATIO: f64 = 0.063;
const BOX_PADDING_RATIO: f64 = 0.25; // of the font size
const MARGIN_RATIO: f64 = 0.03; // of the picture height

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BurnInRequest {
    /// Caller-chosen id; progress events and cancellation refer to it.
    pub id: String,
    pub input: String,
    /// Start timecode `HH:MM:SS:FF` (`;` before the frames for drop frame).
    pub timecode: String,
    pub fps_numerator: u32,
    pub fps_denominator: u32,
    pub drop_frame: bool,
    #[serde(default = "default_true")]
    pub wrap_at_24_hours: bool,
    #[serde(default)]
    pub position: BurnInPosition,
}

/// Horizontal placement of the box; it always sits at the bottom edge.
#[derive(Debug, Default, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BurnInPosition {
    #[default]
    Center,
    Right,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BurnInProgress {
    id: String,
    /// 0..100
    progress: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct MediaInfo {
    duration_seconds: Option<f64>,
    height: u32,
}

fn running() -> &'static Mutex<HashMap<String, Child>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Render the burned-in copy into Vibe's temp folder and return its path.
/// Runs as long as ffmpeg needs; `burn_in_progress` events report the percentage.
#[tauri::command]
pub async fn burn_in_timecode(app_handle: AppHandle, request: BurnInRequest) -> Result<String, String> {
    tokio::task::spawn_blocking(move || burn_in_sync(&app_handle, request))
        .await
        .map_err(|error| error.to_string())?
}

/// Stop a running render. Unknown ids are ignored, so a late cancel is harmless.
#[tauri::command]
pub fn cancel_burn_in(id: String) {
    let child = running().lock().ok().and_then(|mut map| map.remove(&id));
    if let Some(mut child) = child {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Copy a finished render to the location the user picked. The render itself stays in the temp
/// folder, so it can be saved again (another place, another name) until it is discarded.
#[tauri::command]
pub async fn save_burn_in(source: String, target: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let source = PathBuf::from(source);
        let target = PathBuf::from(target);
        if source == target {
            return Ok(());
        }
        std::fs::copy(&source, &target).map_err(|error| format!("Video konnte nicht gespeichert werden: {error}"))?;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Delete a render nobody wants any more.
#[tauri::command]
pub fn discard_burn_in(path: String) {
    let path = PathBuf::from(path);
    // Only ever delete our own temp renders.
    if path.starts_with(get_vibe_temp_folder().parent().unwrap_or(Path::new(""))) && is_burn_in_name(&path) {
        let _ = std::fs::remove_file(path);
    }
}

fn is_burn_in_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("burnin_"))
}

fn burn_in_sync(app_handle: &AppHandle, request: BurnInRequest) -> Result<String, String> {
    let ffmpeg = find_ffmpeg_path().ok_or("ffmpeg wurde nicht gefunden.")?;
    let input = PathBuf::from(&request.input);
    if !input.is_file() {
        return Err(format!("Videodatei nicht gefunden: {}", request.input));
    }
    let timecode = normalize_timecode(&request.timecode, request.drop_frame)
        .ok_or_else(|| format!("Ungültiger Start-Timecode: {}", request.timecode))?;
    if request.fps_numerator == 0 || request.fps_denominator == 0 {
        return Err("Ungültige Framerate.".into());
    }

    let capabilities = capabilities(&ffmpeg);
    if !capabilities.contains(" drawtext ") {
        return Err("Das verwendete ffmpeg unterstützt kein Einbrennen von Text (Filter „drawtext“ fehlt). Bitte ein ffmpeg mit libfreetype installieren.".into());
    }
    let encoder = pick_encoder(&capabilities).ok_or("Das verwendete ffmpeg hat keinen H.264-Encoder.")?;

    let info = probe(&ffmpeg, &input).ok_or("Videospur konnte nicht gelesen werden.")?;
    let filter = drawtext_filter(
        &timecode,
        request.fps_numerator,
        request.fps_denominator,
        request.wrap_at_24_hours,
        request.position,
        info.height,
        find_font().as_deref(),
    );

    let output = get_vibe_temp_folder().join(format!("burnin_{}.mp4", random_string(10)));
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-y".into(),
        crate::ffmpeg::INPUT_PROTOCOLS[0].into(),
        crate::ffmpeg::INPUT_PROTOCOLS[1].into(),
        "-i".into(),
        path_arg(&input),
    ];
    args.extend(["-map", "0:v:0", "-map", "0:a?", "-vf"].map(String::from));
    args.push(filter);
    args.extend(encoder_args(encoder, info.height));
    args.extend(audio_args(&input));
    args.extend(["-map_metadata", "0", "-timecode"].map(String::from));
    args.push(timecode.clone());
    args.extend(["-movflags", "+faststart", "-progress", "pipe:1", "-nostats"].map(String::from));
    args.push(path_arg(&output));

    tracing::debug!("burn-in: {} {:?}", ffmpeg.display(), args);
    let mut child = hidden(&mut Command::new(&ffmpeg))
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("ffmpeg konnte nicht gestartet werden: {error}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    if let Ok(mut map) = running().lock() {
        if let Some(mut previous) = map.insert(request.id.clone(), child) {
            let _ = previous.kill();
        }
    }

    // Drain stderr on its own thread so a chatty ffmpeg never blocks on a full pipe.
    let stderr_thread = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut stderr) = stderr {
            let _ = stderr.read_to_string(&mut text);
        }
        text
    });

    let mut last = -1.0;
    if let Some(stdout) = stdout {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Some(seconds) = progress_seconds(&line) else { continue };
            let Some(duration) = info.duration_seconds.filter(|duration| *duration > 0.0) else {
                continue;
            };
            let progress = (seconds / duration * 100.0).clamp(0.0, 99.9);
            if progress - last >= 0.5 {
                last = progress;
                let _ = app_handle.emit(
                    "burn_in_progress",
                    BurnInProgress {
                        id: request.id.clone(),
                        progress,
                    },
                );
            }
        }
    }

    let child = running().lock().ok().and_then(|mut map| map.remove(&request.id));
    let stderr_text = stderr_thread.join().unwrap_or_default();
    let Some(mut child) = child else {
        let _ = std::fs::remove_file(&output);
        return Err("cancelled".into());
    };
    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() {
        let _ = std::fs::remove_file(&output);
        return Err(format!("ffmpeg ist fehlgeschlagen:\n{}", tail(&stderr_text, 12)));
    }
    let _ = app_handle.emit(
        "burn_in_progress",
        BurnInProgress {
            id: request.id,
            progress: 100.0,
        },
    );
    Ok(output.to_string_lossy().into_owned())
}

fn hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn path_arg(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn tail(text: &str, lines: usize) -> String {
    let all: Vec<&str> = text.lines().filter(|line| !line.trim().is_empty()).collect();
    all[all.len().saturating_sub(lines)..].join("\n")
}

/// `ffmpeg -filters` and `-encoders` in one string, for feature checks.
fn capabilities(ffmpeg: &Path) -> String {
    let mut text = String::new();
    for flag in ["-filters", "-encoders"] {
        if let Ok(output) = hidden(&mut Command::new(ffmpeg))
            .args(["-hide_banner", flag])
            .stdin(Stdio::null())
            .output()
        {
            text.push_str(&String::from_utf8_lossy(&output.stdout));
        }
    }
    text
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Encoder {
    X264,
    VideoToolbox,
    MediaFoundation,
}

fn pick_encoder(capabilities: &str) -> Option<Encoder> {
    if capabilities.contains(" libx264 ") {
        return Some(Encoder::X264);
    }
    if cfg!(target_os = "macos") && capabilities.contains(" h264_videotoolbox ") {
        return Some(Encoder::VideoToolbox);
    }
    if cfg!(windows) && capabilities.contains(" h264_mf ") {
        return Some(Encoder::MediaFoundation);
    }
    None
}

/// MP4 sources carry MP4-compatible audio, which is copied untouched. Other containers may hold
/// PCM or codecs MP4 cannot take, so their audio is converted to high-bitrate AAC.
fn audio_args(input: &Path) -> Vec<String> {
    let extension = input
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let args: &[&str] = if matches!(extension.as_str(), "mp4" | "m4v") {
        &["-c:a", "copy"]
    } else {
        &["-c:a", "aac", "-b:a", "320k"]
    };
    args.iter().map(|arg| arg.to_string()).collect()
}

fn encoder_args(encoder: Encoder, height: u32) -> Vec<String> {
    // Hardware encoders take a bitrate; ~16 Mbit/s at 1080p keeps the copy visually lossless.
    let bitrate = format!("{}k", (u64::from(height.max(360)) * 15).max(4000));
    let args: Vec<&str> = match encoder {
        Encoder::X264 => vec!["-c:v", "libx264", "-preset", "fast", "-crf", "18"],
        Encoder::VideoToolbox => vec!["-c:v", "h264_videotoolbox", "-b:v", bitrate.as_str()],
        Encoder::MediaFoundation => vec!["-c:v", "h264_mf", "-b:v", bitrate.as_str()],
    };
    let mut args: Vec<String> = args.into_iter().map(String::from).collect();
    args.extend(["-pix_fmt", "yuv420p"].map(String::from));
    args
}

/// Duration and picture height from ffmpeg's input banner (works without ffprobe).
fn probe(ffmpeg: &Path, input: &Path) -> Option<MediaInfo> {
    let output = hidden(&mut Command::new(ffmpeg))
        .args(["-hide_banner", "-nostdin"])
        .args(crate::ffmpeg::INPUT_PROTOCOLS)
        .arg("-i")
        .arg(input)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    parse_banner(&String::from_utf8_lossy(&output.stderr))
}

fn parse_banner(banner: &str) -> Option<MediaInfo> {
    let duration_seconds = banner.lines().find_map(|line| {
        let rest = line.trim().strip_prefix("Duration:")?.trim();
        parse_clock(rest.split(',').next()?.trim())
    });
    let height = banner.lines().filter(|line| line.contains("Video:")).find_map(|line| {
        line.split(|c: char| c == ',' || c.is_whitespace()).find_map(|token| {
            let (width, height) = token.split_once('x')?;
            let width: u32 = width.parse().ok()?;
            let height: u32 = height.parse().ok()?;
            (width >= 16 && height >= 16).then_some(height)
        })
    })?;
    Some(MediaInfo {
        duration_seconds,
        height,
    })
}

fn parse_clock(text: &str) -> Option<f64> {
    let mut parts = text.split(':');
    let hours: f64 = parts.next()?.parse().ok()?;
    let minutes: f64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

/// `-progress` reports `out_time_us` (newer) and `out_time_ms` (also microseconds, older name).
fn progress_seconds(line: &str) -> Option<f64> {
    let value = line
        .strip_prefix("out_time_us=")
        .or_else(|| line.strip_prefix("out_time_ms="))?;
    let micros: f64 = value.trim().parse().ok()?;
    (micros >= 0.0).then_some(micros / 1_000_000.0)
}

/// `HH:MM:SS:FF`, with `;` before the frames for drop frame, or None when malformed.
fn normalize_timecode(text: &str, drop_frame: bool) -> Option<String> {
    let parts: Vec<&str> = text.trim().split([':', ';', '.']).collect();
    if parts.len() != 4
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    let numbers: Vec<u32> = parts.iter().map(|part| part.parse().ok()).collect::<Option<_>>()?;
    if numbers[1] > 59 || numbers[2] > 59 {
        return None;
    }
    let separator = if drop_frame { ';' } else { ':' };
    Some(format!(
        "{:02}:{:02}:{:02}{}{:02}",
        numbers[0], numbers[1], numbers[2], separator, numbers[3]
    ))
}

/// Escape a value for a single-quoted filtergraph option.
fn escape_filter_value(value: &str) -> String {
    value.replace('\\', "/").replace(':', "\\:").replace('\'', "'\\''")
}

fn drawtext_filter(
    timecode: &str,
    fps_numerator: u32,
    fps_denominator: u32,
    wrap_at_24_hours: bool,
    position: BurnInPosition,
    height: u32,
    font: Option<&Path>,
) -> String {
    let font_size = ((f64::from(height) * FONT_HEIGHT_RATIO).round() as u32).max(12);
    let padding = ((f64::from(font_size) * BOX_PADDING_RATIO).round() as u32).max(2);
    let margin = (f64::from(height) * MARGIN_RATIO).round() as u32;
    let offset = margin + padding;
    let rate = if fps_denominator == 1 {
        fps_numerator.to_string()
    } else {
        format!("{fps_numerator}/{fps_denominator}")
    };
    let mut options: Vec<String> = Vec::new();
    if let Some(font) = font {
        options.push(format!("fontfile='{}'", escape_filter_value(&font.to_string_lossy())));
    }
    options.push(format!("timecode='{}'", escape_filter_value(timecode)));
    options.push(format!("timecode_rate={rate}"));
    if wrap_at_24_hours {
        options.push("tc24hmax=1".into());
    }
    options.push(format!("fontsize={font_size}"));
    options.push("fontcolor=white".into());
    options.push("box=1".into());
    options.push("boxcolor=black".into());
    options.push(format!("boxborderw={padding}"));
    options.push(match position {
        BurnInPosition::Center => "x=(w-tw)/2".to_string(),
        BurnInPosition::Right => format!("x=w-tw-{offset}"),
    });
    options.push(format!("y=h-th-{offset}"));
    format!("drawtext={}", options.join(":"))
}

/// A monospaced system font, so the digits do not jitter from frame to frame.
fn find_font() -> Option<PathBuf> {
    let candidates: &[&str] = if cfg!(windows) {
        &[
            "C:\\Windows\\Fonts\\consola.ttf",
            "C:\\Windows\\Fonts\\cour.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
        ]
    } else if cfg!(target_os = "macos") {
        &[
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/Monaco.ttf",
            "/System/Library/Fonts/Supplemental/Courier New.ttf",
            "/Library/Fonts/Courier New.ttf",
        ]
    } else {
        &[
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
            "/usr/share/fonts/dejavu/DejaVuSansMono.ttf",
            "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
            "/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf",
        ]
    };
    let windows_dir = std::env::var("WINDIR").ok();
    candidates
        .iter()
        .map(|candidate| match (&windows_dir, candidate.strip_prefix("C:\\Windows")) {
            (Some(dir), Some(rest)) => PathBuf::from(format!("{dir}{rest}")),
            _ => PathBuf::from(candidate),
        })
        .find(|path| path.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_timecodes() {
        assert_eq!(normalize_timecode("10:00:00:00", false).as_deref(), Some("10:00:00:00"));
        assert_eq!(normalize_timecode("1:02:03;04", true).as_deref(), Some("01:02:03;04"));
        assert_eq!(normalize_timecode("01:02:03.04", false).as_deref(), Some("01:02:03:04"));
        assert_eq!(normalize_timecode("01:60:00:00", false), None);
        assert_eq!(normalize_timecode("01:00:00", false), None);
        assert_eq!(normalize_timecode("aa:00:00:00", false), None);
    }

    #[test]
    fn parses_banner() {
        let banner = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':\n  Duration: 00:01:04.50, start: 0.000000, bitrate: 1210 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1201 kb/s, 25 fps\n";
        assert_eq!(
            parse_banner(banner),
            Some(MediaInfo {
                duration_seconds: Some(64.5),
                height: 1080
            })
        );
        assert_eq!(parse_banner("Duration: N/A\n"), None);
    }

    #[test]
    fn parses_progress() {
        assert_eq!(progress_seconds("out_time_us=2500000"), Some(2.5));
        assert_eq!(progress_seconds("out_time_ms=1000000"), Some(1.0));
        assert_eq!(progress_seconds("out_time_us=N/A"), None);
        assert_eq!(progress_seconds("frame=12"), None);
    }

    #[test]
    fn builds_drawtext_filter() {
        let filter = drawtext_filter(
            "10:00:00;00",
            30000,
            1001,
            true,
            BurnInPosition::Right,
            1080,
            Some(Path::new("C:\\Windows\\Fonts\\consola.ttf")),
        );
        assert_eq!(
            filter,
            "drawtext=fontfile='C\\:/Windows/Fonts/consola.ttf':timecode='10\\:00\\:00;00':timecode_rate=30000/1001:tc24hmax=1:fontsize=68:fontcolor=white:box=1:boxcolor=black:boxborderw=17:x=w-tw-49:y=h-th-49"
        );
        let centered = drawtext_filter("00:00:00:00", 25, 1, false, BurnInPosition::Center, 720, None);
        assert!(centered.starts_with("drawtext=timecode='00\\:00\\:00\\:00':timecode_rate=25:fontsize=45"));
        assert!(centered.contains(":x=(w-tw)/2:"));
    }
}
