import { describe, expect, test } from 'vitest'
import { exportSegments, mergeIntoParagraphs } from './paragraphs'
import type { Segment } from './transcript'

function cue(start: number, stop: number, text: string, speaker?: number): Segment {
	return { start, stop, text, speaker }
}

describe('mergeIntoParagraphs', () => {
	test('joins consecutive cues of one speaker and keeps the outer times', () => {
		const result = mergeIntoParagraphs([cue(0, 200, ' Wir bauen hier', 0), cue(210, 500, ' seit 2001.', 0), cue(520, 800, ' Und wann?', 1)])
		expect(result).toEqual([cue(0, 500, 'Wir bauen hier seit 2001.', 0), cue(520, 800, 'Und wann?', 1)])
	})

	test('starts a new paragraph after a long pause', () => {
		const result = mergeIntoParagraphs([cue(0, 200, 'Erstens.', 0), cue(600, 800, 'Zweitens.', 0)])
		expect(result).toHaveLength(2)
	})

	test('ends a long paragraph at the next sentence end', () => {
		const result = mergeIntoParagraphs([
			cue(0, 2_900, 'Lang und', 0),
			cue(2_900, 3_100, 'noch mitten im Satz', 0),
			cue(3_100, 3_200, 'fertig.', 0),
			cue(3_200, 3_400, 'Neuer Absatz.', 0),
		])
		expect(result.map((paragraph) => paragraph.text)).toEqual(['Lang und noch mitten im Satz fertig.', 'Neuer Absatz.'])
	})

	test('breaks a monologue without punctuation at the hard limit', () => {
		const cues = Array.from({ length: 20 }, (_, index) => cue(index * 1_000, (index + 1) * 1_000, 'ohne Punkt', 0))
		expect(mergeIntoParagraphs(cues).every((paragraph) => paragraph.stop - paragraph.start <= 9_000)).toBe(true)
	})

	test('treats lines without a speaker as one speaker and drops empty cues', () => {
		const result = mergeIntoParagraphs([cue(0, 100, 'Eins'), cue(100, 150, '  '), cue(150, 300, 'zwei.')])
		expect(result).toEqual([cue(0, 300, 'Eins zwei.')])
	})

	test('does not change the input', () => {
		const input = [cue(0, 100, 'A', 0), cue(100, 200, 'B', 0)]
		mergeIntoParagraphs(input)
		expect(input[0].text).toBe('A')
	})
})

describe('exportSegments', () => {
	test('keeps subtitle cues short', () => {
		const input = [cue(0, 100, 'A', 0), cue(100, 200, 'B', 0)]
		expect(exportSegments(input, 'srt', true)).toBe(input)
		expect(exportSegments(input, 'vtt', true)).toBe(input)
		expect(exportSegments(input, 'pdf', false)).toBe(input)
		expect(exportSegments(input, 'docx', true)).toHaveLength(1)
	})
})
