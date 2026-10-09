/** SMPTE timecode utilities. Transcript times are integer centiseconds. */
export interface FrameRate {
	numerator: number
	denominator: number
	fps: number
	nominal: number
}

export interface SourceTimecode {
	startFrames: number
	fps: number
	fpsNumerator: number
	fpsDenominator: number
	nominalFps: number
	dropFrame: boolean
	raw: string
	source: 'tmcd' | 'format' | 'video' | 'manual'
}

export interface ProbeResult {
	timecode?: string
	frameRate?: string
	source?: SourceTimecode['source']
}

export function parseFrameRate(value: string | number): FrameRate | undefined {
	const text = String(value).trim()
	const match = text.match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/)
	if (!match) return undefined
	let numerator = Number(match[1])
	let denominator = Number(match[2] ?? 1)
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) return undefined
	let fps = numerator / denominator
	// Use the exact broadcast-rate ratios when ffprobe reports rounded decimals.
	const broadcastRates: Array<[number, number, number]> = [[23.976, 24000, 1001], [29.97, 30000, 1001], [59.94, 60000, 1001]]
	for (const [rounded, exactNumerator, exactDenominator] of broadcastRates) {
		if (Math.abs(fps - rounded) < 0.005 || Math.abs(fps - exactNumerator / exactDenominator) < 0.0001) {
			numerator = exactNumerator
			denominator = exactDenominator
			fps = numerator / denominator
			break
		}
	}
	return { numerator, denominator, fps, nominal: Math.round(fps) }
}

function dropCount(nominal: number) {
	return nominal === 30 ? 2 : nominal === 60 ? 4 : 0
}

export function parseSourceTimecode(
	timecode: string,
	frameRate: string | number | FrameRate,
	source: SourceTimecode['source'] = 'manual',
): SourceTimecode | undefined {
	const rate = typeof frameRate === 'object' ? frameRate : parseFrameRate(frameRate)
	if (!rate) return undefined
	const match = timecode.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})([:;])(\d{2})$/)
	if (!match) return undefined
	const hours = Number(match[1])
	const minutes = Number(match[2])
	const seconds = Number(match[3])
	const frames = Number(match[5])
	const isDrop = match[4] === ';'
	if (minutes > 59 || seconds > 59 || frames >= rate.nominal) return undefined
	const drop = isDrop ? dropCount(rate.nominal) : 0
	if (isDrop && (!drop || Math.abs(rate.fps - rate.nominal) < 0.001)) return undefined
	if (drop && minutes % 10 !== 0 && seconds === 0 && frames < drop) return undefined
	const totalMinutes = hours * 60 + minutes
	const startFrames = (hours * 3600 + minutes * 60 + seconds) * rate.nominal + frames - drop * (totalMinutes - Math.floor(totalMinutes / 10))
	if (startFrames < 0) return undefined
	return {
		startFrames,
		fps: rate.fps,
		fpsNumerator: rate.numerator,
		fpsDenominator: rate.denominator,
		nominalFps: rate.nominal,
		dropFrame: isDrop,
		raw: timecode.trim(),
		source,
	}
}

/** ffprobe source priority: tmcd stream, format metadata, then video stream metadata. */
export function parseProbeOutput(output: string): ProbeResult | undefined {
	try {
		const data = JSON.parse(output) as {
			streams?: Array<{ codec_type?: string; codec_tag_string?: string; r_frame_rate?: string; avg_frame_rate?: string; tags?: Record<string, string> }>
			format?: { tags?: Record<string, string> }
		}
		const streams = data.streams ?? []
		const video = streams.find((stream) => stream.codec_type === 'video')
		const frameRate = video?.avg_frame_rate && video.avg_frame_rate !== '0/0' ? video.avg_frame_rate : video?.r_frame_rate
		const tmcd = streams.find((stream) => stream.codec_tag_string?.toLowerCase() === 'tmcd' && getTag(stream.tags, 'timecode'))
		const formatTimecode = getTag(data.format?.tags, 'timecode')
		const videoTimecode = getTag(video?.tags, 'timecode')
		const chosen = tmcd ? { timecode: getTag(tmcd.tags, 'timecode')!, source: 'tmcd' as const }
			: formatTimecode ? { timecode: formatTimecode, source: 'format' as const }
				: videoTimecode ? { timecode: videoTimecode, source: 'video' as const }
					: undefined
		if (!chosen || !frameRate) return undefined
		return { ...chosen, frameRate }
	} catch {
		return undefined
	}
}

function getTag(tags: Record<string, string> | undefined, name: string) {
	if (!tags) return undefined
	const key = Object.keys(tags).find((entry) => entry.toLowerCase() === name.toLowerCase())
	return key ? tags[key] : undefined
}

