import { describe, expect, it } from 'vitest'
import {
	formatSourceMilliseconds,
	formatSourceTimecode,
	parseFrameRate,
	parseProbeOutput,
	parseSourceTimecode,
	parseTimecodeInput,
	resolveSourceTimecode,
} from './timecode'

describe('SMPTE source timecode', () => {
	it('adds relative Whisper time at 25 fps and 24 fps', () => {
		const source = parseSourceTimecode('09:20:14:08', '25/1')!
		expect(formatSourceTimecode(0, source)).toBe('09:20:14:08')
		expect(formatSourceTimecode(100, source)).toBe('09:20:15:08')
		expect(formatSourceMilliseconds(0, source, ',')).toBe('09:20:14,320')
		const fps24 = parseSourceTimecode('00:00:00:23', 24)!
		expect(formatSourceTimecode(100, fps24)).toBe('00:00:01:23')
	})

	it('uses exact rational math for 29.97 NDF and DF', () => {
		const ndf = parseSourceTimecode('00:00:00:29', '30000/1001')!
		expect(ndf.fpsNumerator).toBe(30000)
		expect(formatSourceTimecode(100, ndf)).toBe('00:00:01:29')
		const dfRate = parseFrameRate('29.97')!
		const minute = parseSourceTimecode('00:01:00;02', dfRate)!
		const tenMinutes = parseSourceTimecode('00:10:00;00', dfRate)!
		expect(minute.startFrames).toBe(1800)
		expect(formatSourceTimecode(0, minute)).toBe('00:01:00;02')
		expect(tenMinutes.startFrames).toBe(17982)
		expect(formatSourceTimecode(0, tenMinutes)).toBe('00:10:00;00')
	})

	it('crosses midnight with optional wrapping and preserves a zero offset', () => {
		const source = parseSourceTimecode('23:59:59:24', 25)!
		expect(formatSourceTimecode(4, source)).toBe('00:00:00:00')
		expect(formatSourceTimecode(4, source, false)).toBe('24:00:00:00')
		expect(formatSourceTimecode(0, parseSourceTimecode('01:02:03:04', 25)!)).toBe('01:02:03:04')
	})

	it('applies the per-file manual timecode before the embedded one', () => {
		const probe = { timecode: '01:00:00:00', frameRate: '25/1', source: 'tmcd' as const }
		const manual = resolveSourceTimecode(probe, { timecode: '09:20:14:08', fps: '25' })!
		expect(manual.raw).toBe('09:20:14:08')
		expect(manual.source).toBe('manual')
		expect(formatSourceTimecode(0, manual)).toBe('09:20:14:08')
		const same = resolveSourceTimecode(probe, { timecode: '01:00:00:00', fps: '25' })!
		expect(same.source).toBe('tmcd')
	})

	it('accepts compact manual input and reports missing or invalid frame rates', () => {
		expect(parseTimecodeInput({ timecode: '09201408', fps: '25' }).timecode?.raw).toBe('09:20:14:08')
		expect(parseTimecodeInput({ timecode: '09:20:14:08', fps: '' }).error).toBe('Framerate fehlt')
		expect(parseTimecodeInput({ timecode: '09:20:14:08', fps: 'invalid' }).error).toBe('Ungültige Framerate')
		expect(parseTimecodeInput({ timecode: '', fps: '' })).toEqual({})
		expect(parseTimecodeInput({ timecode: '09:20:14:08', fps: '' }, { frameRate: '25/1' }).timecode?.fps).toBe(25)
	})

	it('prefers tmcd metadata and safely handles files with no timecode', () => {
		const parsed = parseProbeOutput(JSON.stringify({
			streams: [
				{ codec_type: 'video', codec_tag_string: 'avc1', r_frame_rate: '25/1', tags: { timecode: '00:00:00:01' } },
				{ codec_type: 'data', codec_tag_string: 'tmcd', tags: { timecode: '00:00:00:02' } },
			],
			format: { tags: { timecode: '00:00:00:03' } },
		}))
		expect(parsed?.timecode).toBe('00:00:00:02')
		expect(parseProbeOutput('not json')).toBeUndefined()
		expect(parseProbeOutput(JSON.stringify({ streams: [{ codec_type: 'video', r_frame_rate: '25/1' }] }))).toEqual({ frameRate: '25/1' })
		expect(resolveSourceTimecode(undefined)).toBeUndefined()
	})
})
