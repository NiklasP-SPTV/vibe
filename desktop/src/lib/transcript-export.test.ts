import { describe, expect, it } from 'vitest'
import { serializeTranscriptExport, type TranscriptExportOptions } from './transcript-export'
import { parseSourceTimecode } from './timecode'

const segments = [{ start: 0, stop: 100, text: 'Hallo Welt' }]
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

describe('per-file timecode exports', () => {
	it('offsets the preview, SRT and VTT using the manually selected start', () => {
		expect(serializeTranscriptExport('normal', segments, '', options)).toContain('09:20:14:08 --> 09:20:15:08')
		expect(serializeTranscriptExport('srt', segments, '', options)).toContain('09:20:14,320 --> 09:20:15,320')
		expect(serializeTranscriptExport('vtt', segments, '', options)).toContain('09:20:14.320 --> 09:20:15.320')
	})

	it('always shows SMPTE timecode in the DOCX preview when available', () => {
		expect(serializeTranscriptExport('docx', segments, '', { ...options, showTimestamps: false })).toContain('09:20:14:08 --> 09:20:15:08')
	})

	it('leaves old relative formatting unchanged when no timecode is supplied', () => {
		const result = serializeTranscriptExport('srt', segments, '', { ...options, sourceTimecode: undefined })
		expect(result).toContain('00:00:00,000 --> 00:00:01,000')
	})
})
