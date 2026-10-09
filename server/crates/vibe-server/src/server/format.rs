use serde::Serialize;
use whisper_rs::{Segment, TranscribeResult};

use crate::server::diarization;

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
            .map(|segment| {
                let start = source.map_or_else(
                    || cs_to_seconds(segment.start),
                    |tc| crate::timecode::subtitle_millis(segment.start, tc, wrap_24h) as f64 / 1000.0,
                );
                let end = source.map_or_else(
                    || cs_to_seconds(segment.end),
                    |tc| crate::timecode::subtitle_millis(segment.end, tc, wrap_24h) as f64 / 1000.0,
                );
                VerboseSegment {
                    start,
                    end,
                    start_timecode: source.map(|tc| crate::timecode::format_timecode(segment.start, tc, wrap_24h)),
                    end_timecode: source.map(|tc| crate::timecode::format_timecode(segment.end, tc, wrap_24h)),
                    text: segment.text.clone(),
                    speaker: match_speaker(cs_to_seconds(segment.start), cs_to_seconds(segment.end), diar_segments),
                    no_speech_prob: segment.no_speech_prob,
                }
            })
            .collect(),
    }
}

/// How far (seconds) a transcript segment may sit from the nearest speaker turn and
/// still be attributed to it. Diarization drops short, quiet utterances ("you know,")
/// that the recognizer kept, and a line with no speaker cannot be exported, renamed
/// or filtered like the others.
const NEAREST_TURN_TOLERANCE_SECS: f64 = 1.5;

pub fn match_speaker(start: f64, end: f64, diar_segments: &[diarization::Segment]) -> Option<usize> {
    let mut best_id = None;
    let mut best_overlap = 0.0;
    let mut nearest = None;
    let mut nearest_gap = f64::INFINITY;
    for segment in diar_segments {
        let overlap = segment.end.min(end) - segment.start.max(start);
        if overlap > best_overlap {
            best_overlap = overlap;
            best_id = Some(segment.speaker_id);
        }
        let gap = (segment.start - end).max(start - segment.end);
        if gap < nearest_gap {
            nearest_gap = gap;
            nearest = Some(segment.speaker_id);
        }
    }
    if best_id.is_some() {
        return best_id;
    }
    (nearest_gap <= NEAREST_TURN_TOLERANCE_SECS).then_some(nearest).flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn turn(start: f64, end: f64, speaker_id: usize) -> diarization::Segment {
        diarization::Segment { start, end, speaker_id }
    }

    #[test]
    fn overlap_wins_over_proximity() {
        let turns = [turn(0.0, 10.0, 0), turn(10.0, 20.0, 1)];
        assert_eq!(match_speaker(9.0, 12.5, &turns), Some(1));
        assert_eq!(match_speaker(2.0, 4.0, &turns), Some(0));
    }

    #[test]
    fn a_line_in_a_gap_takes_the_nearest_turn() {
        let turns = [turn(0.0, 10.0, 0), turn(12.0, 20.0, 1)];
        assert_eq!(match_speaker(10.2, 10.8, &turns), Some(0));
        assert_eq!(match_speaker(11.4, 11.9, &turns), Some(1));
    }

    #[test]
    fn a_line_far_from_any_turn_stays_unassigned() {
        let turns = [turn(0.0, 10.0, 0)];
        assert_eq!(match_speaker(12.0, 13.0, &turns), None);
        assert_eq!(match_speaker(1.0, 2.0, &[]), None);
    }
}
