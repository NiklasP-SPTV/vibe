use serde::Serialize;
use whisper_rs::{Segment, TranscribeResult};

use crate::server::{diarization, speakers};

pub fn cs_to_seconds(cs: i64) -> f64 {
    cs as f64 / 100.0
}

fn cs_to_srt_time(cs: i64) -> String {
    let mut ms = cs * 10;
    let mut s = ms / 1000;
    ms %= 1000;
    let mut m = s / 60;
    s %= 60;
    let h = m / 60;
    m %= 60;
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

pub(crate) fn cs_to_vtt_time(cs: i64) -> String {
    cs_to_srt_time(cs).replace(',', ".")
}

pub fn format_srt(segments: &[Segment]) -> String {
    format_srt_with_timecode(segments, None, true)
}

pub fn format_srt_with_timecode(
    segments: &[Segment],
    source: Option<&crate::timecode::SourceTimecode>,
    wrap_24h: bool,
) -> String {
    let mut out = String::new();
    for (index, segment) in segments.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n",
            index + 1,
            source.map_or_else(
                || cs_to_srt_time(segment.start),
                |tc| crate::timecode::subtitle_time(segment.start, tc, ',', wrap_24h),
            ),
            source.map_or_else(
                || cs_to_srt_time(segment.end),
                |tc| crate::timecode::subtitle_time(segment.end, tc, ',', wrap_24h),
            ),
            segment.text.trim()
        ));
    }
    out
}

pub fn format_vtt(segments: &[Segment]) -> String {
    format_vtt_with_timecode(segments, None, true)
}

pub fn format_vtt_with_timecode(
    segments: &[Segment],
    source: Option<&crate::timecode::SourceTimecode>,
    wrap_24h: bool,
) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for (index, segment) in segments.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        out.push_str(&format!(
            "{} --> {}\n{}\n",
            source.map_or_else(
                || cs_to_vtt_time(segment.start),
                |tc| crate::timecode::subtitle_time(segment.start, tc, '.', wrap_24h),
            ),
            source.map_or_else(
                || cs_to_vtt_time(segment.end),
                |tc| crate::timecode::subtitle_time(segment.end, tc, '.', wrap_24h),
            ),
            segment.text.trim()
        ));
    }
    out
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct VerboseJson {
    pub text: String,
    pub segments: Vec<VerboseSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_timecode: Option<String>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct VerboseSegment {
    pub start: f64,
    pub end: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_timecode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_timecode: Option<String>,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<usize>,
    pub no_speech_prob: f32,
}

/// With diarization, a recognizer segment that spans several speakers comes out
/// as one entry per speaker run.
pub fn build_verbose_json(result: &TranscribeResult, diar_segments: &[diarization::Segment]) -> VerboseJson {
    build_verbose_json_with_timecode(result, diar_segments, None, true)
}

pub fn build_verbose_json_with_timecode(
    result: &TranscribeResult,
    diar_segments: &[diarization::Segment],
    source: Option<&crate::timecode::SourceTimecode>,
    wrap_24h: bool,
) -> VerboseJson {
    VerboseJson {
        text: result.text(),
        source_timecode: source.map(|tc| tc.raw.clone()),
        segments: result
            .segments
            .iter()
            .flat_map(|segment| speakers::attribute(segment, diar_segments))
            .map(|turn| {
                let start = source.map_or_else(
                    || cs_to_seconds(turn.start),
                    |tc| crate::timecode::subtitle_millis(turn.start, tc, wrap_24h) as f64 / 1000.0,
                );
                let end = source.map_or_else(
                    || cs_to_seconds(turn.end),
                    |tc| crate::timecode::subtitle_millis(turn.end, tc, wrap_24h) as f64 / 1000.0,
                );
                VerboseSegment {
                    start,
                    end,
                    start_timecode: source.map(|tc| crate::timecode::format_timecode(turn.start, tc, wrap_24h)),
                    end_timecode: source.map(|tc| crate::timecode::format_timecode(turn.end, tc, wrap_24h)),
                    text: turn.text,
                    speaker: turn.speaker,
                    no_speech_prob: turn.no_speech_prob,
                }
            })
            .collect(),
    }
}
