import { describe, expect, it } from 'vitest'
import { isTrustedModelUrl } from './trusted-model-url'

describe('isTrustedModelUrl', () => {
	it('accepts https links to Hugging Face and GitHub', () => {
		expect(isTrustedModelUrl('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin')).toBe(true)
		expect(isTrustedModelUrl('https://github.com/thewh1teagle/vibe/releases/download/x/model.bin')).toBe(true)
	})

	it('refuses other hosts, look-alikes and plain http', () => {
		expect(isTrustedModelUrl('https://evil.example/model.bin')).toBe(false)
		expect(isTrustedModelUrl('https://huggingface.co.evil.example/model.bin')).toBe(false)
		expect(isTrustedModelUrl('http://huggingface.co/model.bin')).toBe(false)
		expect(isTrustedModelUrl('not a url')).toBe(false)
	})
})
