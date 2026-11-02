import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { updateTranscriptTranslation } from '~/lib/transcripts-store'
import { runTranslation, translationError, useTranslationSettings } from '~/lib/translation'
import type { Job, TranscribeQueue } from './use-transcribe-queue'

/**
 * Translate each transcript the user asked to have translated as soon as it is finished. A translation
 * that finishes before the project file exists is written once the file has been saved.
 */
export function useAutoTranslate(queue: Pick<TranscribeQueue, 'jobs' | 'setJobTranslation'>) {
	const { settings } = useTranslationSettings()
	const started = useRef(new Set<string>())
	const unsaved = useRef(new Set<string>())
	const { jobs, setJobTranslation } = queue

	useEffect(() => {
		for (const job of jobs) {
			if (!wantsTranslation(job) || started.current.has(job.id)) continue
			started.current.add(job.id)
			const request = job.translationRequest!
			void runTranslation(job.id, job.segments, request, settings.apiKey).then(async (translation) => {
				if (!translation) {
					const error = translationError(job.id)
					if (error) toast.error(`Übersetzung von „${job.name}“ fehlgeschlagen`, { description: error, position: 'bottom-center', duration: 10000 })
					return
				}
				if (!(await setJobTranslation(job.id, translation))) unsaved.current.add(job.id)
			})
		}
		for (const job of jobs) {
			if (!unsaved.current.has(job.id) || !job.savedPath || !job.translation) continue
			unsaved.current.delete(job.id)
			void updateTranscriptTranslation(job.savedPath, job.translation)
		}
	}, [jobs, setJobTranslation, settings.apiKey])
}

function wantsTranslation(job: Job) {
	return Boolean(job.translationRequest && job.status === 'done' && !job.hydrated && !job.translation && job.segments.length > 0)
}
