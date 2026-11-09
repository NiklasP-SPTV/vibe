import * as config from '~/lib/config'
import type { ModelIntegrity } from '~/lib/config'

/**
 * Two speaker models ship side by side for an A/B comparison: Sortformer, the one Vibe has used
 * since 3.0, and Nemotron-3-Diarization from upstream, which tells up to eight speakers apart and
 * splits a line where the speaker changes mid-sentence. The engine picks the diarizer from the
 * model file the app sends.
 */
export type DiarizeEngine = 'sortformer' | 'nemotron'

export interface DiarizeEngineInfo {
	value: DiarizeEngine
	label: string
	filename: string
	url: string
	integrity: ModelIntegrity
}

export const DIARIZE_ENGINES: DiarizeEngineInfo[] = [
	{
		value: 'sortformer',
		label: 'Bewährt (bis 4 Sprecher)',
		filename: config.diarizeModelFilename,
		url: config.diarizeModelUrl,
		integrity: config.diarizeModelIntegrity,
	},
	{
		value: 'nemotron',
		label: 'Neu: Nemotron (bis 8 Sprecher, Test)',
		filename: config.nemotronDiarizeModelFilename,
		url: config.nemotronDiarizeModelUrl,
		integrity: config.nemotronDiarizeModelIntegrity,
	},
]

export const DEFAULT_DIARIZE_ENGINE: DiarizeEngine = 'sortformer'

/** The engine a stored value names; anything unknown falls back to the default. */
export function asDiarizeEngine(value: unknown): DiarizeEngine {
	return DIARIZE_ENGINES.some((engine) => engine.value === value) ? (value as DiarizeEngine) : DEFAULT_DIARIZE_ENGINE
}

export function diarizeEngineInfo(engine: DiarizeEngine | undefined): DiarizeEngineInfo {
	const value = asDiarizeEngine(engine)
	return DIARIZE_ENGINES.find((info) => info.value === value)!
}
