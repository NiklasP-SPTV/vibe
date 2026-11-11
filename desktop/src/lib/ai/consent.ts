import { ask } from '@tauri-apps/plugin-dialog'
import { CONFIG_KEYS } from '~/lib/config-keys'
import { readConfig, writeConfig } from '~/lib/config-store'
import type { AiDestination } from './destination'

/**
 * Asks once per destination before a transcript first leaves the machine, and remembers the yes.
 * Local models never ask. Without a window to ask in (`interactive: false`), a destination that
 * was never confirmed is simply not used (IT review M3).
 */
export async function confirmCloudSend(destination: AiDestination, options: { interactive?: boolean } = {}) {
	if (!destination.cloud) return true
	const agreed = readConfig<string[]>(CONFIG_KEYS.aiCloudConsent, [])
	if (agreed.includes(destination.key)) return true
	if (options.interactive === false) return false
	const question = [
		`Das vollständige Transkript wird mit Sprechernamen an ${destination.label} übertragen und dort verarbeitet.`,
		'Für vertrauliches Material nur mit einem freigegebenen Vertrag nutzen.',
		'',
		'Jetzt und künftig an diesen Dienst senden?',
	].join('\n')
	const confirmed = await ask(question, { title: 'Übertragung an einen KI-Dienst', kind: 'warning', okLabel: 'Senden', cancelLabel: 'Abbrechen' })
	if (confirmed) writeConfig(CONFIG_KEYS.aiCloudConsent, [...agreed, destination.key])
	return confirmed
}
