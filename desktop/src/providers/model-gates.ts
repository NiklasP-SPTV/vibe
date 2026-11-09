import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { ask } from '@tauri-apps/plugin-dialog'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import * as config from '~/lib/config'
import type { ModelIntegrity } from '~/lib/config'
import { isModelFileUsable } from '~/lib/model'
import { diarizeEngineInfo, type DiarizeEngine } from '~/lib/diarize-engine'
import { MAX_QUALITY_MODEL } from '~/lib/quality-mode'
import { usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'

/**
 * Speaker recognition and stable timestamps each need a model on disk. Turning them on therefore
 * means: check for the file, ask before pulling it, download with a progress toast, and only then
 * flip the preference. The transcription options popover and the settings page share this so the
 * gate behaves the same wherever the switch lives.
 */
export function useModelGates() {
	const preference = usePreferenceProvider()
	const progressToast = useToastProvider()

	const ensureModel = useCallback(
		async (options: { filename: string; url: string; title: string; question: string; downloading: string; integrity?: ModelIntegrity }) => {
			const modelsFolder = await invoke<string>('get_models_folder')
			const modelPath = await join(modelsFolder, options.filename)
			// A file that fails its integrity check does not count as installed — download it again.
			if (await isModelFileUsable(modelPath)) return true

			const confirmed = await ask(options.question, { title: options.title, kind: 'info' })
			if (!confirmed) return false

			progressToast.setMessage(options.downloading)
			progressToast.setOpen(true)
			progressToast.setProgress(0)
			try {
				await invoke('download_model', { url: options.url, path: modelPath, integrity: options.integrity })
				toast.success(m.downloadComplete())
				return true
			} finally {
				progressToast.setOpen(false)
				progressToast.setProgress(null)
			}
		},
		[progressToast],
	)

	/** True once the given speaker model is on disk, asking to download it when it is not. */
	const ensureDiarizeModel = useCallback(
		(engine: DiarizeEngine) => {
			const info = diarizeEngineInfo(engine)
			return ensureModel({
				filename: info.filename,
				url: info.url,
				integrity: info.integrity,
				title: m.diarization(),
				question: m.downloadDiarizeModel(),
				downloading: m.downloadingDiarizeModel(),
			})
		},
		[ensureModel],
	)

	const toggleDiarization = useCallback(
		async (checked: boolean) => {
			if (!checked) {
				preference.setDiarizeEnabled(false)
				return
			}
			try {
				if (await ensureDiarizeModel(preference.diarizeEngine)) preference.setDiarizeEnabled(true)
			} catch (error) {
				console.error('diarization setup failed:', error)
				toast.error(String(error))
			}
		},
		[ensureDiarizeModel, preference],
	)

	/** Switches the speaker model, downloading it first; a declined or failed download keeps the old one. */
	const chooseDiarizeEngine = useCallback(
		async (engine: DiarizeEngine) => {
			try {
				if (await ensureDiarizeModel(engine)) preference.setDiarizeEngine(engine)
			} catch (error) {
				console.error('speaker model setup failed:', error)
				toast.error(String(error))
			}
		},
		[ensureDiarizeModel, preference],
	)

	const toggleStableTimestamps = useCallback(
		async (checked: boolean) => {
			if (!checked) {
				preference.setStableTimestampsEnabled(false)
				return
			}
			try {
				const ready = await ensureModel({
					filename: config.vadModelFilename,
					url: config.vadModelUrl,
					title: m.stableTimestamps(),
					question: m.stableTimestampsConfirm(),
					downloading: m.downloadingVadModel(),
				})
				if (ready) preference.setStableTimestampsEnabled(true)
			} catch (error) {
				console.error('stable timestamps setup failed:', error)
				toast.error(String(error))
			}
		},
		[ensureModel, preference],
	)

	/**
	 * The max quality mode needs the full large-v3 model and the voice activity model. Both are
	 * asked for in one question, since they only make sense together.
	 */
	const ensureMaxQuality = useCallback(async () => {
		const modelsFolder = await invoke<string>('get_models_folder')
		const needed = [
			{ filename: MAX_QUALITY_MODEL.filename, url: MAX_QUALITY_MODEL.url, label: `Sprachmodell large-v3 (${MAX_QUALITY_MODEL.sizeLabel})` },
			{ filename: config.vadModelFilename, url: config.vadModelUrl, label: 'Sprachfilter (VAD, wenige MB)' },
		]
		const missing = []
		for (const model of needed) {
			const path = await join(modelsFolder, model.filename)
			if (!(await isModelFileUsable(path))) missing.push({ ...model, path })
		}
		if (missing.length === 0) return true

		const list = missing.map((model) => `• ${model.label}`).join('\n')
		const question = `Für „Maximale Qualität“ wird einmalig heruntergeladen:\n\n${list}\n\nJetzt herunterladen?`
		if (!(await ask(question, { title: 'Maximale Qualität', kind: 'info' }))) return false

		try {
			for (const model of missing) {
				progressToast.setMessage(`${model.label} wird heruntergeladen …`)
				progressToast.setOpen(true)
				progressToast.setProgress(0)
				await invoke('download_model', { url: model.url, path: model.path })
			}
			toast.success(m.downloadComplete())
			return true
		} catch (error) {
			console.error('max quality setup failed:', error)
			toast.error(String(error))
			return false
		} finally {
			progressToast.setOpen(false)
			progressToast.setProgress(null)
		}
	}, [progressToast])

	return { toggleDiarization, chooseDiarizeEngine, toggleStableTimestamps, ensureMaxQuality }
}
