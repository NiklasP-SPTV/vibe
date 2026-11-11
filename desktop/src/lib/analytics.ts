export const analyticsEvents = {
	TRANSCRIBE_STARTED: 'transcribe_started',
	TRANSCRIBE_SUCCEEDED: 'transcribe_succeeded',
	TRANSCRIBE_FAILED: 'transcribe_failed',
	TRANSCRIBE_CANCELLED: 'transcribe_cancelled',
	GPU_OUT_OF_MEMORY: 'gpu_out_of_memory',
} as const

/** Which of the four transcription entry points an event came from. */
export type TranscribeSource = 'home' | 'batch' | 'main' | 'hotkey'

type AnalyticsProps = Record<string, string | number>

/**
 * Telemetry is removed from this fork (IT review H1): events go nowhere. The helpers below keep
 * upstream's call sites unchanged so merges stay simple.
 */
export async function trackAnalyticsEvent(_eventName: string, _props?: AnalyticsProps) {}

function fileExt(path: string) {
	return path.split('.').pop() ?? 'unknown'
}

/**
 * Every transcription must report exactly one terminal event — succeeded, failed or cancelled — so
 * a start without one means the app died mid-run rather than "the user stopped it".
 *
 * The start event carries what is known before the run: the file's extension and how long the audio
 * is. Those are the denominator; attaching them only to successes made "do long files fail more?"
 * unanswerable.
 */
export async function trackTranscribeStarted(source: TranscribeSource, path: string) {
	await trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_STARTED, { source, file_ext: fileExt(path) })
}

export function trackTranscribeSucceeded(source: TranscribeSource, options: { durationSeconds: number; segmentsCount: number }) {
	return trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_SUCCEEDED, {
		source,
		duration_seconds: options.durationSeconds,
		segments_count: options.segmentsCount,
	})
}

/**
 * `error_kind` separates the failures worth acting on from the ones the person caused (a broken
 * file, a bad request); user errors used to emit nothing at all, which lost their start events.
 */
export function trackTranscribeFailed(source: TranscribeSource, path: string, options: { errorMessage: string; userError?: boolean }) {
	return trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
		source,
		error_message: options.errorMessage,
		file_ext: fileExt(path),
		error_kind: options.userError ? 'user' : 'internal',
	})
}

/** The user stopped this run. The backend returns the partial result as a success, so only the UI knows. */
/**
 * The GPU ran out of memory mid-run and the model was reloaded on the CPU. `signal` says how it
 * showed: an error code from server, or the process aborting on the allocation.
 */
export function trackGpuOutOfMemory(source: TranscribeSource, options: { signal: 'error_code' | 'process_death' }) {
	void trackAnalyticsEvent(analyticsEvents.GPU_OUT_OF_MEMORY, { source, signal: options.signal })
}

export function trackTranscribeCancelled(source: TranscribeSource, path: string) {
	return trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_CANCELLED, {
		source,
		file_ext: fileExt(path),
	})
}
