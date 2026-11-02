import { Languages } from 'lucide-react'
import { NativeSelect } from '~/components/ui/native-select'
import { Switch } from '~/components/ui/switch'
import { openSettingsSection } from '~/lib/app'
import { DEEPL_SOURCE_LANGUAGES, DEEPL_TARGET_LANGUAGES } from '~/lib/deepl'
import { cn } from '~/lib/style'

export interface TranslationChoice {
	enabled: boolean
	target: string
	/** Empty means detect automatically. */
	source: string
}

const selectClass = 'h-8 w-auto min-w-0 rounded-lg px-2.5 py-0 text-xs'

/** Language pickers shared by the start screen and the translate menu. */
export function LanguagePickers({ choice, onChange, className }: { choice: TranslationChoice; onChange: (choice: TranslationChoice) => void; className?: string }) {
	return (
		<div className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)}>
			<span>aus</span>
			<NativeSelect aria-label="Ausgangssprache" className={selectClass} value={choice.source} onChange={(event) => onChange({ ...choice, source: event.target.value })}>
				<option value="">Automatisch erkennen</option>
				{DEEPL_SOURCE_LANGUAGES.map((language) => (
					<option key={language.code} value={language.code}>
						{language.label}
					</option>
				))}
			</NativeSelect>
			<span>nach</span>
			<NativeSelect aria-label="Zielsprache" className={selectClass} value={choice.target} onChange={(event) => onChange({ ...choice, target: event.target.value })}>
				{DEEPL_TARGET_LANGUAGES.map((language) => (
					<option key={language.code} value={language.code}>
						{language.label}
					</option>
				))}
			</NativeSelect>
		</div>
	)
}

/** One quiet row in the start screen: off shows just the switch, on reveals the languages. */
export function TranslationOptions({ configured, choice, onChange }: { configured: boolean; choice: TranslationChoice; onChange: (choice: TranslationChoice) => void }) {
	if (!configured) {
		return (
			<div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
				<Languages className="h-3.5 w-3.5 shrink-0" />
				<span>Übersetzung mit DeepL:</span>
				<button type="button" className="cursor-pointer text-foreground underline-offset-2 hover:underline" onClick={() => openSettingsSection('translation')}>
					API-Schlüssel einrichten
				</button>
			</div>
		)
	}
	return (
		<div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/65 px-3 py-1.5">
			<label className="flex cursor-pointer items-center gap-2 text-sm">
				<Languages className="h-3.5 w-3.5 text-muted-foreground" />
				Übersetzen
				<Switch checked={choice.enabled} onCheckedChange={(enabled) => onChange({ ...choice, enabled })} aria-label="Transkript übersetzen" />
			</label>
			{choice.enabled && <LanguagePickers choice={choice} onChange={onChange} />}
		</div>
	)
}
