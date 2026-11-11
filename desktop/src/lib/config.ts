// About, changelog, update and privacy point at this fork: the original project's pages offer its
// own builds, which carry a different updater key and supply chain (IT review M5).
export const aboutURL = 'https://github.com/NiklasP-SPTV/vibe#readme'
export const repoURL = 'https://github.com/NiklasP-SPTV/vibe'
export const updateVersionURL = 'https://github.com/NiklasP-SPTV/vibe/releases'
export const modelsDocURL = 'https://thewh1teagle.github.io/vibe/docs#models'
/** Release notes in the fork's repository: one version's entry, or the list of all of them. */
export const changelogURL = (version?: string) =>
	version ? `https://github.com/NiklasP-SPTV/vibe/blob/main/i18n/changelog/${version}.md` : 'https://github.com/NiklasP-SPTV/vibe/tree/main/i18n/changelog'
export const discordURL = 'https://discord.gg/EcxWSstQN8'
export const supportVibeURL = 'https://thewh1teagle.github.io/vibe/?action=support-vibe'
export const privacyPolicyURL = 'https://github.com/NiklasP-SPTV/vibe/blob/main/PRIVACY.md'
export const storeFilename = 'app_config.json'

/** What the catalog knows about a finished download, beyond the bytes themselves. */
export interface ModelIntegrity {
	/** Exact size in bytes of the published artifact. */
	size?: number
	/** Lowercase hex SHA-256 of the published artifact. */
	sha256?: string
}

/** One downloadable model. Only catalog entries carry integrity metadata — a URL the user pastes
 * into settings or opens with `vibe://download/?url=` never does, and falls back to the size and
 * magic-byte checks the backend runs on every download. */
export interface ModelDownload extends ModelIntegrity {
	url: string
}

/**
 * Size and SHA-256 of every model the app downloads, taken from Hugging Face's LFS metadata and
 * checked against our own copies (IT review M7). A download that does not match is discarded, so
 * a changed file on a mirror or on Hugging Face's `main` branch can never replace a model unseen.
 */
const TURBO: ModelIntegrity = { size: 1_624_555_275, sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69' }
export const largeV3Integrity: ModelIntegrity = { size: 3_095_033_483, sha256: '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2' }

export const modelUrls: Record<'default' | 'hebrew', ModelDownload[]> = {
	default: [
		{ url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin', ...TURBO },
		{ url: 'https://huggingface.co/vibe-app/whisper-large-v3-turbo-gguf/resolve/main/ggml-large-v3-turbo.bin', ...TURBO }, // Hugging Face fallback
		{ url: 'https://github.com/thewh1teagle/vibe/releases/download/model-files-v1.0/ggml-large-v3-turbo.bin', ...TURBO }, // GitHub fallback
	],
	hebrew: [
		{
			url: 'https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin',
			size: 1_624_555_275,
			sha256: 'c8090411113357097bfafc2b8e228ec1639fa7f5fe4ecb5d054ac0ccef8641b1',
		},
	],
}

export const embeddingModelFilename = 'wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelFilename = 'segmentation-3.0.onnx'
export const embeddingModelUrl = 'https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/wespeaker_en_voxceleb_CAM++.onnx'
export const segmentModelUrl = 'https://github.com/thewh1teagle/vibe/releases/download/v0.0.1/segmentation-3.0.onnx'

/**
 * Diarization runs NVIDIA Sortformer on ggml now, not ONNX Runtime, so this is a GGUF built from
 * the original `.nemo` checkpoint rather than an ONNX export. Q8_0: the k-quant tiers are unsafe
 * for this model — its speaker-cache compression makes discrete near-tie decisions that quant
 * error can flip, permuting speaker labels mid-stream.
 *
 * Mirrored into the vibe-app org from `nvidia/diar_streaming_sortformer_4spk-v2` (cc-by-4.0).
 *
 * Anyone upgrading still has the old `.onnx` sitting in their models folder. Nothing reads it any
 * more and it is not a `.gguf`/`.bin`, so it stays invisible to the model listing; the gate simply
 * finds this file missing and offers the download. Deleting the stale 492 MB file is left to them.
 */
export const diarizeModelFilename = 'diar_streaming_sortformer_4spk-v2.q8_0.gguf'
export const diarizeModelUrl = 'https://huggingface.co/vibe-app/diar-streaming-sortformer-4spk-v2-gguf/resolve/main/diar_streaming_sortformer_4spk-v2.q8_0.gguf'
export const diarizeModelIntegrity: ModelIntegrity = {
	size: 147075776,
	sha256: '0679cfeb1ce356d0dea9470b31274f4bfc7eb927497d82005483770666da998a',
}
/**
 * NVIDIA Nemotron-3-Diarization (up to 8 speakers), taken over from upstream (#1619) as a second
 * speaker model next to Sortformer, so both can be compared on real material before one is
 * dropped. Q8_0 GGUF exported by `server/crates/nemotron-diarize-rs/scripts/export.py`. The
 * engine picks the diarizer by this file's name, so it must keep "nemotron" in it.
 */
export const nemotronDiarizeModelFilename = 'nemotron-3-diarization-Q8_0.gguf'
export const nemotronDiarizeModelUrl = 'https://huggingface.co/vibe-app/nemotron-3-diarization-gguf/resolve/main/nemotron-3-diarization-Q8_0.gguf'
export const nemotronDiarizeModelIntegrity: ModelIntegrity = {
	size: 108541632,
	sha256: 'a25f026847d765c8661fd5095c73a0e5f20d310dcb8249c654e3828592a2fc73',
}
export const vadModelFilename = 'ggml-silero-v6.2.0.bin'
export const vadModelUrl = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin'
export const vadModelIntegrity: ModelIntegrity = { size: 885_098, sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987' }

export const llmApiKeyUrl = 'https://console.anthropic.com/settings/keys'
export const llmDefaultMaxTokens = 8192 // https://docs.anthropic.com/en/docs/about-claude/models
export const llmLimitsUrl = 'https://console.anthropic.com/settings/limits'
export const llmCostUrl = 'https://console.anthropic.com/settings/cost'

export const ytDlpAssetNames: Record<string, string> = {
	'windows-x86_64': 'yt-dlp.exe',
	'windows-aarch64': 'yt-dlp_arm64.exe',
	'linux-x86_64': 'yt-dlp_linux',
	'linux-aarch64': 'yt-dlp_linux_aarch64',
	'macos-x86_64': 'yt-dlp_macos',
	'macos-aarch64': 'yt-dlp_macos',
}

export function ytDlpDownloadUrl(version: string, key: string): string {
	return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${ytDlpAssetNames[key]}`
}

export const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'mxf']
export const audioExtensions = ['mp3', 'wav', 'aac', 'flac', 'oga', 'ogg', 'opic', 'opus', 'm4a', 'm4b', 'wma']
export const themes = ['light', 'dark']
export const defaultAutoSummarizeOnFinish = false

/**
 * Default dictation shortcut: Option+Space on macOS, Ctrl+Space elsewhere. Resolved on call rather
 * than at module scope: reading the platform at import time makes this file unimportable outside a
 * webview (and untestable).
 */
export function getDefaultHotkeyShortcut() {
	const isMac = navigator.platform.toUpperCase().includes('MAC')
	return isMac ? 'Alt+Space' : 'Ctrl+Space'
}

/** Global recording uses one portable accelerator on every desktop platform. */
export function getDefaultRecordingShortcut() {
	return 'CmdOrCtrl+Shift+R'
}
