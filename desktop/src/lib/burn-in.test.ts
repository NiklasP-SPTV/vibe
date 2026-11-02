import { describe, expect, it } from 'vitest'
import { burnInKey, isVideoPath } from './burn-in'
import { parseSourceTimecode } from './timecode'

describe('burn-in helpers', () => {
	it('only renders video files', () => {
		expect(isVideoPath('C:\\clips\\Interview.MP4')).toBe(true)
		expect(isVideoPath('/clips/take.mov')).toBe(true)
		expect(isVideoPath('/clips/audio.wav')).toBe(false)
		expect(isVideoPath('')).toBe(false)
	})

	it('changes the key when timecode, rate or layout change', () => {
		const tc = parseSourceTimecode('10:00:00:00', '25')!
		const other = parseSourceTimecode('10:00:00:00', '30000/1001')!
		const options = { wrapAt24Hours: true, position: 'center' as const }
		expect(burnInKey(tc, options)).toBe(burnInKey(parseSourceTimecode('10:00:00:00', '25')!, options))
		expect(burnInKey(tc, options)).not.toBe(burnInKey(other, options))
		expect(burnInKey(tc, options)).not.toBe(burnInKey(tc, { ...options, position: 'right' }))
	})
})
