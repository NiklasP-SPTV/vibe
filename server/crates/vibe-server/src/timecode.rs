use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceTimecode {
    pub start_frames: i64,
    pub fps_num: i64,
    pub fps_den: i64,
    pub nominal_fps: i64,
    pub drop_frame: bool,
    pub raw: String,
}

/// Read metadata through ffprobe and fall back to the ffmpeg input banner.
pub fn probe_path(path: &Path) -> Option<SourceTimecode> {
    let mut probes = Vec::new();
    if let Some(path) = find_in_path("ffprobe") {
        probes.push(path);
    }
    if let Ok(ffmpeg) = crate::audio::find_ffmpeg() {
        if let Some(parent) = ffmpeg.parent() {
            let candidate = parent.join(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" });
            if candidate.is_file() && !probes.contains(&candidate) {
                probes.push(candidate);
            }
        }
    }

    for ffprobe in probes {
        let Ok(output) = Command::new(ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,codec_tag_string,r_frame_rate,avg_frame_rate:stream_tags=timecode:format_tags=timecode",
                "-of",
                "json",
            ])
            .arg(path)
            .output()
        else {
            continue;
        };
        if output.status.success() {
            if let Some(parsed) = parse_ffprobe(&output.stdout) {
                return Some(parsed);
            }
        }
    }

    let ffmpeg = crate::audio::find_ffmpeg().ok()?;
    let output = Command::new(ffmpeg)
        .args(["-hide_banner", "-nostdin", "-i"])
        .arg(path)
        .output()
        .ok()?;
    parse_ffmpeg_banner(&String::from_utf8_lossy(&output.stderr))
}

pub fn probe_bytes(bytes: &[u8]) -> Option<SourceTimecode> {
    let mut input = tempfile::NamedTempFile::new().ok()?;
    std::io::Write::write_all(&mut input, bytes).ok()?;
    probe_path(input.path())
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    env::split_paths(&env::var_os("PATH")?)
        .map(|directory| directory.join(if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }))
        .find(|path| path.is_file())
}

pub fn parse_rate(value: &str) -> Option<(i64, i64)> {
    if let Some((numerator, denominator)) = value.split_once('/') {
        let num: i64 = numerator.parse().ok()?;
        let den: i64 = denominator.parse().ok()?;
        return (num > 0 && den > 0).then_some((num, den));
    }

    let fps: f64 = value.parse().ok()?;
    if !fps.is_finite() || fps <= 0.0 {
        return None;
    }
    if (fps - 29.97).abs() < 0.005 {
        return Some((30_000, 1_001));
    }
    if (fps - 59.94).abs() < 0.005 {
        return Some((60_000, 1_001));
    }
    if (fps - 23.976).abs() < 0.005 {
        return Some((24_000, 1_001));
    }
    Some(((fps * 1000.0).round() as i64, 1000))
}

fn parse_ffprobe(bytes: &[u8]) -> Option<SourceTimecode> {
    let json: Value = serde_json::from_slice(bytes).ok()?;
    let streams = json.get("streams")?.as_array()?;
    let video = streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("video"));
    let rate = video
        .and_then(|stream| {
            let average = stream.get("avg_frame_rate").and_then(Value::as_str).unwrap_or("0/0");
            if average != "0/0" { parse_rate(average) } else { None }
        })
        .or_else(|| {
            video.and_then(|stream| {
                stream
                    .get("r_frame_rate")
                    .and_then(Value::as_str)
                    .and_then(parse_rate)
            })
        })?;

    let tmcd = streams
        .iter()
        .find(|stream| {
            stream
                .get("codec_tag_string")
                .and_then(Value::as_str)
                .is_some_and(|value| value.eq_ignore_ascii_case("tmcd"))
                && json_tag(stream).is_some()
        })
        .and_then(json_tag);
    let format_tc = json.get("format").and_then(json_tag);
    let video_tc = video.and_then(json_tag);
    let raw = tmcd.or(format_tc).or(video_tc)?;
    parse(raw, rate.0, rate.1)
}

fn json_tag(value: &Value) -> Option<&str> {
    value
        .get("tags")?
        .as_object()?
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("timecode"))?
        .1
        .as_str()
}

