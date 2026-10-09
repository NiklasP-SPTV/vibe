import { describe, expect, it } from 'vitest'
import { formatSourceMilliseconds, formatSourceTimecode, parseFrameRate, parseProbeOutput, parseSourceTimecode, resolveSourceTimecode } from './timecode'

describe('source timecode frame arithmetic', () => {
	it('parses 25 fps and adds relative frames', () => {
		const source = parseSourceTimecode('09:20:14:08', '25/1')!
		expect(formatSourceTimecode(0, source)).toBe('09:20:14:08')
		expect(formatSourceTimecode(100, source)).toBe('09:20:15:08')
		expect(formatSourceMilliseconds(0, source, ',')).toBe('09:20:14,320')
	})

	it('parses 24 fps', () => {
		const source = parseSourceTimecode('00:00:00:23', 24)!
		expect(formatSourceTimecode(100, source)).toBe('00:00:01:23')
	})

	it('parses 29.97 NDF with the exact rational frame rate', () => {
		const source = parseSourceTimecode('00:00:00:29', '30000/1001')!
		expect(source.fpsNumerator).toBe(30000)
		expect(formatSourceTimecode(100, source)).toBe('00:00:01:29')
	})

	it('round-trips 29.97 DF minute and ten-minute boundaries', () => {
		const rate = parseFrameRate('29.97')!
		const minute = parseSourceTimecode('00:01:00;02', rate)!
		const tenMinutes = parseSourceTimecode('00:10:00;00', rate)!
		expect(minute.startFrames).toBe(1800)
		expect(formatSourceTimecode(0, minute)).toBe('00:01:00;02')
		expect(tenMinutes.startFrames).toBe(17982)
		expect(formatSourceTimecode(0, tenMinutes)).toBe('00:10:00;00')
	})

	it('supports 59.94 drop frame and rejects skipped frame labels', () => {
		const source = parseSourceTimecode('00:01:00;04', '59.94')!
		expect(formatSourceTimecode(0, source)).toBe('00:01:00;04')
		expect(parseSourceTimecode('00:01:00;00', '29.97')).toBeUndefined()
	})

	it('crosses midnight and wraps at 24 hours by default', () => {
		const source = parseSourceTimecode('23:59:59:24', 25)!
		expect(formatSourceTimecode(4, source)).toBe('00:00:00:00')
		expect(formatSourceTimecode(4, source, false)).toBe('24:00:00:00')
		const dropFrame = parseSourceTimecode('23:59:59;29', '29.97')!
		expect(formatSourceTimecode(4, dropFrame)).toBe('00:00:00;00')
	})

	it('keeps zero offset exact', () => {
		const source = parseSourceTimecode('01:02:03:04', 25)!
		expect(formatSourceTimecode(0, source)).toBe('01:02:03:04')
	})

	it('selects tmcd before format and video tags', () => {
		const parsed = parseProbeOutput(JSON.stringify({
			streams: [
				{ codec_type: 'video', codec_tag_string: 'avc1', r_frame_rate: '25/1', tags: { timecode: '00:00:00:01' } },
				{ codec_type: 'data', codec_tag_string: 'tmcd', r_frame_rate: '0/0', tags: { timecode: '00:00:00:02' } },
			],
			format: { tags: { timecode: '00:00:00:03' } },
		}))
		expect(parsed?.timecode).toBe('00:00:00:02')
		expect(resolveSourceTimecode(parsed, { enabled: true, manualTimecode: '', manualFps: '' })?.startFrames).toBe(2)
	})

	it('returns no timecode for malformed files and uses manual fallback', () => {
		expect(parseProbeOutput('not json')).toBeUndefined()
		expect(resolveSourceTimecode(undefined, { enabled: true, manualTimecode: '00:00:05:00', manualFps: '25' })?.raw).toBe('00:00:05:00')
		expect(resolveSourceTimecode(undefined, { enabled: true, manualTimecode: '', manualFps: '' })).toBeUndefined()
	})
})
