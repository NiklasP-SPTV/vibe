import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import type { BurnInPosition } from './burn-in'
import {
	detectedSourceTimecode,
	formatFrameRateInput,
	parseFfmpegBanner,
	parseProbeOutput,
	parseTimecodeInput,
	resolveSourceTimecode,
	type ProbeResult,
	type SourceTimecode,
	type TimecodeInput,
} from './timecode'

/** Global switches only; the start timecode itself is chosen per file in the start screen. */
export interface SourceTimecodeSettings {
	enabled: boolean
	wrapAt24Hours: boolean
	/** Render a video copy with the timecode burned in while transcribing. */
	burnIn: boolean
	burnInPosition: BurnInPosition
}

export const DEFAULT_SOURCE_TIMECODE_SETTINGS: SourceTimecodeSettings = { enabled: true, wrapAt24Hours: true, burnIn: true, burnInPosition: 'center' }

/** Fill fields an older build or a hand-edited config left out. */
export function completeSourceTimecodeSettings(stored: Partial<SourceTimecodeSettings> | undefined): SourceTimecodeSettings {
	return {
		enabled: stored?.enabled ?? DEFAULT_SOURCE_TIMECODE_SETTINGS.enabled,
		wrapAt24Hours: stored?.wrapAt24Hours ?? DEFAULT_SOURCE_TIMECODE_SETTINGS.wrapAt24Hours,
		burnIn: stored?.burnIn ?? DEFAULT_SOURCE_TIMECODE_SETTINGS.burnIn,
		burnInPosition: stored?.burnInPosition === 'right' ? 'right' : DEFAULT_SOURCE_TIMECODE_SETTINGS.burnInPosition,
	}
}

const probeCache = new Map<string, ProbeResult | undefined>()
const pending = new Map<string, Promise<ProbeResult | undefined>>()

/** Read the embedded timecode of any media file. Files without one resolve to undefined, never throw. */
export async function probeSourceTimecode(path: string): Promise<ProbeResult | undefined> {
	if (!path) return undefined
	if (probeCache.has(path)) return probeCache.get(path)
	let request = pending.get(path)
	if (!request) {
		request = invoke<string>('probe_media_timecode', { path })
			.then((output) => (output ? (parseProbeOutput(output) ?? parseFfmpegBanner(output.replace(/^FFMPEG_BANNER\r?\n/, ''))) : undefined))
			.catch(() => undefined)
			.finally(() => pending.delete(path))
		pending.set(path, request)
	}
	const result = await request
	probeCache.set(path, result)
	return result
}

/** Prefill values for the start screen: the file's own timecode and frame rate when it has them. */
export function prefillFromProbe(probe: ProbeResult | undefined, fallbackFps = '25'): TimecodeInput {
	const detected = detectedSourceTimecode(probe)
	return {
		timecode: detected?.raw ?? '',
		fps: formatFrameRateInput(probe?.frameRate) || fallbackFps,
	}
}

/** Non-hook variant used by auto-export: same priority as the transcript view. */
export async function getSourceTimecode(path: string, input: TimecodeInput | undefined, settings: SourceTimecodeSettings) {
	if (!settings.enabled) return undefined
	// A complete manual input does not need the file at all (works for audio files and missing media).
	if (input && (!input.timecode.trim() || input.fps.trim())) return resolveSourceTimecode(undefined, input)
	const probe = await probeSourceTimecode(path)
	return resolveSourceTimecode(probe, input)
}

export interface SourceTimecodeState {
	/** The timecode actually applied to preview and exports. */
	timecode?: SourceTimecode
	/** What the file itself carries, independent of the per-file input. */
	detected?: SourceTimecode
	probe?: ProbeResult
	loading: boolean
	/** Validation message when the per-file input could not be used. */
	error?: string
}

export function useSourceTimecode(path: string, input: TimecodeInput | undefined, settings: SourceTimecodeSettings): SourceTimecodeState {
	const [probeState, setProbeState] = useState<{ path: string; probe?: ProbeResult; loading: boolean }>({ path: '', loading: false })
	useEffect(() => {
		let active = true
		if (!path || !settings.enabled) {
			setProbeState({ path, loading: false })
			return () => {
				active = false
			}
		}
		setProbeState({ path, loading: true })
		void probeSourceTimecode(path).then((probe) => {
			if (active) setProbeState({ path, probe, loading: false })
		})
		return () => {
			active = false
		}
	}, [path, settings.enabled])
	const current = probeState.path === path ? probeState : { path, probe: undefined, loading: Boolean(path && settings.enabled) }
	if (!settings.enabled) return { loading: false }
	const detected = detectedSourceTimecode(current.probe)
	if (input) {
		const parsed = parseTimecodeInput(input, current.probe)
		// A manual input without fps waits for the probe's frame rate before it counts as invalid.
		const waiting = current.loading && !input.fps.trim() && Boolean(input.timecode.trim())
		return { timecode: parsed.timecode, detected, probe: current.probe, loading: waiting, error: waiting ? undefined : parsed.error }
	}
	return { timecode: detected, detected, probe: current.probe, loading: current.loading }
}

function rateLabel(timecode: SourceTimecode) {
	return `${formatFrameRateInput(`${timecode.fpsNumerator}/${timecode.fpsDenominator}`)} fps ${timecode.dropFrame ? 'DF' : 'NDF'}`
}

const sourceNames: Record<SourceTimecode['source'], string> = {
	tmcd: 'aus Datei (tmcd)',
	format: 'aus Datei (Container)',
	video: 'aus Datei (Videostream)',
	manual: 'manuell gesetzt',
}

/** One status sentence for the transcript header and the export dialog. */
export function describeSourceTimecode(state: SourceTimecodeState, input: TimecodeInput | undefined, settings: SourceTimecodeSettings) {
	if (!settings.enabled) return 'Source-Timecode deaktiviert – Zeitangaben bleiben relativ.'
	if (state.loading) return 'Source-Timecode wird geprüft …'
	if (state.timecode) return `Start-Timecode ${state.timecode.raw} · ${rateLabel(state.timecode)} · ${sourceNames[state.timecode.source]}`
	if (input && input.timecode.trim()) return `Start-Timecode „${input.timecode.trim()}“ ungültig${state.error ? ` (${state.error})` : ''} – Zeitangaben bleiben relativ.`
	if (input) {
		return state.detected
			? `Kein Start-Timecode gesetzt (in Datei: ${state.detected.raw}) – Zeitangaben bleiben relativ.`
			: 'Kein Start-Timecode gesetzt – Zeitangaben bleiben relativ.'
	}
	return 'Kein Source-Timecode gefunden – Zeitangaben bleiben relativ.'
}
