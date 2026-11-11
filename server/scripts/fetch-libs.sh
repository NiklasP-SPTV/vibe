#!/usr/bin/env bash
# Like `chore fetch-libs`, but the archive must match ggml-libs.sha256 before it is used.
# usage: fetch-libs.sh <platform id>, e.g. darwin-arm64, linux-x86_64, windows-amd64-msvc
set -euo pipefail
cd "$(dirname "$0")/.."
platform=$1
tag="libraries-ggml-$(tr -d '[:space:]' < libs/ggml-version)-r$(tr -d '[:space:]' < libs/revision)"
asset="ggml-libs-$platform.tar.gz"
expected=$(awk -v name="$asset" '$2 == name { print $1 }' ggml-libs.sha256)
if [[ -z "$expected" ]]; then
	echo "no pinned hash for $asset in ggml-libs.sha256" >&2
	exit 1
fi
mkdir -p target
rm -f "target/$asset"
curl --fail --location --silent --show-error --retry 3 --output "target/$asset" \
	"https://github.com/thewh1teagle/vibe/releases/download/$tag/$asset"
if command -v sha256sum >/dev/null; then
	actual=$(sha256sum < "target/$asset" | awk '{ print $1 }')
else
	actual=$(shasum -a 256 < "target/$asset" | awk '{ print $1 }')
fi
if [[ "$actual" != "$expected" ]]; then
	echo "ggml libs hash mismatch for $asset: expected $expected, got $actual" >&2
	rm -f "target/$asset"
	exit 1
fi
# Only lib/ is taken; the headers the build uses are the checked-in libs/include.
rm -rf target/ggml-libs libs/lib
mkdir -p target/ggml-libs
tar -xzf "target/$asset" -C target/ggml-libs
mv target/ggml-libs/lib libs/lib
rm -rf target/ggml-libs "target/$asset"
echo "ggml libs $platform ($tag) verified and extracted to libs/lib"
