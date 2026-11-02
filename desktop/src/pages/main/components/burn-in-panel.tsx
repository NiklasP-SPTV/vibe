import { Clapperboard, FolderOpen, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Progress } from '~/components/ui/progress'
import { openPath } from '~/lib/app'
import { burnInKey, cancelBurnIn, isVideoPath, saveBurnIn, startBurnIn, useBurnIn } from '~/lib/burn-in'
import type { SourceTimecode } from '~/lib/timecode'
import { usePreferenceProvider } from '~/providers/preference'
import type { Job } from '../hooks/use-transcribe-queue'

/** Status and actions for the video copy with burned-in timecode, below the timecode line. */
export function BurnInPanel({ job, timecode }: { job: Job; timecode?: SourceTimecode }) {
	const { sourceTimecode: settings } = usePreferenceProvider()
	const render = useBurnIn(job.id)
	if (!settings.enabled || !isVideoPath(render?.path ?? job.path)) return null

	const options = { wrapAt24Hours: settings.wrapAt24Hours, position: settings.burnInPosition }
	const outdated = Boolean(render && timecode && render.key !== burnInKey(timecode, options))
	const start = () => {
		if (timecode) void startBurnIn(job.id, job.path, timecode, options)
	}
	const save = async () => {
		try {
			const target = await saveBurnIn(job.id, job.name)
			if (target) {
				toast.success('Video mit Timecode gespeichert', {
					position: 'bottom-center',
					action: { label: 'Im Ordner zeigen', onClick: () => openPath({ name: '', path: target }) },
				})
			}
		} catch (error) {
			toast.error(String(error), { position: 'bottom-center' })
		}
	}

	const row = 'flex flex-wrap items-center gap-2 text-xs text-muted-foreground'
	const button = 'h-8 rounded-lg px-2.5 text-xs'

	if (!render) {
		if (!timecode || job.status === 'running' || job.status === 'queued') return null
		return (
			<div className={row}>
				<Button variant="outline" size="sm" className={button} onClick={start}>
					<Clapperboard className="size-3.5" /> Video mit TC erstellen
				</Button>
			</div>
		)
	}

	if (render.status === 'running') {
		return (
			<div className={row} role="status">
				<span>Video mit TC wird erstellt … {Math.floor(render.progress)} %</span>
				<Progress value={render.progress} className="h-1.5 w-40" />
				<Button variant="ghost" size="sm" className={button} onClick={() => void cancelBurnIn(job.id)}>
					<X className="size-3.5" /> Abbrechen
				</Button>
			</div>
		)
	}

	if (render.status === 'error') {
		return (
			<div className="space-y-1">
				<p className="max-h-24 overflow-auto whitespace-pre-wrap text-xs text-destructive">{render.error}</p>
				{timecode && (
					<Button variant="outline" size="sm" className={button} onClick={start}>
						<RotateCcw className="size-3.5" /> Erneut versuchen
					</Button>
				)}
			</div>
		)
	}

	return (
		<div className={row}>
			<Button size="sm" className={button} onClick={() => void save()}>
				<Clapperboard className="size-3.5" /> Video mit TC speichern …
			</Button>
			{render.savedTo && (
				<Button variant="ghost" size="sm" className={button} onClick={() => void openPath({ name: '', path: render.savedTo! })}>
					<FolderOpen className="size-3.5" /> Zuletzt gespeichert – im Ordner zeigen
				</Button>
			)}
			{outdated && <span>Timecode oder Layout wurde geändert.</span>}
			{timecode && outdated && (
				<Button variant="ghost" size="sm" className={button} onClick={start}>
					<RotateCcw className="size-3.5" /> Neu erstellen
				</Button>
			)}
		</div>
	)
}
