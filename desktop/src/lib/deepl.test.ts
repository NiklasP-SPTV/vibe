import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }))

import { batchIndexes, deeplSourceFromWhisper, isFreeKey, translateTexts } from './deepl'

function ok(body: unknown) {
	return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

describe('deepl', () => {
	beforeEach(() => {
		fetchMock.mockReset()
	})

	it('tells free keys from pro keys', () => {
		expect(isFreeKey('abc:fx')).toBe(true)
		expect(isFreeKey('abc')).toBe(false)
	})

	it('maps whisper languages to DeepL sources', () => {
		expect(deeplSourceFromWhisper('en')).toBe('EN')
		expect(deeplSourceFromWhisper('auto')).toBeUndefined()
		expect(deeplSourceFromWhisper('haw')).toBeUndefined()
	})

	it('batches by count and skips empty texts', () => {
		const texts = Array.from({ length: 120 }, (_, index) => (index === 5 ? ' ' : `line ${index}`))
		const batches = batchIndexes(texts)
		expect(batches.map((batch) => batch.length)).toEqual([50, 50, 19])
		expect(batches.flat()).not.toContain(5)
	})

	it('translates segment by segment and keeps the order', async () => {
		fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
			const body = JSON.parse(init.body) as { text: string[] }
			return ok({ translations: body.text.map((text) => ({ text: text.toUpperCase(), detected_source_language: 'EN' })) })
		})
		const progress: number[] = []
		const result = await translateTexts('key:fx', ['hello', '', 'world'], { target: 'DE', onProgress: (share) => progress.push(share) })
		expect(result).toEqual({ texts: ['HELLO', '', 'WORLD'], detectedSource: 'EN' })
		expect(progress).toEqual([1])
		const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }]
		expect(url).toBe('https://api-free.deepl.com/v2/translate')
		expect(init.headers.Authorization).toBe('DeepL-Auth-Key key:fx')
		expect(JSON.parse(init.body)).toMatchObject({ target_lang: 'DE', split_sentences: 'nonewlines' })
	})

	it('explains a rejected key', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}), text: async () => '' })
		await expect(translateTexts('bad', ['hi'], { target: 'DE' })).rejects.toThrow('API-Schlüssel')
	})
})
