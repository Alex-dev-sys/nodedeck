#!/bin/sh
set -eu

AGENT_RELEASE_REF=72972806e6d5389fa1408945e17c697a3b13bd1a
AGENT_RELEASE_SHA256=898a71d5b9f8d29628b52c29d8495f2be2b0c2f8aa837322b8fa11bbf088fa67
ARCHIVE_URL="https://github.com/Alex-dev-sys/nodedeck/archive/${AGENT_RELEASE_REF}.tar.gz"

command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required." >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  calculate_sha256() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  calculate_sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "sha256sum or shasum is required." >&2
  exit 1
fi

NODEDECK_DIR=$(mktemp -d)
cleanup() { rm -rf "$NODEDECK_DIR"; }
trap cleanup EXIT HUP INT TERM

echo "Downloading the verified NodeDeck agent update…"
ARCHIVE_PATH="$NODEDECK_DIR/agent.tar.gz"
curl --proto '=https' --tlsv1.2 -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"
[ "$(calculate_sha256 "$ARCHIVE_PATH")" = "$AGENT_RELEASE_SHA256" ] || { echo "NodeDeck rejected the agent archive: SHA-256 mismatch." >&2; exit 1; }
tar -xzf "$ARCHIVE_PATH" -C "$NODEDECK_DIR" --strip-components=1
"$NODEDECK_DIR/scripts/update-agent.sh"

echo "Done. NodeDeck kept the existing server token and restarted the agent."
