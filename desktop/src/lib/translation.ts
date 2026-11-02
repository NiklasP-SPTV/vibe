import { useSyncExternalStore } from 'react'
import { CONFIG_KEYS } from './config-keys'
import { usePersisted } from './config-store'
import { DeepLError, translateTexts } from './deepl'
import type { Segment } from './transcript'

/** What the user asked for when starting a run: translate into `target`, from `source` or detected. */
export interface TranslationRequest {
	target: string
	source?: string
}

/** A finished translation, aligned with the transcript's segments by index. */
export interface Translation {
	target: string
	/** What the user chose; absent means DeepL detected the language. */
	source?: string
	detectedSource?: string
	/** One translated text per segment, same order as the transcript. */
	texts: string[]
	/** ISO 8601 */
	createdAt: string
}

export interface TranslationSettings {
	apiKey: string
	/** Preselects the switch in the start screen. */
	translateByDefault: boolean
	defaultTarget: string
}

export const DEFAULT_TRANSLATION_SETTINGS: TranslationSettings = { apiKey: '', translateByDefault: false, defaultTarget: 'DE' }

export function useTranslationSettings() {
	const [stored, setStored] = usePersisted<Partial<TranslationSettings>>(CONFIG_KEYS.translation, DEFAULT_TRANSLATION_SETTINGS)
	const settings: TranslationSettings = { ...DEFAULT_TRANSLATION_SETTINGS, ...stored }
	const update = (patch: Partial<TranslationSettings>) => setStored((previous) => ({ ...DEFAULT_TRANSLATION_SETTINGS, ...previous, ...patch }))
	return { settings, update, configured: settings.apiKey.trim().length > 0 }
}

/** The transcript as shown in the translation view: the original timing and speakers, translated text. */
export function translatedSegments(segments: Segment[], translation: Translation): Segment[] {
	return segments.map((segment, index) => ({ ...segment, text: translation.texts[index] ?? segment.text }))
}

/** A re-transcription changes the segment count; the old translation no longer lines up. */
export function translationOutdated(segments: Segment[], translation: Translation | undefined) {
	return Boolean(translation && translation.texts.length !== segments.length)
}

export interface TranslationRun {
	status: 'running' | 'error'
	/** 0..100 */
	progress: number
	error?: string
}

const runs = new Map<string, TranslationRun>()
const controllers = new Map<string, AbortController>()
const listeners = new Set<() => void>()
let snapshot: ReadonlyMap<string, TranslationRun> = new Map()

function publish() {
	snapshot = new Map(runs)
	for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function useTranslationRun(jobId: string | undefined): TranslationRun | undefined {
	const all = useSyncExternalStore(subscribe, () => snapshot)
	return jobId ? all.get(jobId) : undefined
}

export function translationError(jobId: string) {
	return runs.get(jobId)?.error
}

export function isTranslating(jobId: string) {
	return runs.get(jobId)?.status === 'running'
}

/**
 * Translate a job's segments with DeepL. Resolves with the translation, or null when it failed or was
 * cancelled; the failure stays visible through `useTranslationRun` until the next attempt.
 */
export async function runTranslation(jobId: string, segments: Segment[], request: TranslationRequest, apiKey: string): Promise<Translation | null> {
	if (isTranslating(jobId)) return null
	const controller = new AbortController()
	controllers.set(jobId, controller)
	runs.set(jobId, { status: 'running', progress: 0 })
	publish()
	try {
		const result = await translateTexts(
			apiKey,
			segments.map((segment) => segment.text),
			{
				target: request.target,
				source: request.source,
				signal: controller.signal,
				onProgress: (share) => {
					runs.set(jobId, { status: 'running', progress: Math.round(share * 100) })
					publish()
				},
			},
		)
		runs.delete(jobId)
		publish()
		return { target: request.target, source: request.source, detectedSource: result.detectedSource, texts: result.texts, createdAt: new Date().toISOString() }
	} catch (error) {
		if (controller.signal.aborted) runs.delete(jobId)
		else runs.set(jobId, { status: 'error', progress: 0, error: error instanceof DeepLError ? error.message : `Übersetzung fehlgeschlagen: ${String(error)}` })
		publish()
		return null
	} finally {
		controllers.delete(jobId)
	}
}

export function cancelTranslation(jobId: string) {
	controllers.get(jobId)?.abort()
}
