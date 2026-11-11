import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SafeMarkdown } from './safe-markdown'

describe('SafeMarkdown', () => {
	it('never renders an image the webview would fetch', () => {
		const html = renderToStaticMarkup(<SafeMarkdown>{'Zusammenfassung ![geheim](https://evil.example/x.png?q=Quelle)'}</SafeMarkdown>)
		expect(html).not.toContain('<img')
		expect(html).toContain('[Bild: geheim]')
	})

	it('shows links as text with their address', () => {
		const html = renderToStaticMarkup(<SafeMarkdown>{'[hier](https://example.com/a)'}</SafeMarkdown>)
		expect(html).not.toContain('<a')
		expect(html).toContain('hier')
		expect(html).toContain('https://example.com/a')
	})

	it('keeps ordinary formatting', () => {
		const html = renderToStaticMarkup(<SafeMarkdown>{'**fett** und *kursiv*'}</SafeMarkdown>)
		expect(html).toContain('<strong>fett</strong>')
		expect(html).toContain('<em>kursiv</em>')
	})
})
