import type { TextFormat } from '~/components/format-select'
import type { Segment } from '~/lib/transcript'

/**
 * Whisper cuts speech into short cues of a few seconds. Subtitles want those, but a document read
 * by an author does not: every cue on its own line with its own timecode turns a two-minute answer
 * into forty fragments. Reading formats therefore join consecutive cues of one speaker into
 * paragraphs, the way Trint lays out an interview, and keep the first cue's start and the last
 * cue's end, so the timecode of every paragraph still points at the source.
 *
 * All times are in centiseconds, like `Segment.start` and `Segment.stop`.
 */
export interface ParagraphOptions {
	/** A pause longer than this always starts a new paragraph, even for the same speaker. */
	maxGap: number
	/** Past this length a paragraph ends at the next sentence end. */
	softMaxDuration: number
	/** Past this length a paragraph ends no matter what, so a timecode is never too far away. */
	hardMaxDuration: number
}

export const DEFAULT_PARAGRAPH_OPTIONS: ParagraphOptions = {
	maxGap: 300,
	softMaxDuration: 3_000,
	hardMaxDuration: 9_000,
}

/** Subtitles keep their short cues; every other format reads better in paragraphs. */
export function formatSupportsParagraphs(format: TextFormat) {
	return format !== 'srt' && format !== 'vtt'
}

const SENTENCE_END = /[.!?…]["'»«“”‘’)\]]*$/

function endsSentence(text: string) {
	return SENTENCE_END.test(text.trim())
}

function belongsToParagraph(paragraph: Segment, next: Segment, options: ParagraphOptions) {
	if (paragraph.speaker !== next.speaker) return false
	if (next.start - paragraph.stop > options.maxGap) return false
	const duration = paragraph.stop - paragraph.start
	if (duration >= options.hardMaxDuration) return false
	if (duration >= options.softMaxDuration && endsSentence(paragraph.text)) return false
	return true
}

export function mergeIntoParagraphs(segments: Segment[], options: ParagraphOptions = DEFAULT_PARAGRAPH_OPTIONS): Segment[] {
	const paragraphs: Segment[] = []
	for (const segment of segments) {
		const text = segment.text.trim()
		if (!text) continue
		const current = paragraphs[paragraphs.length - 1]
		if (current && belongsToParagraph(current, segment, options)) {
			current.text = `${current.text} ${text}`
			current.stop = Math.max(current.stop, segment.stop)
		} else {
			paragraphs.push({ ...segment, text })
		}
	}
	return paragraphs
}

/** The segments an export writes: paragraphs when asked for and the format reads as a document. */
export function exportSegments(segments: Segment[], format: TextFormat, paragraphs: boolean): Segment[] {
	return paragraphs && formatSupportsParagraphs(format) ? mergeIntoParagraphs(segments) : segments
}
