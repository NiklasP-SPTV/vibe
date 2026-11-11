#!/usr/bin/env bash
# Download the pinned FFmpeg archive for <os> <arch> to <out> and verify its SHA-256.
# usage: fetch-ffmpeg.sh <darwin|windows> <amd64|arm64> <out.zip>
set -euo pipefail
os=$1 arch=$2 out=$3
pins="$(dirname "$0")/../ffmpeg-pins.txt"
read -r sha url < <(awk -v os="$os" -v arch="$arch" '$1 == os && $2 == arch { print $3, $4 }' "$pins")
if [[ -z "${sha:-}" || -z "${url:-}" ]]; then
	echo "no pinned ffmpeg for $os/$arch in $pins" >&2
	exit 1
fi
mkdir -p "$(dirname "$out")"
curl --fail --location --silent --show-error --retry 3 --max-time 300 --output "$out" "$url"
if command -v sha256sum >/dev/null; then
	actual=$(sha256sum < "$out" | awk '{ print $1 }')
else
	actual=$(shasum -a 256 < "$out" | awk '{ print $1 }')
fi
if [[ "$actual" != "$sha" ]]; then
	echo "ffmpeg hash mismatch for $url: expected $sha, got $actual" >&2
	rm -f "$out"
	exit 1
fi
echo "ffmpeg $os/$arch verified: $sha"
