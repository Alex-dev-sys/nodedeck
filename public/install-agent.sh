#!/bin/sh
set -eu

ENROLLMENT_TOKEN=${1:-}
CONTROL_URL=${2:-}
AGENT_RELEASE_REF=72972806e6d5389fa1408945e17c697a3b13bd1a
AGENT_RELEASE_SHA256=898a71d5b9f8d29628b52c29d8495f2be2b0c2f8aa837322b8fa11bbf088fa67
ARCHIVE_URL="https://github.com/Alex-dev-sys/nodedeck/archive/${AGENT_RELEASE_REF}.tar.gz"

[ -n "$ENROLLMENT_TOKEN" ] || { echo "Missing one-time enrollment token." >&2; exit 1; }
case "$CONTROL_URL" in
  https://*) ;;
  http://127.0.0.1|http://127.0.0.1:*|http://localhost|http://localhost:*) ;;
  *) echo "NodeDeck requires HTTPS for a remote control plane." >&2; exit 1 ;;
esac
case "$CONTROL_URL" in *@*) echo "NodeDeck control URL cannot contain credentials." >&2; exit 1 ;; esac
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

if ! command -v jq >/dev/null 2>&1; then
  echo "Installing the small jq dependency…"
  case "$(uname -s)" in
    Darwin)
      command -v brew >/dev/null 2>&1 || { echo "Install Homebrew or jq, then run this command again." >&2; exit 1; }
      brew install jq
      ;;
    Linux)
      if [ "$(id -u)" -eq 0 ]; then SUDO=; elif command -v sudo >/dev/null 2>&1; then SUDO=sudo; else echo "Install jq, then run this command again." >&2; exit 1; fi
      if command -v apt-get >/dev/null 2>&1; then
        $SUDO apt-get update
        $SUDO apt-get install -y jq
      elif command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y jq
      elif command -v yum >/dev/null 2>&1; then $SUDO yum install -y jq
      elif command -v apk >/dev/null 2>&1; then $SUDO apk add jq
      else echo "Install jq, then run this command again." >&2; exit 1
      fi
      ;;
    *) echo "Install jq, then run this command again." >&2; exit 1 ;;
  esac
fi

NODEDECK_DIR=$(mktemp -d)
cleanup() { rm -rf "$NODEDECK_DIR"; }
trap cleanup EXIT HUP INT TERM

echo "Downloading NodeDeck agent…"
ARCHIVE_PATH="$NODEDECK_DIR/agent.tar.gz"
curl --proto '=https' --tlsv1.2 -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"
[ "$(calculate_sha256 "$ARCHIVE_PATH")" = "$AGENT_RELEASE_SHA256" ] || { echo "NodeDeck rejected the agent archive: SHA-256 mismatch." >&2; exit 1; }
tar -xzf "$ARCHIVE_PATH" -C "$NODEDECK_DIR" --strip-components=1
AGENT_TOKEN=$(jq -cn --arg token "$ENROLLMENT_TOKEN" --arg hostname "$(hostname)" '{token: $token, hostname: $hostname}' | curl -fsS -X POST "${CONTROL_URL%/}/agent/v1/enroll" \
  -H 'Content-Type: application/json' \
  --data-binary @- | jq -er .agentToken)

SERVER_OS_CONTROL_URL=${CONTROL_URL%/} \
SERVER_OS_AGENT_TOKEN=$AGENT_TOKEN \
"$NODEDECK_DIR/scripts/install-agent.sh"

echo "Done. This server will appear in NodeDeck within one minute."
