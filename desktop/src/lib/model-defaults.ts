import type { ModelOptions } from '~/providers/preference'

/**
 * Whisper carries at most half its 448-token window over from the previous one, so 224 is the full
 * context. A test on a 51-minute interview (MiWuLa, against Trint) showed that a short context
 * (64, the default in 3.3.1–3.4.0) loses text and pushes timecodes off by up to ten seconds, while
 * the full one with temperature 0 left the fewest gaps and no repetition loops.
 */
export const DEFAULT_MAX_TEXT_CTX = 224
const PREVIOUS_DEFAULT_MAX_TEXT_CTX = 64

/** Bumped when a default changes that stored options should pick up once. */
export const MODEL_DEFAULTS_REVISION = 2
const PREVIOUS_DEFAULT_TEMPERATURE = 0.4

/**
 * Options saved before a revision get its new defaults once, but only where they still hold the
 * old default (it came with the install; nobody chose it): temperature 0.4 becomes 0 (revision 1),
 * context 64 becomes the full one (revision 2). The revision travels with the next save, so a value
 * set afterwards is kept.
 */
export function withCurrentDefaults(stored: ModelOptions): ModelOptions {
	const revision = stored.defaults_revision ?? 0
	const options: ModelOptions = { ...stored, max_text_ctx: stored.max_text_ctx ?? DEFAULT_MAX_TEXT_CTX, defaults_revision: MODEL_DEFAULTS_REVISION }
	if (revision < 1 && stored.temperature === PREVIOUS_DEFAULT_TEMPERATURE) options.temperature = 0
	if (revision < 2 && stored.max_text_ctx === PREVIOUS_DEFAULT_MAX_TEXT_CTX) options.max_text_ctx = DEFAULT_MAX_TEXT_CTX
	return options
}
