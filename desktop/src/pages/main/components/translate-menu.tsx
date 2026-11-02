import { Languages } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { openSettingsSection } from '~/lib/app'
import { deeplLanguageLabel, isFreeKey } from '~/lib/deepl'
import { cn } from '~/lib/style'
import { cancelTranslation, runTranslation, translationOutdated, useTranslationRun, useTranslationSettings } from '~/lib/translation'
import { useSession } from '../session'
import type { Job } from '../hooks/use-transcribe-queue'
import type { TranscriptTab } from '../hooks/use-transcript-view'
import { LanguagePickers, type TranslationChoice } from './translation-options'

/** "Original | Deutsch": visible in the toolbar as soon as a translation exists. */
export function TranslationToggle({ job, tab, setTab }: { job: Job | null; tab: TranscriptTab; setTab: (tab: TranscriptTab) => void }) {
	if (!job?.translation) return null
	const options: Array<{ value: TranscriptTab; label: string }> = [
		{ value: 'transcript', label: 'Original' },
		{ value: 'translation', label: deeplLanguageLabel(job.translation.target) },
	]
	return (
		<div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5" role="radiogroup" aria-label="Sprache der Anzeige">
			{options.map((option) => {
				const active = option.value === 'translation' ? tab === 'translation' : tab !== 'translation'
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => setTab(option.value)}
						className={cn(
							'cursor-pointer rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors duration-150',
							active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
						)}>
						{option.label}
					</button>
				)
			})}
		</div>
	)
}

function describe(job: Job) {
	const translation = job.translation
	if (!translation) return ''
	const from = translation.source ? deeplLanguageLabel(translation.source) : translation.detectedSource ? `${deeplLanguageLabel(translation.detectedSource)} (erkannt)` : 'automatisch'
	const when = new Date(translation.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
	return `${from} → ${deeplLanguageLabel(translation.target)} · ${when}`
}

/** Translate, re-translate or cancel; the language pickers live here so the toolbar stays small. */
export function TranslateMenu({ job, setTab }: { job: Job | null; setTab: (tab: TranscriptTab) => void }) {
	const { queue } = useSession()
	const translation = useTranslationSettings()
	const run = useTranslationRun(job?.id)
	const [open, setOpen] = useState(false)
	const [choice, setChoice] = useState<TranslationChoice>({ enabled: true, target: 'DE', source: '' })

	if (!job) return null
	const running = run?.status === 'running'
	const hasText = job.segments.length > 0 && job.status !== 'running' && job.status !== 'queued'
	const outdated = translationOutdated(job.segments, job.translation)
	const label = running ? `Übersetze … ${run.progress} %` : job.translation ? '' : 'Übersetzen'

	function onOpenChange(next: boolean) {
		if (next) {
			// Open on what this transcript already has, else on the defaults from settings.
			setChoice({
				enabled: true,
				target: job?.translation?.target ?? translation.settings.defaultTarget,
				source: job?.translation?.source ?? '',
			})
		}
		setOpen(next)
	}

	async function start() {
		if (!job) return
		setOpen(false)
		const result = await runTranslation(job.id, job.segments, { target: choice.target, source: choice.source || undefined }, translation.settings.apiKey)
		if (!result) return
		await queue.setJobTranslation(job.id, result)
		setTab('translation')
		toast.success(`Übersetzung nach ${deeplLanguageLabel(result.target)} fertig`, { position: 'bottom-center' })
	}

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="sm" className="rounded-full px-3 text-[13px] font-medium" aria-label="Übersetzung" title="Übersetzung mit DeepL">
					{running ? <Spinner className="h-3.5 w-3.5" /> : <Languages className="h-3.5 w-3.5" />}
					{label}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 rounded-2xl p-4">
				<p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">Übersetzung · DeepL</p>
				{!translation.configured ? (
					<div className="space-y-2 text-sm">
						<p className="text-muted-foreground">Für Übersetzungen wird ein DeepL-API-Schlüssel benötigt.</p>
						<Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => openSettingsSection('translation')}>
							Schlüssel einrichten
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						{job.translation && <p className="text-xs text-muted-foreground">{describe(job)}</p>}
						{outdated && <p className="text-xs text-amber-600 dark:text-amber-400">Das Transkript wurde neu erstellt – bitte neu übersetzen.</p>}
						{running ? (
							<div className="space-y-2">
								<Progress value={run.progress} className="h-1.5" />
								<Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs" onClick={() => cancelTranslation(job.id)}>
									Abbrechen
								</Button>
							</div>
						) : (
							<>
								<LanguagePickers choice={choice} onChange={setChoice} />
								<Button size="sm" className="h-8 w-full rounded-lg text-xs" disabled={!hasText} onClick={() => void start()}>
									{job.translation ? 'Neu übersetzen' : 'Übersetzen'}
								</Button>
							</>
						)}
						{run?.status === 'error' && <p className="text-xs text-destructive">{run.error}</p>}
						{isFreeKey(translation.settings.apiKey) && <p className="text-[11px] text-muted-foreground">Free-Schlüssel: nur für unbedenkliches Material.</p>}
					</div>
				)}
			</PopoverContent>
		</Popover>
	)
}