/** Best-effort parser for the metadata banner printed by `ffmpeg -i` when ffprobe is absent. */
export function parseFfmpegBanner(output: string): ProbeResult | undefined {
	const lines = output.split(/\r?\n/)
	const videoLine = lines.find((line) => /Stream #.*Video:/i.test(line)) ?? ''
	const rateMatch = videoLine.match(/(?:,|\s)(\d+(?:\.\d+)?)\s*fps\b/i) ?? videoLine.match(/(?:,|\s)(\d+(?:\.\d+)?)\s*tbr\b/i)
	const frameRate = rateMatch?.[1]
	if (!frameRate) return undefined
	const timecodes: Array<{ timecode: string; source: SourceTimecode['source'] }> = []
	let current: SourceTimecode['source'] = 'format'
	for (const line of lines) {
		if (/Stream #.*Video:/i.test(line)) current = 'video'
		else if (/Stream #.*(?:Data:.*tmcd|tmcd)/i.test(line)) current = 'tmcd'
		const match = line.match(/timecode\s*[:=]\s*([0-9]{1,3}:[0-9]{2}:[0-9]{2}[:;][0-9]{2})/i)
		if (match) timecodes.push({ timecode: match[1], source: current })
	}
	const selected = timecodes.find((value) => value.source === 'tmcd') ?? timecodes.find((value) => value.source === 'format') ?? timecodes.find((value) => value.source === 'video')
	return selected && frameRate ? { ...selected, frameRate } : undefined
}

function frameCount(centiseconds: number, source: SourceTimecode) {
	return Math.round((centiseconds * source.fpsNumerator) / (100 * source.fpsDenominator))
}

function formatFrameCount(frame: number, nominal: number, dropFrame: boolean, wrapAt24Hours: boolean) {
	const framesPerDay = nominal * 24 * 60 * 60 - (dropFrame ? dropCount(nominal) * (24 * 60 - 24 * 6) : 0)
	let value = Math.max(0, Math.trunc(frame))
	if (wrapAt24Hours) value %= framesPerDay
	if (dropFrame) {
		const droppedPerMinute = dropCount(nominal)
		const framesPerTenMinutes = nominal * 600 - droppedPerMinute * 9
		const framesPerMinute = nominal * 60 - droppedPerMinute
		const tenMinuteBlocks = Math.floor(value / framesPerTenMinutes)
		const remainder = value % framesPerTenMinutes
		value += droppedPerMinute * 9 * tenMinuteBlocks
		if (remainder >= droppedPerMinute) value += droppedPerMinute * Math.floor((remainder - droppedPerMinute) / framesPerMinute)
	}
	const f = value % nominal
	const secondsTotal = Math.floor(value / nominal)
	const seconds = secondsTotal % 60
	const minutes = Math.floor(secondsTotal / 60) % 60
	const hours = Math.floor(secondsTotal / 3600)
	const pad = (part: number) => String(part).padStart(2, '0')
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${dropFrame ? ';' : ':'}${pad(f)}`
}

export function formatSourceTimecode(centiseconds: number, source: SourceTimecode, wrapAt24Hours = true) {
	return formatFrameCount(source.startFrames + frameCount(centiseconds, source), source.nominalFps, source.dropFrame, wrapAt24Hours)
}

/** Convert source + relative centiseconds to an absolute subtitle timestamp in milliseconds. */
export function sourceTimecodeMilliseconds(centiseconds: number, source: SourceTimecode, wrapAt24Hours = true) {
	const framesPerDay = source.nominalFps * 24 * 60 * 60 - (source.dropFrame ? dropCount(source.nominalFps) * (24 * 60 - 24 * 6) : 0)
	let frames = source.startFrames + frameCount(centiseconds, source)
	if (wrapAt24Hours) frames %= framesPerDay
	return Math.round((frames * source.fpsDenominator * 1000) / source.fpsNumerator)
}

export function formatSourceMilliseconds(centiseconds: number, source: SourceTimecode, separator: ',' | '.', wrapAt24Hours = true) {
	let milliseconds = sourceTimecodeMilliseconds(centiseconds, source, wrapAt24Hours)
	const ms = milliseconds % 1000
	let seconds = Math.floor(milliseconds / 1000)
	const s = seconds % 60
	seconds = Math.floor(seconds / 60)
	const m = seconds % 60
	seconds = Math.floor(seconds / 60)
	const h = seconds
	const pad = (value: number) => String(value).padStart(2, '0')
	return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${String(ms).padStart(3, '0')}`
}

export function resolveSourceTimecode(
	probe: ProbeResult | undefined,
	settings: { enabled: boolean; manualTimecode: string; manualFps: string },
): SourceTimecode | undefined {
	if (!settings.enabled) return undefined
	if (probe?.timecode && probe.frameRate) {
		const detected = parseSourceTimecode(probe.timecode, probe.frameRate, probe.source ?? 'video')
		if (detected) return detected
	}
	const manual = settings.manualTimecode.trim() && settings.manualFps.trim()
		? parseSourceTimecode(settings.manualTimecode, settings.manualFps, 'manual')
		: undefined
	return manual
}
