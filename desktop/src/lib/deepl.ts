import { fetch } from '@tauri-apps/plugin-http'

/**
 * DeepL API v2 client. Requests go through the Tauri HTTP plugin because DeepL sends no CORS headers,
 * so the webview's own fetch would be refused.
 */

export interface DeepLLanguage {
	/** Target code as DeepL expects it, e.g. `DE`, `EN-GB`, `PT-BR`. */
	code: string
	label: string
}

/** Target languages, German first because the fork is used by a German newsroom. */
export const DEEPL_TARGET_LANGUAGES: DeepLLanguage[] = [
	{ code: 'DE', label: 'Deutsch' },
	{ code: 'EN-GB', label: 'Englisch (UK)' },
	{ code: 'EN-US', label: 'Englisch (US)' },
	{ code: 'AR', label: 'Arabisch' },
	{ code: 'BG', label: 'Bulgarisch' },
	{ code: 'ZH-HANS', label: 'Chinesisch (vereinfacht)' },
	{ code: 'ZH-HANT', label: 'Chinesisch (traditionell)' },
	{ code: 'DA', label: 'Dänisch' },
	{ code: 'ET', label: 'Estnisch' },
	{ code: 'FI', label: 'Finnisch' },
	{ code: 'FR', label: 'Französisch' },
	{ code: 'EL', label: 'Griechisch' },
	{ code: 'ID', label: 'Indonesisch' },
	{ code: 'IT', label: 'Italienisch' },
	{ code: 'JA', label: 'Japanisch' },
	{ code: 'KO', label: 'Koreanisch' },
	{ code: 'LV', label: 'Lettisch' },
	{ code: 'LT', label: 'Litauisch' },
	{ code: 'NL', label: 'Niederländisch' },
	{ code: 'NB', label: 'Norwegisch' },
	{ code: 'PL', label: 'Polnisch' },
	{ code: 'PT-BR', label: 'Portugiesisch (Brasilien)' },
	{ code: 'PT-PT', label: 'Portugiesisch (Portugal)' },
	{ code: 'RO', label: 'Rumänisch' },
	{ code: 'RU', label: 'Russisch' },
	{ code: 'SV', label: 'Schwedisch' },
	{ code: 'SK', label: 'Slowakisch' },
	{ code: 'SL', label: 'Slowenisch' },
	{ code: 'ES', label: 'Spanisch' },
	{ code: 'CS', label: 'Tschechisch' },
	{ code: 'TR', label: 'Türkisch' },
	{ code: 'UK', label: 'Ukrainisch' },
	{ code: 'HU', label: 'Ungarisch' },
]

/** Source languages DeepL accepts: the base code of each target, without regional variants. */
export const DEEPL_SOURCE_LANGUAGES: DeepLLanguage[] = (() => {
	const seen = new Set<string>()
	const sources: DeepLLanguage[] = []
	for (const language of DEEPL_TARGET_LANGUAGES) {
		const code = language.code.split('-')[0]
		if (seen.has(code)) continue
		seen.add(code)
		sources.push({ code, label: language.label.replace(/\s*\(.*\)$/, '') })
	}
	return sources
})()

export function deeplLanguageLabel(code: string | undefined) {
	if (!code) return ''
	const upper = code.toUpperCase()
	return (
		DEEPL_TARGET_LANGUAGES.find((language) => language.code === upper)?.label ??
		DEEPL_SOURCE_LANGUAGES.find((language) => language.code === upper)?.label ??
		upper
	)
}

/** Whisper's language code (`en`, `de`, `auto`) as a DeepL source code, or undefined to let DeepL detect it. */
export function deeplSourceFromWhisper(lang: string | undefined) {
	const code = lang?.trim().toUpperCase()
	if (!code || code === 'AUTO') return undefined
	return DEEPL_SOURCE_LANGUAGES.some((language) => language.code === code) ? code : undefined
}

/** Free keys end in `:fx` and live on their own host. */
export function isFreeKey(apiKey: string) {
	return apiKey.trim().endsWith(':fx')
}

function endpoint(apiKey: string, path: string) {
	return `${isFreeKey(apiKey) ? 'https://api-free.deepl.com' : 'https://api.deepl.com'}/v2/${path}`
}

export class DeepLError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message)
		this.name = 'DeepLError'
	}
}

