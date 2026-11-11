/** Hosts a `vibe://download/?url=` link may fetch a model from (IT review N3). */
const TRUSTED_MODEL_HOSTS = ['huggingface.co', 'github.com']

export function isTrustedModelUrl(url: string) {
	try {
		const parsed = new URL(url)
		return parsed.protocol === 'https:' && TRUSTED_MODEL_HOSTS.includes(parsed.hostname.toLowerCase())
	} catch {
		return false
	}
}
