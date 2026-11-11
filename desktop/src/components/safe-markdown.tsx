import Markdown, { type Components } from 'react-markdown'

/**
 * Markdown from a language model, rendered without anything that reaches the network. An image
 * in the model's answer would be fetched the moment it renders, and its URL can carry text from
 * the transcript: audio with a spoken instruction could turn a summary into a leak, even with a
 * local model (IT review M2). Images therefore show as their alt text, and links as text with
 * their address, never as something the webview loads or follows.
 */
const components: Components = {
	img: ({ alt }) => <span className="text-muted-foreground">[Bild{alt ? `: ${alt}` : ''}]</span>,
	a: ({ children, href }) => (
		<span>
			{children}
			{href && <span className="text-muted-foreground"> ({href})</span>}
		</span>
	),
}

export function SafeMarkdown({ children }: { children: string }) {
	return <Markdown components={components}>{children}</Markdown>
}
