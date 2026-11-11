import { describe, expect, it } from 'vitest'
import { DEFAULT_AI, type AiConnection } from './config'
import { aiDestination } from './destination'

const connection = (patch: Partial<AiConnection>): AiConnection => ({ ...DEFAULT_AI.connection, ...patch })

describe('aiDestination', () => {
	it('counts Claude as cloud', () => {
		expect(aiDestination(connection({ platform: 'claude' }))).toMatchObject({ cloud: true, label: 'Anthropic (Cloud)' })
	})

	it('counts Ollama on this machine as local, elsewhere as leaving it', () => {
		expect(aiDestination(connection({ platform: 'ollama', ollamaBaseUrl: 'http://localhost:11434' })).cloud).toBe(false)
		expect(aiDestination(connection({ platform: 'ollama', ollamaBaseUrl: 'http://127.0.0.1:11434' })).cloud).toBe(false)
		expect(aiDestination(connection({ platform: 'ollama', ollamaBaseUrl: 'http://gpu-box.intern:11434' }))).toMatchObject({
			cloud: true,
			key: 'ollama:gpu-box.intern',
		})
	})

	it('names the host of an OpenAI-compatible endpoint', () => {
		expect(aiDestination(connection({ platform: 'openai', openaiBaseUrl: 'https://api.openai.com/v1' })).label).toBe('OpenAI (Cloud)')
		expect(aiDestination(connection({ platform: 'openai', openaiBaseUrl: 'https://llm.example.org/v1' }))).toMatchObject({
			cloud: true,
			label: 'llm.example.org (Cloud)',
		})
		expect(aiDestination(connection({ platform: 'openai', openaiBaseUrl: 'http://localhost:8080/v1' })).cloud).toBe(false)
	})
})
