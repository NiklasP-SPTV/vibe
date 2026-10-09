import { describe, expect, it } from 'vitest'
import { serializeTranscriptExport, type TranscriptExportOptions } from './transcript-export'
import { parseSourceTimecode } from './timecode'

const segment = [{ start: 0, stop: 100, text: 'Hallo Welt' }]
const sourceTimecode = parseSourceTimecode('09:20:14:08', '25/1')!
const options: TranscriptExportOptions = {
	content: 'transcript',
	showTimestamps: true,
	showSpeakers: false,
	speakerLabel: 'Speaker',
	title: 'Test',
	direction: 'ltr',
	sourceTimecode,
}

describe('source timecode transcript exports', () => {
	it('offsets the live text preview and SRT/VTT cue times', () => {
		expect(serializeTranscriptExport('normal', segment, '', options)).toContain('09:20:14:08 --> 09:20:15:08')
		expect(serializeTranscriptExport('srt', segment, '', options)).toContain('09:20:14,320 --> 09:20:15,320')
		expect(serializeTranscriptExport('vtt', segment, '', options)).toContain('09:20:14.320 --> 09:20:15.320')
	})

	it('always previews DOCX source timecode when a source clock is available', () => {
		const withoutTimestampToggle = { ...options, showTimestamps: false }
		expect(serializeTranscriptExport('docx', segment, '', withoutTimestampToggle)).toContain('09:20:14:08 --> 09:20:15:08')
	})

	it('keeps JSON numeric times absolute and includes SMPTE labels', () => {
		const json = JSON.parse(serializeTranscriptExport('json', segment, '', options))
		expect(json.transcript[0].start).toBeCloseTo(33_614.32, 2)
		expect(json.transcript[0].startTimecode).toBe('09:20:14:08')
		expect(json.sourceTimecode).toEqual({ start: '09:20:14:08', fps: 25, dropFrame: false })
	})

	it('retains the relative-time behavior without a source timecode', () => {
		const { sourceTimecode: _sourceTimecode, ...relativeOptions } = options
		expect(serializeTranscriptExport('srt', segment, '', relativeOptions)).toContain('00:00:00,000 --> 00:00:01,000')
		const json = JSON.parse(serializeTranscriptExport('json', segment, '', relativeOptions))
		expect(json.transcript[0].start).toBe(0)
		expect(json.transcript[0].startTimecode).toBeUndefined()
	})
})
