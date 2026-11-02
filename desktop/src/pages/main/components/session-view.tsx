import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { translatedSegments } from '~/lib/translation'
import { useSession } from '../session'
import { useTranscriptViewOptions, type TranscriptTab } from '../hooks/use-transcript-view'
import BatchBanner from './batch-banner'
import FileQueue from './file-queue'
import TranscriptToolbar from './transcript-toolbar'
import TranscriptView from './transcript-view'

export default function SessionView() {
	const { queue, summaries } = useSession()
	const [query, setQuery] = useState('')
	const [tab, setTab] = useState<TranscriptTab>('transcript')
	const options = useTranscriptViewOptions()
	const multiple = queue.jobs.length > 1
	const selected = queue.selectedJob
	// The translation is shown through the same view, with translated text and editing switched off.
	const showTranslation = tab === 'translation' && Boolean(selected?.translation)
	const shown = useMemo(
		() => (showTranslation && selected?.translation ? { ...selected, segments: translatedSegments(selected.segments, selected.translation) } : selected),
		[selected, showTranslation],
	)

	useEffect(() => {
		setQuery('')
		setTab('transcript')
	}, [queue.selectedId])

	// A summary that starts, by hand or on its own, opens its tab once so the text is seen arriving.
	useEffect(() => {
		if (!summaries.showSummary) return
		if (summaries.showSummary === queue.selectedId) setTab('summary')
		summaries.clearShowSummary()
	}, [queue.selectedId, summaries])

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, ease: 'easeOut' }}
			className="flex min-h-0 flex-1">
			{multiple && (
				<aside className="hidden w-[264px] shrink-0 border-e border-border md:block">
					<FileQueue />
				</aside>
			)}

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<BatchBanner />
				<TranscriptToolbar job={selected} query={query} setQuery={setQuery} options={options} tab={tab} setTab={setTab} />
				<div className="min-h-0 flex-1">{shown && <TranscriptView job={shown} query={query} options={options} tab={tab} readOnly={showTranslation} />}</div>
			</div>
		</motion.div>
	)
}
