import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { parseFfmpegBanner, parseProbeOutput, resolveSourceTimecode, type ProbeResult, type SourceTimecode } from './timecode'

export interface SourceTimecodeSettings {
	enabled: boolean
	manualTimecode: string
	manualFps: string
	wrapAt24Hours: boolean
}

const probeCache = new Map<string, ProbeResult | undefined>()
const pending = new Map<string, Promise<ProbeResult | undefined>>()

export async function probeSourceTimecode(path: string): Promise<ProbeResult | undefined> {
	if (!path || !/\.(mp4|mov|m4v)$/i.test(path)) return undefined
	if (probeCache.has(path)) return probeCache.get(path)
	let request = pending.get(path)
	if (!request) {
		request = invoke<string>('probe_media_timecode', { path })
			.then((output) => parseProbeOutput(output) ?? parseFfmpegBanner(output.replace(/^FFMPEG_BANNER\r?\n/, '')))
			.catch(() => undefined)
			.finally(() => pending.delete(path))
		pending.set(path, request)
	}
	const result = await request
	probeCache.set(path, result)
	return result
}

export async function getSourceTimecode(path: string, settings: SourceTimecodeSettings) {
	if (!settings.enabled) return undefined
	const probe = await probeSourceTimecode(path)
	return resolveSourceTimecode(probe, settings)
}

export function useSourceTimecode(path: string, settings: SourceTimecodeSettings) {
	const [probeState, setProbeState] = useState<{ path: string; probe?: ProbeResult; loading: boolean }>({ path: '', loading: false })
	useEffect(() => {
		let active = true
		if (!path || !/\.(mp4|mov|m4v)$/i.test(path)) {
			setProbeState({ path, loading: false })
			return () => { active = false }
		}
		setProbeState({ path, loading: true })
		void probeSourceTimecode(path).then((probe) => {
			if (active) setProbeState({ path, probe, loading: false })
		})
		return () => { active = false }
	}, [path])
	const current = probeState.path === path ? probeState : { path, probe: undefined, loading: false }
	const timecode: SourceTimecode | undefined = settings.enabled ? resolveSourceTimecode(current.probe, settings) : undefined
	const detected = resolveSourceTimecode(current.probe, { enabled: true, manualTimecode: '', manualFps: '' })
	return { timecode, detected, probe: current.probe, loading: current.loading }
}
