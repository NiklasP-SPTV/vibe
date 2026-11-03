import { AudioLines, Clapperboard, Gauge, Sparkles, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { NativeSelect } from '~/components/ui/native-select'
import { Switch } from '~/components/ui/switch'
import { isVideoPath, type BurnInPosition } from '~/lib/burn-in'
import { QUALITY_MODES, useLastQualityMode, type QualityMode } from '~/lib/quality-mode'
import { cn } from '~/lib/style'
import { parseTimecodeInput } from '~/lib/timecode'
import { useTranslationSettings } from '~/lib/translation'
import { useModelGates } from '~/providers/model-gates'
import { useSession } from '../session'
import { TranslationOptions, type TranslationChoice } from './translation-options'

function SectionLabel({ children }: { children: ReactNode }) {
	return <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{children}</p>
}

/** One labelled line with its control on the right, the shape every option below shares. */
function OptionLine({ icon, label, note, children }: { icon: ReactNode; label: string; note?: string; children: ReactNode }) {
	return (
		<div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/65 px-3 py-1.5">
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<span className="text-muted-foreground">{icon}</span>
				<span>{label}</span>
				{note && <span className="text-xs text-muted-foreground">{note}</span>}
			</div>
			<div className="flex items-center gap-2">{children}</div>
		</div>
	)
}

/**
 * Everything decided before a run, in one place: the start timecode of each file, how thorough the
 * transcription is, and what is made alongside it (burned-in video, translation). It opens for every
 * file that comes in — dropped, picked or added to a running session.
 */
export default function TranscribeSetupDialog() {
	const { pendingFiles, pendingLoading, updatePendingTimecode, startPendingTranscription, cancelPendingFiles, preference } = useSession()
	const modelGates = useModelGates()
	const translation = useTranslationSettings()
	const [lastQuality, setLastQuality] = useLastQualityMode()
	const [quality, setQuality] = useState<QualityMode>(lastQuality)
	const [preparing, setPreparing] = useState(false)
	const [burnIn, setBurnIn] = useState(preference.sourceTimecode.burnIn)
	const [burnInPosition, setBurnInPosition] = useState<BurnInPosition>(preference.sourceTimecode.burnInPosition)
	const [translationChoice, setTranslationChoice] = useState<TranslationChoice>({ enabled: false, target: 'DE', source: '' })

	const open = pendingFiles.length > 0 || pendingLoading
	// Each new batch starts from the defaults: the last quality, the settings for the rest.
	useEffect(() => {
		if (!open) return
		setQuality(lastQuality)
		setBurnIn(preference.sourceTimecode.burnIn)
		setBurnInPosition(preference.sourceTimecode.burnInPosition)
		setTranslationChoice({ enabled: translation.settings.translateByDefault, target: translation.settings.defaultTarget, source: '' })
		// Only on opening: later changes to the settings must not reset what is being picked.
	}, [open])

	const timecodeErrors = new Map(pendingFiles.map((file) => [file.path, parseTimecodeInput(file.sourceTimecode).error] as const))
	const timecodeInvalid = [...timecodeErrors.values()].some(Boolean)
	const timecodeEnabled = preference.sourceTimecode.enabled
	const hasVideo = pendingFiles.some((file) => isVideoPath(file.path))
	const translate = translation.configured && translationChoice.enabled
	const needsModel = quality === 'standard' && !preference.modelPath
	const count = pendingFiles.length

	async function pickQuality(next: QualityMode) {
		if (next === quality) return
		if (next === 'max') {
			// Downloading now lets the large model arrive while the timecodes are still being checked.
			setPreparing(true)
			const ready = await modelGates.ensureMaxQuality().finally(() => setPreparing(false))
			if (!ready) return
		}
		setQuality(next)
		setLastQuality(next)
	}

	async function start() {
		if (quality === 'max') {
			setPreparing(true)
			const ready = await modelGates.ensureMaxQuality().finally(() => setPreparing(false))
			if (!ready) return
		}
		startPendingTranscription({
			quality,
			burnIn: timecodeEnabled && hasVideo ? { enabled: burnIn, position: burnInPosition } : undefined,
			translation: translate ? { target: translationChoice.target, source: translationChoice.source || undefined } : undefined,
		})
	}

	return (
		<Dialog open={open} onOpenChange={(next) => !next && cancelPendingFiles()}>
			<DialogContent className="flex max-h-[90vh] w-[calc(100%_-_1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
				<DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pe-14">
					<DialogTitle className="text-lg">{count === 1 ? '1 Datei transkribieren' : `${count} Dateien transkribieren`}</DialogTitle>
					<DialogDescription>{pendingLoading ? 'Timecodes werden ausgelesen …' : 'Einstellungen prüfen, dann starten.'}</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
					{timecodeEnabled && count > 0 && (
						<section className="space-y-2">
							<div className="flex items-baseline justify-between gap-2">
								<SectionLabel>Start-Timecode</SectionLabel>
								<span className="text-[11px] text-muted-foreground">HH:MM:SS:FF · „;“ für Drop-Frame</span>
							</div>
							<div className="max-h-48 space-y-2 overflow-y-auto pe-1">
								{pendingFiles.map((file) => (
									<div
										key={file.path}
										className="grid grid-cols-[minmax(0,1fr)_minmax(110px,150px)_minmax(64px,84px)] items-center gap-2 rounded-xl border border-border/70 bg-background/65 p-2">
										<p className="truncate ps-1 text-sm font-medium" title={file.name}>
											{file.name}
										</p>
										<Input
											aria-label={`Start-Timecode ${file.name}`}
											className="h-8 rounded-lg font-mono text-xs"
											placeholder="10:00:00:00"
											value={file.sourceTimecode.timecode}
											onChange={(event) => updatePendingTimecode(file.path, { ...file.sourceTimecode, timecode: event.target.value })}
										/>
										<Input
											aria-label={`Framerate ${file.name}`}
											className="h-8 rounded-lg font-mono text-xs"
											placeholder="fps"
											value={file.sourceTimecode.fps}
											onChange={(event) => updatePendingTimecode(file.path, { ...file.sourceTimecode, fps: event.target.value })}
										/>
										{timecodeErrors.get(file.path) && (
											<p className="col-span-full px-1 text-[11px] text-destructive">{timecodeErrors.get(file.path)}</p>
										)}
									</div>
								))}
							</div>
						</section>
					)}
					{!timecodeEnabled && count > 0 && (
						<section className="space-y-1">
							<SectionLabel>Dateien</SectionLabel>
							{pendingFiles.map((file) => (
								<p key={file.path} className="truncate text-sm" title={file.name}>
									{file.name}
								</p>
							))}
						</section>
					)}

					<section className="space-y-2">
						<SectionLabel>Qualität</SectionLabel>
						<div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Qualität">
							{QUALITY_MODES.map((mode) => (
								<button
									key={mode.value}
									type="button"
									role="radio"
									aria-checked={quality === mode.value}
									disabled={preparing}
									onClick={() => void pickQuality(mode.value)}
									className={cn(
										'flex cursor-pointer flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-start transition-colors disabled:cursor-wait',
										quality === mode.value ? 'border-foreground/60 bg-muted' : 'border-border/70 bg-background/65 hover:bg-muted/50',
									)}>
									<span className="flex items-center gap-2 text-sm font-medium">
										{mode.value === 'max' ? <Sparkles className="h-3.5 w-3.5" /> : <Gauge className="h-3.5 w-3.5" />}
										{mode.label}
									</span>
									<span className="text-xs text-muted-foreground">{mode.description}</span>
								</button>
							))}
						</div>
					</section>

					<section className="space-y-2">
						<SectionLabel>Optionen</SectionLabel>
						<OptionLine icon={<AudioLines className="h-3.5 w-3.5" />} label="Gesprochene Sprache">
							<LanguageInput variant="prominent" />
						</OptionLine>
						<OptionLine icon={<Users className="h-3.5 w-3.5" />} label={m.recognizeSpeakers()}>
							<Switch
								aria-label={m.recognizeSpeakers()}
								checked={preference.diarizeEnabled}
								onCheckedChange={(value) => void modelGates.toggleDiarization(value)}
							/>
						</OptionLine>
						{timecodeEnabled && hasVideo && (
							<OptionLine icon={<Clapperboard className="h-3.5 w-3.5" />} label="Video mit Timecode-Einblendung">
								{burnIn && (
									<NativeSelect
										aria-label="Position der Einblendung"
										className="h-8 w-auto rounded-lg px-2.5 py-0 text-xs"
										value={burnInPosition}
										onChange={(event) => setBurnInPosition(event.target.value === 'right' ? 'right' : 'center')}>
										<option value="center">Unten mittig</option>
										<option value="right">Unten rechts</option>
									</NativeSelect>
								)}
								<Switch aria-label="Video mit Timecode-Einblendung" checked={burnIn} onCheckedChange={setBurnIn} />
							</OptionLine>
						)}
						<TranslationOptions configured={translation.configured} choice={translationChoice} onChange={setTranslationChoice} />
					</section>
				</div>

				<DialogFooter className="shrink-0 border-t border-border/60 px-5 py-3">
					{needsModel && <p className="me-auto self-center text-xs text-destructive">{m.noModelSelected()}</p>}
					<Button variant="ghost" className="h-9 rounded-lg" onClick={cancelPendingFiles}>
						Abbrechen
					</Button>
					<Button
						className="h-9 rounded-lg"
						disabled={pendingLoading || preparing || timecodeInvalid || needsModel || count === 0}
						onClick={() => void start()}>
						{translate ? 'Transkribieren & übersetzen' : m.transcribe()} · {count}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
