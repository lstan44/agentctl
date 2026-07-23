#!/bin/sh
set -eu

PROGRAM="agentctl"
VERSION="${AGENTCTL_VERSION:-0.1.1}"
REPOSITORY="${AGENTCTL_REPOSITORY:-https://github.com/lstan44/agentctl}"
DOWNLOAD_BASE="${AGENTCTL_DOWNLOAD_BASE:-${REPOSITORY}/releases/download/v${VERSION}}"
ARCHIVE="${PROGRAM}-${VERSION}.tar.gz"
CHECKSUM="${ARCHIVE}.sha256"

say() {
  printf '%s\n' "$*"
}

fail() {
  say "agentctl install: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v tar >/dev/null 2>&1 || fail "tar is required."
command -v node >/dev/null 2>&1 || fail "Node.js 20 or newer is required: https://nodejs.org/"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20 or newer is required; found $(node --version)."

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) fail "v0.1 supports macOS and Linux." ;;
esac

TMP_ROOT="${TMPDIR:-/tmp}"
TMP_DIRECTORY="$(mktemp -d "${TMP_ROOT%/}/agentctl-install.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIRECTORY"
}
trap cleanup EXIT HUP INT TERM

say "Downloading agentctl v${VERSION}..."
curl -fsSL "${DOWNLOAD_BASE}/${ARCHIVE}" -o "${TMP_DIRECTORY}/${ARCHIVE}"
curl -fsSL "${DOWNLOAD_BASE}/${CHECKSUM}" -o "${TMP_DIRECTORY}/${CHECKSUM}"

EXPECTED="$(awk 'NR == 1 { print $1 }' "${TMP_DIRECTORY}/${CHECKSUM}")"
[ -n "$EXPECTED" ] || fail "release checksum is empty."

if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "${TMP_DIRECTORY}/${ARCHIVE}" | awk '{ print $1 }')"
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "${TMP_DIRECTORY}/${ARCHIVE}" | awk '{ print $1 }')"
else
  fail "shasum or sha256sum is required to verify the release."
fi

[ "$EXPECTED" = "$ACTUAL" ] || fail "checksum verification failed; nothing was installed."
say "Verified SHA-256 ${ACTUAL}"

LIB_ROOT="${AGENTCTL_LIB_DIR:-${XDG_DATA_HOME:-${HOME}/.local/share}/agentctl}"
BIN_DIRECTORY="${AGENTCTL_INSTALL_DIR:-${HOME}/.local/bin}"
VERSION_DIRECTORY="${LIB_ROOT}/${VERSION}"
STAGE_DIRECTORY="${LIB_ROOT}/.stage-${VERSION}-$$"

mkdir -p "$LIB_ROOT" "$BIN_DIRECTORY" "$STAGE_DIRECTORY"
tar -xzf "${TMP_DIRECTORY}/${ARCHIVE}" -C "$STAGE_DIRECTORY" --strip-components=1
[ -f "${STAGE_DIRECTORY}/bin/agentctl.mjs" ] || fail "release archive is missing bin/agentctl.mjs."

if [ -e "$VERSION_DIRECTORY" ]; then
  BACKUP_DIRECTORY="${LIB_ROOT}/${VERSION}.previous.$(date +%s)"
  mv "$VERSION_DIRECTORY" "$BACKUP_DIRECTORY"
  say "Preserved the previous v${VERSION} files at ${BACKUP_DIRECTORY}"
fi
mv "$STAGE_DIRECTORY" "$VERSION_DIRECTORY"

CURRENT_LINK="${LIB_ROOT}/current"
CURRENT_STAGE="${LIB_ROOT}/.current-$$"
ln -s "$VERSION" "$CURRENT_STAGE"
node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' \
  "$CURRENT_STAGE" "$CURRENT_LINK"

WRAPPER_STAGE="${BIN_DIRECTORY}/.agentctl-$$"
{
  printf '%s\n' '#!/bin/sh'
  printf 'exec node "%s" "$@"\n' "${CURRENT_LINK}/bin/agentctl.mjs"
} > "$WRAPPER_STAGE"
chmod 755 "$WRAPPER_STAGE"
mv -f "$WRAPPER_STAGE" "${BIN_DIRECTORY}/agentctl"

say ""
say "Installed agentctl v${VERSION} to ${BIN_DIRECTORY}/agentctl"
case ":${PATH}:" in
  *":${BIN_DIRECTORY}:"*) ;;
  *)
    say ""
    say "Add agentctl to your PATH:"
    say "  export PATH=\"${BIN_DIRECTORY}:\$PATH\""
    ;;
esac
say ""
say "Next:"
say "  agentctl inspect"
