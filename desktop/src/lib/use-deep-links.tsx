import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { m } from '~/paraglide/messages.js'
import { ModifyState, NamedPath } from './types'
import { pathToNamedPath } from './fs'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { isTrustedModelUrl } from '~/lib/trusted-model-url'
import * as config from '~/lib/config'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import * as os from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'

interface UseDeepLinksProps {
	setFiles: ModifyState<NamedPath[]>
}

export function useDeepLinks({ setFiles }: UseDeepLinksProps) {
	const navigate = useNavigate()

	async function processURLs(urls: string[]): Promise<void> {
		const newFiles: NamedPath[] = []
		for (let url of urls) {
			if (url.startsWith('vibe://download/?url=')) {
				const downloadURL = url.replace('vibe://download/?url=', '')
				// Only model hosts we know, over https, and the whole address in the question (IT review N3).
				if (!isTrustedModelUrl(downloadURL)) {
					await message(`Download abgelehnt: ${downloadURL} liegt nicht bei Hugging Face oder GitHub.`, { kind: 'warning', title: m.downloadModel() })
					break
				}
				const confirm = await ask(`${m.askForDownloadModel()}\n\n${downloadURL}`, { kind: 'info', title: m.downloadModel() })
				if (confirm) {
					navigate('/setup', { state: { downloadURL } })
				}
				break
			} else if (config.videoExtensions.some((e) => url.endsWith(e)) || config.audioExtensions.some((e) => url.endsWith(e))) {
				url = url.replace('file://', '')
				url = decodeURIComponent(url)
				const newFile = await pathToNamedPath(url)
				newFiles.push(newFile)
			}
		}
		setFiles(newFiles)
	}

	async function handleArgv() {
		const argv = await invoke<string[]>('get_argv')
		await processURLs(argv)
	}

	async function handleDeepLinks() {
		const platform = await os.platform()
		if (['windows', 'linux'].includes(platform)) {
			return
		}
		onOpenUrl(async (urls) => {
			await processURLs(urls)
		})
	}

	useEffect(() => {
		handleArgv()
		handleDeepLinks()
	}, [])
}
