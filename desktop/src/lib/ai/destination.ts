import type { AiConnection } from './config'

/**
 * Where a summary, an answer or a dictation clean-up sends its text. Anything that leaves this
 * machine counts as cloud: the transcript goes there whole, speaker names included (IT review M3).
 */
export interface AiDestination {
	/** The text leaves this computer. */
	cloud: boolean
	/** Short name for the interface, e.g. "Anthropic (Cloud)". */
	label: string
	/** Stable id for remembering that the person agreed to send there. */
	key: string
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function hostOf(url: string) {
	try {
		return new URL(url).hostname.toLowerCase()
	} catch {
		return url.trim().toLowerCase() || 'unbekannt'
	}
}

export function aiDestination(connection: AiConnection): AiDestination {
	if (connection.platform === 'ollama') {
		const host = hostOf(connection.ollamaBaseUrl)
		return LOCAL_HOSTS.has(host)
			? { cloud: false, label: 'Ollama (lokal)', key: 'ollama:local' }
			: { cloud: true, label: `Ollama auf ${host}`, key: `ollama:${host}` }
	}
	if (connection.platform === 'openai') {
		const host = hostOf(connection.openaiBaseUrl)
		if (LOCAL_HOSTS.has(host)) return { cloud: false, label: `${host} (lokal)`, key: 'openai:local' }
		return { cloud: true, label: host === 'api.openai.com' ? 'OpenAI (Cloud)' : `${host} (Cloud)`, key: `openai:${host}` }
	}
	return { cloud: true, label: 'Anthropic (Cloud)', key: 'claude' }
}
