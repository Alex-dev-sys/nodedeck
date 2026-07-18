#!/bin/sh
set -eu

AGENT_RELEASE_REF=de37301b0ba5a18c1fc23ddbff30141bffdf2e49
ARCHIVE_URL="https://github.com/Alex-dev-sys/nodedeck/archive/${AGENT_RELEASE_REF}.tar.gz"

command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required." >&2; exit 1; }

NODEDECK_DIR=$(mktemp -d)
cleanup() { rm -rf "$NODEDECK_DIR"; }
trap cleanup EXIT HUP INT TERM

echo "Downloading the verified NodeDeck agent update…"
curl --proto '=https' --tlsv1.2 -fsSL "$ARCHIVE_URL" | tar -xz -C "$NODEDECK_DIR" --strip-components=1
"$NODEDECK_DIR/scripts/update-agent.sh"

echo "Done. NodeDeck kept the existing server token and restarted the agent."
