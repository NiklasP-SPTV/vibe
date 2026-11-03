import type { ModelOptions } from '~/providers/preference'
import { DEFAULT_MAX_TEXT_CTX } from './model-defaults'
import { CONFIG_KEYS } from './config-keys'
import { usePersisted } from './config-store'

/**
 * Two ways to transcribe, picked per run in the start dialog:
 *
 * - `standard` — the model chosen in settings (large-v3-turbo by default) with the user's options.
 *   Fast enough for an author to run on the way home.
 * - `max` — slower, for material that goes to an editor: the full large-v3 model, voice activity
 *   detection before Whisper (so silence and music cannot produce invented lines or make it skip
 *   speech), and a decoder setup chosen for accuracy rather than speed.
 */
export type QualityMode = 'standard' | 'max'

export const MAX_QUALITY_MODEL = {
	filename: 'ggml-large-v3.bin',
	url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
	sizeLabel: '3,1 GB',
}

/**
 * Off until the engine splits long speech into bounded windows. Measured on a 51-minute interview
 * against Trint, the engine as shipped (server v0.6.10) gives large-v3 no edge over turbo: its
 * voice activity detection keeps continuous speech as one window, and large-v3 then fell into a
 * repetition loop that cost 22 minutes of text. The mode returns with the engine changes.
 */
export const MAX_QUALITY_AVAILABLE = false

export const QUALITY_MODES: Array<{ value: QualityMode; label: string; description: string; available: boolean }> = [
	{ value: 'standard', label: 'Standard', description: 'Schnell und vollständig – die empfohlene Einstellung.', available: true },
	{
		value: 'max',
		label: 'Maximale Qualität',
		description: MAX_QUALITY_AVAILABLE ? 'Genauer und vollständiger, dauert etwa 3- bis 5-mal so lange.' : 'Folgt mit Version 3.6.',
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
