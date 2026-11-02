import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { downloadDir, dirname, join } from '@tauri-apps/api/path'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useSyncExternalStore } from 'react'
import * as config from './config'
import { projectExportFilename } from './project-name'
import type { SourceTimecode } from './timecode'

/** Where the timecode box sits on the bottom edge of the picture. */
export type BurnInPosition = 'center' | 'right'

export type BurnInStatus = 'running' | 'done' | 'saved' | 'error'

/** A video copy with the running timecode burned in, rendered per transcript job. */
export interface BurnInJob {
	jobId: string
	/** Media the render was made from. */
	path: string
	/** Identifies timecode, rate and layout of the render; a different key means it is outdated. */
	key: string
	status: BurnInStatus
	/** 0..100 while running. */
	progress: number
	/** Temp file holding the finished render, until it is saved. */
	output?: string
	/** Where the user saved it. */
	savedTo?: string
	error?: string
}

export interface BurnInOptions {
	wrapAt24Hours: boolean
	position: BurnInPosition
}

const jobs = new Map<string, BurnInJob>()
const listeners = new Set<() => void>()
let snapshot: ReadonlyMap<string, BurnInJob> = new Map()

function commit(job: BurnInJob) {
	jobs.set(job.jobId, job)
	snapshot = new Map(jobs)
	for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

void listen<{ id: string; progress: number }>('burn_in_progress', ({ payload }) => {
	const job = jobs.get(payload.id)
	if (job?.status === 'running') commit({ ...job, progress: payload.progress })
}).catch(() => {
	// Outside Tauri (tests, previews) there is no event bus; progress simply stays at 0.
})

export function isVideoPath(path: string) {
	const dot = path.lastIndexOf('.')
	return dot > 0 && config.videoExtensions.includes(path.slice(dot + 1).toLowerCase())
}

export function burnInKey(timecode: SourceTimecode, options: BurnInOptions) {
	return `${timecode.raw}|${timecode.dropFrame ? 'DF' : 'NDF'}@${timecode.fpsNumerator}/${timecode.fpsDenominator}|${options.wrapAt24Hours ? 'wrap' : 'nowrap'}|${options.position}`
}

/**
 * Start rendering the burned-in copy for a job. A render with the same settings that is running or
 * finished is kept; a different one replaces it. Never throws: failures land in the job's state.
 */
export async function startBurnIn(jobId: string, path: string, timecode: SourceTimecode, options: BurnInOptions) {
	if (!path || !isVideoPath(path)) return
	const key = burnInKey(timecode, options)
	const existing = jobs.get(jobId)
	if (existing && existing.key === key && (existing.status === 'running' || existing.status === 'done')) return
	if (existing?.status === 'running') await invoke('cancel_burn_in', { id: jobId }).catch(() => undefined)
	if (existing?.output && existing.status === 'done') void invoke('discard_burn_in', { path: existing.output }).catch(() => undefined)

	commit({ jobId, path, key, status: 'running', progress: 0 })
	try {
		const output = await invoke<string>('burn_in_timecode', {
			request: {
				id: jobId,
				input: path,
				timecode: timecode.raw,
				fpsNumerator: timecode.fpsNumerator,
				fpsDenominator: timecode.fpsDenominator,
				dropFrame: timecode.dropFrame,
				wrapAt24Hours: options.wrapAt24Hours,
				position: options.position,
			},
		})
		// A newer render may have replaced this one while ffmpeg was busy.
		if (jobs.get(jobId)?.key !== key) {
			void invoke('discard_burn_in', { path: output }).catch(() => undefined)
			return
		}
		commit({ jobId, path, key, status: 'done', progress: 100, output })
	} catch (error) {
		const message = String(error)
		if (jobs.get(jobId)?.key !== key) return
		if (message === 'cancelled') {
			jobs.delete(jobId)
			snapshot = new Map(jobs)
			for (const listener of listeners) listener()
			return
		}
		commit({ jobId, path, key, status: 'error', progress: 0, error: message })
	}
}

export async function cancelBurnIn(jobId: string) {
	await invoke('cancel_burn_in', { id: jobId }).catch(() => undefined)
}

/** Ask where to put the finished render, like the transcript export does. Returns the target or null. */
export async function saveBurnIn(jobId: string, projectName: string): Promise<string | null> {
	const job = jobs.get(jobId)
	if (!job?.output || job.status !== 'done') return null
	const suggestedName = projectExportFilename(projectName, 'mp4').replace(/\.mp4$/i, '_TC.mp4')
	let directory = await dirname(job.path)
	try {
		directory = await downloadDir()
	} catch {
		// Some platforms expose no Downloads folder; the source folder is a fine default.
	}
	const target = await dialog.save({
		filters: [{ name: 'MP4', extensions: ['mp4'] }],
		canCreateDirectories: true,
		defaultPath: await join(directory, suggestedName),
	})
	if (!target) return null
	await invoke('save_burn_in', { source: job.output, target })
	commit({ ...job, status: 'saved', output: undefined, savedTo: target })
	return target
}

export function useBurnIn(jobId: string): BurnInJob | undefined {
	return useSyncExternalStore(subscribe, () => snapshot).get(jobId)
}
