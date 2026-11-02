import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { NativeSelect } from '~/components/ui/native-select'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { DEEPL_TARGET_LANGUAGES, DeepLError, fetchUsage, isFreeKey, type DeepLUsage } from '~/lib/deepl'
import { useTranslationSettings } from '~/lib/translation'
import { rowControlClass, SettingsField, SettingsGroup, SettingsNote, SettingsRow } from './shared'

const numbers = new Intl.NumberFormat('de-DE')

export function TranslationSection() {
	const { settings, update, configured } = useTranslationSettings()
	const [revealed, setRevealed] = useState(false)
	const [check, setCheck] = useState<{ state: 'idle' | 'checking' } | { state: 'ok'; usage: DeepLUsage } | { state: 'error'; message: string }>({ state: 'idle' })
	const free = isFreeKey(settings.apiKey)

	async function verify() {
		setCheck({ state: 'checking' })
		try {
			setCheck({ state: 'ok', usage: await fetchUsage(settings.apiKey) })
		} catch (error) {
			setCheck({ state: 'error', message: error instanceof DeepLError ? error.message : String(error) })
		}
	}

	return (
		<div className="space-y-6">
			<SettingsGroup title="DeepL" description="Übersetzt Transkripte Abschnitt für Abschnitt – Timecodes und Sprecher bleiben erhalten.">
				<SettingsField
					label="API-Schlüssel"
					description="Zu finden im DeepL-Konto unter „API-Schlüssel“. Free-Schlüssel enden auf „:fx“."
					footer={
						check.state === 'ok' ? (
							<span className="inline-flex items-center gap-1 text-foreground">
								<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
								Verbunden · {numbers.format(check.usage.characterCount)} von {numbers.format(check.usage.characterLimit)} Zeichen genutzt
							</span>
						) : check.state === 'error' ? (
							<span className="text-destructive">{check.message}</span>
						) : undefined
					}>
					<div className="flex items-center gap-1.5">
						<Input
							value={settings.apiKey}
							onChange={(event) => {
								update({ apiKey: event.target.value })
								setCheck({ state: 'idle' })
							}}
							placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
							type={revealed ? 'text' : 'password'}
							autoComplete="off"
							spellCheck={false}
							className={`flex-1 font-mono text-xs ${rowControlClass}`}
						/>
						<Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" aria-label={revealed ? 'Schlüssel verbergen' : 'Schlüssel anzeigen'} onClick={() => setRevealed(!revealed)}>
							{revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
						</Button>
						<Button variant="outline" className={rowControlClass} disabled={!configured || check.state === 'checking'} onClick={() => void verify()}>
							{check.state === 'checking' ? <Spinner className="h-3.5 w-3.5" /> : 'Prüfen'}
						</Button>
					</div>
				</SettingsField>
				{configured && (
					<SettingsNote>
						{free
							? 'Free-Schlüssel: DeepL darf übermittelte Texte speichern und zur Verbesserung nutzen. Nur für unbedenkliches Material verwenden.'
							: 'Pro-Schlüssel: Laut DeepL werden Texte nach der Übersetzung gelöscht und nicht zum Training verwendet.'}
					</SettingsNote>
				)}
			</SettingsGroup>

			<SettingsGroup title="Standardwerte" description="Vorauswahl im Startbildschirm; pro Durchgang änderbar.">
				<SettingsRow label="Standardmäßig übersetzen">
					<Switch checked={settings.translateByDefault} disabled={!configured} onCheckedChange={(translateByDefault) => update({ translateByDefault })} />
				</SettingsRow>
				<SettingsRow label="Zielsprache">
					<NativeSelect value={settings.defaultTarget} onChange={(event) => update({ defaultTarget: event.target.value })} className={`w-56 ${rowControlClass} py-0`}>
						{DEEPL_TARGET_LANGUAGES.map((language) => (
							<option key={language.code} value={language.code}>
								{language.label}
							</option>
						))}
					</NativeSelect>
				</SettingsRow>
			</SettingsGroup>
		</div>
	)
}
