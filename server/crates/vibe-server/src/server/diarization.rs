//! Speaker turns for a recording. Two diarizers ship side by side so they can be compared on
//! the same material: NVIDIA Sortformer (up to 4 speakers, the default since 3.0) and NVIDIA
//! Nemotron-3-Diarization (up to 8 speakers, from upstream #1619). The model file the app sends
//! picks one; both GGUFs carry the architecture in their name.

#[derive(Debug, Clone, serde::Serialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub speaker_id: usize,
}

/// Whether `model_path` names a Nemotron-3-Diarization GGUF rather than a Sortformer one.
pub fn is_nemotron(model_path: &str) -> bool {
    std::path::Path::new(model_path)
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.to_ascii_lowercase().contains("nemotron"))
}

/// Nemotron turns are precise enough to split a recognizer segment at word level.
pub fn splits_on_words(model_path: &str) -> bool {
    is_nemotron(model_path)
}

#[cfg(feature = "diarize")]
pub fn diarize(model_path: &str, samples: &[f32]) -> Vec<Segment> {
    let result = if is_nemotron(model_path) {
        nemotron_diarize_rs::Diarizer::new(model_path)
            .and_then(|mut diarizer| diarizer.diarize_samples(samples))
            .map(|segments| {
                segments
                    .into_iter()
                    .map(|segment| Segment {
                        start: segment.start,
                        end: segment.end,
                        speaker_id: segment.speaker_id,
                    })
                    .collect()
            })
            .map_err(|err| err.to_string())
    } else {
        diarize_rs::Diarizer::new(model_path)
            .and_then(|mut diarizer| diarizer.diarize(samples, 16_000, 1))
            .map(|segments| {
                segments
                    .into_iter()
                    .map(|segment| Segment {
                        start: segment.start,
                        end: segment.end,
                        speaker_id: segment.speaker_id,
                    })
                    .collect()
            })
            .map_err(|err| err.to_string())
    };
    match result {
        Ok(segments) => segments,
        Err(err) => {
            tracing::warn!("diarization failed, skipping speakers: {err}");
            Vec::new()
        }
    }
}

#[cfg(not(feature = "diarize"))]
pub fn diarize(model_path: &str, _samples: &[f32]) -> Vec<Segment> {
    tracing::warn!("diarization support is not enabled, skipping model: {model_path}");
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_model_file_picks_the_diarizer() {
        assert!(is_nemotron("C:/models/nemotron-3-diarization-Q8_0.gguf"));
        assert!(!is_nemotron("/models/diar_streaming_sortformer_4spk-v2.q8_0.gguf"));
        assert!(!is_nemotron("/nemotron-dir/diar_streaming_sortformer_4spk-v2.q8_0.gguf"));
    }
}