fn parse_ffmpeg_banner(output: &str) -> Option<SourceTimecode> {
    let video = output.lines().find(|line| line.contains("Video:"))?;
    let fps = video
        .split(',')
        .find_map(|part| part.trim().strip_suffix(" fps").and_then(|value| value.parse::<f64>().ok()))
        .or_else(|| {
            video
                .split(',')
                .find_map(|part| part.trim().strip_suffix(" tbr").and_then(|value| value.parse::<f64>().ok()))
        })?;
    let (fps_num, fps_den) = parse_rate(&fps.to_string())?;

    let mut current_source = "format";
    let mut timecodes: Vec<(&str, &str)> = Vec::new();
    for line in output.lines() {
        if line.contains("Stream #") && line.contains("Video:") {
            current_source = "video";
        } else if line.contains("Stream #") && line.to_ascii_lowercase().contains("tmcd") {
            current_source = "tmcd";
        }

        let lowercase = line.to_ascii_lowercase();
        if let Some(index) = lowercase.find("timecode") {
            let value = line[index + "timecode".len()..]
                .trim_start_matches([' ', ':', '='])
                .trim();
            let value = value.split_whitespace().next().unwrap_or(value);
            if value.len() >= 11 {
                timecodes.push((current_source, value));
            }
        }
    }
    let raw = timecodes
        .iter()
        .find(|(source, _)| *source == "tmcd")
        .or_else(|| timecodes.iter().find(|(source, _)| *source == "format"))
        .or_else(|| timecodes.iter().find(|(source, _)| *source == "video"))
        .map(|(_, value)| *value)?;
    parse(raw, fps_num, fps_den)
}

pub fn parse(raw: &str, fps_num: i64, fps_den: i64) -> Option<SourceTimecode> {
    let parts: Vec<&str> = raw.trim().split([':', ';']).collect();
    if parts.len() != 4 || fps_den <= 0 || fps_num <= 0 {
        return None;
    }

    let hours: i64 = parts[0].parse().ok()?;
    let minutes: i64 = parts[1].parse().ok()?;
    let seconds: i64 = parts[2].parse().ok()?;
    let frames: i64 = parts[3].parse().ok()?;
    if hours < 0 || minutes > 59 || seconds > 59 {
        return None;
    }

    let nominal = (fps_num as f64 / fps_den as f64).round() as i64;
    let drop = drop_frames(nominal);
    let drop_frame = raw.contains(';');
    if frames >= nominal || (drop_frame && (drop == 0 || fps_num % fps_den == 0)) {
        return None;
    }
    if drop_frame && minutes % 10 != 0 && seconds == 0 && frames < drop {
        return None;
    }

    let total_minutes = hours * 60 + minutes;
    let skipped = if drop_frame { drop * (total_minutes - total_minutes / 10) } else { 0 };
    let start_frames = (hours * 3600 + minutes * 60 + seconds) * nominal + frames - skipped;
    Some(SourceTimecode {
        start_frames,
        fps_num,
        fps_den,
        nominal_fps: nominal,
        drop_frame,
        raw: raw.trim().to_string(),
    })
}

fn drop_frames(nominal_fps: i64) -> i64 {
    match nominal_fps {
        30 => 2,
        60 => 4,
        _ => 0,
    }
}

fn frames_per_day(source: &SourceTimecode) -> i64 {
    let omitted_minutes = 24 * 60 - 24 * 6;
    source.nominal_fps * 86_400 - if source.drop_frame { drop_frames(source.nominal_fps) * omitted_minutes } else { 0 }
}

pub fn relative_frames(centiseconds: i64, source: &SourceTimecode) -> i64 {
    let numerator = centiseconds.saturating_mul(source.fps_num) + 50 * source.fps_den;
    numerator / (100 * source.fps_den)
}

pub fn format_timecode(centiseconds: i64, source: &SourceTimecode, wrap_24h: bool) -> String {
    let mut frame = (source.start_frames + relative_frames(centiseconds, source)).max(0);
    if wrap_24h {
        frame %= frames_per_day(source);
    }

    let mut label = frame;
    if source.drop_frame {
        let drop = drop_frames(source.nominal_fps);
        let per_ten_minutes = source.nominal_fps * 600 - drop * 9;
        let per_minute = source.nominal_fps * 60 - drop;
        let blocks = frame / per_ten_minutes;
        let remainder = frame % per_ten_minutes;
        label += drop * 9 * blocks;
        if remainder >= drop {
            label += drop * ((remainder - drop) / per_minute);
        }
    }

    let frames = label % source.nominal_fps;
    let total_seconds = label / source.nominal_fps;
    let seconds = total_seconds % 60;
    let minutes = (total_seconds / 60) % 60;
    let hours = total_seconds / 3600;
    let separator = if source.drop_frame { ';' } else { ':' };
    format!("{hours:02}:{minutes:02}:{seconds:02}{separator}{frames:02}")
}

