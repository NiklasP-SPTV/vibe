import { largeV3Integrity } from '~/lib/config'
import type { ModelOptions } from '~/providers/preference'
import { DEFAULT_MAX_TEXT_CTX } from './model-defaults'
import { CONFIG_KEYS } from './config-keys'
import { usePersisted } from './config-store'

/**
 * Two ways to transcribe, picked per run in the start dialog:
 *
 * - `standard` — the model chosen in settings (large-v3-turbo by default) with the user's options.
 *   Fast enough for an author to run on the way home.
 * - `max` — slower, for material that goes to an editor: the full large-v3 model, decoded in
 *   windows cut at speech pauses by voice activity detection (so it cannot loop or drift, and
 *   silence and music cannot produce invented lines), with a decoder setup chosen for accuracy.
 */
export type QualityMode = 'standard' | 'max'

export const MAX_QUALITY_MODEL = {
	filename: 'ggml-large-v3.bin',
	url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
	integrity: largeV3Integrity,
	sizeLabel: '3,1 GB',
}

/**
 * Needs the engine from server-v0.6.10-sptv.1 on, which cuts speech into windows of at most 29 s
 * at pauses. Before, voice activity detection kept continuous speech as one window, and large-v3
 * looped for 22 minutes on the 51-minute MiWuLa interview. With bounded windows it agreed best
 * with Trint of all variants (88.5 %), wrote whole sentences and took 170 s instead of 113 s for
 * turbo on an RTX 5080.
 */
export const MAX_QUALITY_AVAILABLE = true

export const QUALITY_MODES: Array<{ value: QualityMode; label: string; description: string; available: boolean }> = [
	{ value: 'standard', label: 'Standard', description: 'Schnell – für Rohfassung und Überblick.', available: true },
	{
		value: 'max',
		label: 'Maximale Qualität',
		description: MAX_QUALITY_AVAILABLE ? 'Ganze Sätze, genauere Timecodes, weniger Fehler – dauert etwa doppelt so lange.' : 'Folgt mit Version 3.6.',
		available: MAX_QUALITY_AVAILABLE,
	},
]

/** The decoder settings of the max mode, whatever the user tuned for the standard one. */
export function maxQualityModelOptions(base: ModelOptions): ModelOptions {
	return {
		...base,
		temperature: 0,
		sampling_strategy: 'beam search',
		beam_size: 5,
		best_of: 5,
		max_text_ctx: DEFAULT_MAX_TEXT_CTX,
		// Plain lines: word-level splitting would only shorten them.
		word_timestamps: false,
		max_sentence_len: undefined,
	}
}

/** The model file a job runs on; `null` when the standard mode has no model chosen yet. */
export function modelPathFor(mode: QualityMode | undefined, selectedModelPath: string | null, modelsFolder: string) {
	if (mode === 'max') return `${modelsFolder}/${MAX_QUALITY_MODEL.filename}`
	return selectedModelPath
}

/** The last mode picked in the start dialog, offered again next time. */
export function useLastQualityMode() {
	const [stored, setStored] = usePersisted<QualityMode>(CONFIG_KEYS.qualityMode, 'standard')
	return [stored === 'max' && MAX_QUALITY_AVAILABLE ? 'max' : 'standard', setStored] as const
}
