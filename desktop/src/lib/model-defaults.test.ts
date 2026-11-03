import { describe, expect, test } from 'vitest'
import type { ModelOptions } from '~/providers/preference'
import { DEFAULT_MAX_TEXT_CTX, withCurrentDefaults } from './model-defaults'

const stored = (patch: Partial<ModelOptions>): ModelOptions => ({ lang: 'de', verbose: false, sampling_strategy: 'beam search', ...patch })

describe('withCurrentDefaults', () => {
	test('moves the old install defaults to the new ones once', () => {
		const options = withCurrentDefaults(stored({ temperature: 0.4, max_text_ctx: 64 }))
		expect(options.temperature).toBe(0)
		expect(options.max_text_ctx).toBe(DEFAULT_MAX_TEXT_CTX)
		expect(options.defaults_revision).toBe(2)
	})

	test('keeps values the user chose', () => {
		const options = withCurrentDefaults(stored({ temperature: 0.2, max_text_ctx: 128 }))
		expect(options.temperature).toBe(0.2)
		expect(options.max_text_ctx).toBe(128)
	})

	test('a revision-1 config only gets the context change', () => {
		const options = withCurrentDefaults(stored({ temperature: 0.4, max_text_ctx: 64, defaults_revision: 1 }))
		expect(options.temperature).toBe(0.4)
		expect(options.max_text_ctx).toBe(DEFAULT_MAX_TEXT_CTX)
	})

	test('leaves an up-to-date config alone', () => {
		const options = withCurrentDefaults(stored({ max_text_ctx: 64, defaults_revision: 2 }))
		expect(options.max_text_ctx).toBe(64)
	})
})