pub fn subtitle_millis(centiseconds: i64, source: &SourceTimecode, wrap_24h: bool) -> i64 {
    let mut frames = (source.start_frames + relative_frames(centiseconds, source)).max(0);
    if wrap_24h {
        frames %= frames_per_day(source);
    }
    (frames * source.fps_den * 1000 + source.fps_num / 2) / source.fps_num
}

pub fn subtitle_time(centiseconds: i64, source: &SourceTimecode, separator: char, wrap_24h: bool) -> String {
    let millis = subtitle_millis(centiseconds, source, wrap_24h);
    let milliseconds = millis % 1000;
    let total_seconds = millis / 1000;
    let seconds = total_seconds % 60;
    let minutes = (total_seconds / 60) % 60;
    let hours = total_seconds / 3600;
    format!("{hours:02}:{minutes:02}:{seconds:02}{separator}{milliseconds:03}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_25_and_24_fps() {
        let tc25 = parse("09:20:14:08", 25, 1).unwrap();
        assert_eq!(format_timecode(0, &tc25, true), "09:20:14:08");
        assert_eq!(format_timecode(100, &tc25, true), "09:20:15:08");
        assert_eq!(parse("00:00:00:23", 24, 1).unwrap().nominal_fps, 24);
    }

    #[test]
    fn handles_2997_ndf_and_df() {
        let ndf = parse("00:00:00:29", 30_000, 1_001).unwrap();
        assert_eq!(format_timecode(100, &ndf, true), "00:00:01:29");
        let minute = parse("00:01:00;02", 30_000, 1_001).unwrap();
        let ten = parse("00:10:00;00", 30_000, 1_001).unwrap();
        assert_eq!(minute.start_frames, 1800);
        assert_eq!(format_timecode(0, &minute, true), "00:01:00;02");
        assert_eq!(ten.start_frames, 17982);
        assert_eq!(format_timecode(0, &ten, true), "00:10:00;00");
    }

    #[test]
    fn crosses_midnight_and_preserves_no_wrap_option() {
        let source = parse("23:59:59:24", 25, 1).unwrap();
        assert_eq!(format_timecode(4, &source, true), "00:00:00:00");
        assert_eq!(format_timecode(4, &source, false), "24:00:00:00");
    }

    #[test]
    fn zero_offset_and_invalid_media_are_safe() {
        let source = parse("01:02:03:04", 25, 1).unwrap();
        assert_eq!(format_timecode(0, &source, true), "01:02:03:04");
        assert!(parse("not-a-timecode", 25, 1).is_none());
    }

    #[test]
    fn ffprobe_prefers_tmcd_stream_timecode() {
        let media = br#"
        {
          "streams": [
            {
              "codec_type": "video",
              "codec_tag_string": "avc1",
              "r_frame_rate": "25/1",
              "avg_frame_rate": "25/1",
              "tags": {"timecode": "00:00:00:01"}
            },
            {
              "codec_type": "data",
              "codec_tag_string": "tmcd",
              "r_frame_rate": "0/0",
              "avg_frame_rate": "0/0",
              "tags": {"timecode": "09:20:14:08"}
            }
          ],
          "format": {"tags": {"timecode": "00:00:00:03"}}
        }
        "#;
        let parsed = parse_ffprobe(media).unwrap();
        assert_eq!(parsed.raw, "09:20:14:08");
        assert_eq!(format_timecode(0, &parsed, true), "09:20:14:08");
        assert_eq!(format_timecode(4, &parsed, true), "09:20:14:09");
    }

    #[test]
    fn missing_or_invalid_metadata_is_safe() {
        assert!(parse_ffprobe(br#"{
            "streams": [{"codec_type": "video", "r_frame_rate": "25/1"}],
            "format": {}
        }"#)
        .is_none());
        assert!(parse("not-a-timecode", 25, 1).is_none());
    }
}
