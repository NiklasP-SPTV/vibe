import { useEffect, useRef } from 'react'
import { isVideoPath, startBurnIn } from '~/lib/burn-in'
import { getSourceTimecode } from '~/lib/source-timecode'
import { usePreferenceProvider } from '~/providers/preference'
import type { Job } from './use-transcribe-queue'

/**
 * Start the burned-in video render as soon as a video's transcription starts, so both finish at
 * about the same time. Each job is started once per session; the panel offers re-renders.
 */
export function useAutoBurnIn(jobs: Job[]) {
	const { sourceTimecode: settings } = usePreferenceProvider()
	const started = useRef(new Set<string>())

	useEffect(() => {
		if (!settings.enabled) return
		for (const job of jobs) {
			if (job.status !== 'running' || started.current.has(job.id)) continue
			started.current.add(job.id)
			// The start dialog decides per run; jobs queued some other way follow the settings.
			const choice = job.burnIn ?? { enabled: settings.burnIn, position: settings.burnInPosition }
			if (!choice.enabled || !isVideoPath(job.path)) continue
			void getSourceTimecode(job.path, job.sourceTimecode, settings).then((timecode) => {
				if (timecode) void startBurnIn(job.id, job.path, timecode, { wrapAt24Hours: settings.wrapAt24Hours, position: choice.position })
			})
		}
	}, [jobs, settings])
}
