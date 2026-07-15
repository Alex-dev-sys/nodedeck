#!/bin/sh
set -eu

ENROLLMENT_TOKEN=${1:-}
CONTROL_URL=${2:-}
ARCHIVE_URL=https://github.com/Alex-dev-sys/nodedeck/archive/refs/heads/main.tar.gz

[ -n "$ENROLLMENT_TOKEN" ] || { echo "Missing one-time enrollment token." >&2; exit 1; }
case "$CONTROL_URL" in http://*|https://*) ;; *) echo "Invalid NodeDeck control URL." >&2; exit 1 ;; esac
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required." >&2; exit 1; }

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
curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$NODEDECK_DIR" --strip-components=1
AGENT_TOKEN=$(curl -fsS -X POST "${CONTROL_URL%/}/agent/v1/enroll" \
  -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg token "$ENROLLMENT_TOKEN" --arg hostname "$(hostname)" '{token: $token, hostname: $hostname}')" | jq -er .agentToken)

SERVER_OS_CONTROL_URL=${CONTROL_URL%/} \
SERVER_OS_AGENT_TOKEN=$AGENT_TOKEN \
"$NODEDECK_DIR/scripts/install-agent.sh"

echo "Done. This server will appear in NodeDeck within one minute."