function errorFor(status: number, body: string) {
	switch (status) {
		case 403:
			return new DeepLError('DeepL lehnt den API-Schlüssel ab. Bitte den Schlüssel in den Einstellungen prüfen.', status)
		case 456:
			return new DeepLError('Das DeepL-Zeichenkontingent ist aufgebraucht.', status)
		case 429:
			return new DeepLError('DeepL meldet zu viele Anfragen. Bitte gleich noch einmal versuchen.', status)
		case 413:
			return new DeepLError('Die Anfrage war zu groß für DeepL.', status)
		default:
			return new DeepLError(`DeepL-Fehler ${status}${body ? `: ${body.slice(0, 200)}` : ''}`, status)
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function request<T>(apiKey: string, path: string, init: { method: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }): Promise<T> {
	const key = apiKey.trim()
	if (!key) throw new DeepLError('Kein DeepL-API-Schlüssel hinterlegt.')
	// 429 and 5xx are transient; back off a few times before giving up.
	for (let attempt = 0; ; attempt++) {
		let response: Response
		try {
			response = await fetch(endpoint(key, path), {
				method: init.method,
				headers: { Authorization: `DeepL-Auth-Key ${key}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
				body: init.body ? JSON.stringify(init.body) : undefined,
				signal: init.signal,
			})
		} catch (error) {
			if (init.signal?.aborted) throw error
			throw new DeepLError(`DeepL ist nicht erreichbar: ${String(error)}`)
		}
		if (response.ok) return (await response.json()) as T
		const transient = response.status === 429 || response.status >= 500
		if (transient && attempt < 4) {
			await sleep(1000 * 2 ** attempt)
			continue
		}
		throw errorFor(response.status, await response.text().catch(() => ''))
	}
}

export interface DeepLUsage {
	characterCount: number
	characterLimit: number
}

export async function fetchUsage(apiKey: string): Promise<DeepLUsage> {
	const usage = await request<{ character_count: number; character_limit: number }>(apiKey, 'usage', { method: 'GET' })
	return { characterCount: usage.character_count, characterLimit: usage.character_limit }
}

export interface TranslateTextsOptions {
	target: string
	/** Omit to let DeepL detect the language. */
	source?: string
	signal?: AbortSignal
	/** Called after every batch with the share done, 0..1. */
	onProgress?: (share: number) => void
}

export interface TranslateTextsResult {
	texts: string[]
	/** What DeepL detected for the first batch, e.g. `EN`. */
	detectedSource?: string
}

/** DeepL takes at most 50 texts per request; the char cap keeps requests well below its 128 KiB limit. */
const MAX_TEXTS_PER_REQUEST = 50
const MAX_CHARS_PER_REQUEST = 30_000
/** Neighbouring lines sent as context: not billed, not translated, but they help with sentence fragments. */
const CONTEXT_LINES = 3

export function batchIndexes(texts: string[]): number[][] {
	const batches: number[][] = []
	let current: number[] = []
	let chars = 0
	texts.forEach((text, index) => {
		if (!text.trim()) return
		if (current.length && (current.length >= MAX_TEXTS_PER_REQUEST || chars + text.length > MAX_CHARS_PER_REQUEST)) {
			batches.push(current)
			current = []
			chars = 0
		}
		current.push(index)
		chars += text.length
	})
	if (current.length) batches.push(current)
	return batches
}

/**
 * Translate each text on its own so the result lines up with the segments one to one; timecodes and
 * speakers stay with their segment. Empty texts are returned unchanged and cost nothing.
 */
export async function translateTexts(apiKey: string, texts: string[], options: TranslateTextsOptions): Promise<TranslateTextsResult> {
	const result = [...texts]
	const batches = batchIndexes(texts)
	let detectedSource: string | undefined
	for (const [batchNumber, indexes] of batches.entries()) {
		const first = indexes[0]
		const context = texts
			.slice(Math.max(0, first - CONTEXT_LINES), first)
			.filter((text) => text.trim())
			.join(' ')
		const response = await request<{ translations: Array<{ text: string; detected_source_language?: string }> }>(apiKey, 'translate', {
			method: 'POST',
			signal: options.signal,
			body: {
				text: indexes.map((index) => texts[index]),
				target_lang: options.target,
				...(options.source ? { source_lang: options.source } : {}),
				...(context ? { context } : {}),
				// Each segment is one unit; DeepL must not merge or split it.
				split_sentences: 'nonewlines',
				preserve_formatting: true,
			},
		})
		response.translations.forEach((translation, position) => {
			result[indexes[position]] = translation.text
		})
		detectedSource ??= response.translations[0]?.detected_source_language
		options.onProgress?.((batchNumber + 1) / batches.length)
	}
	return { texts: result, detectedSource }
}
