import { describe, expect, it } from 'vitest'
import { asDiarizeEngine, diarizeEngineInfo } from './diarize-engine'

describe('diarize engine', () => {
	it('keeps the speaker model a user picked', () => {
		expect(asDiarizeEngine('nemotron')).toBe('nemotron')
		expect(asDiarizeEngine('sortformer')).toBe('sortformer')
	})

	it('falls back to Sortformer for missing or unknown values', () => {
		expect(asDiarizeEngine(undefined)).toBe('sortformer')
		expect(asDiarizeEngine('pyannote')).toBe('sortformer')
	})

	it('names model files the engine can tell apart', () => {
		// vibe-server picks Nemotron when the file name contains "nemotron".
		expect(diarizeEngineInfo('nemotron').filename.toLowerCase()).toContain('nemotron')
		expect(diarizeEngineInfo('sortformer').filename.toLowerCase()).not.toContain('nemotron')
	})
})
