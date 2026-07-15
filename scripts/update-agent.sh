#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STATE_DIR=${SERVER_OS_AGENT_STATE_DIR:-"$HOME/.server-os-agent"}
BIN_DIR="$STATE_DIR/bin"
CONFIG_FILE="$STATE_DIR/agent.env"
PLIST="$HOME/Library/LaunchAgents/com.server-os.agent.plist"

[ -r "$CONFIG_FILE" ] || { echo "No installed Server-OS agent was found. Use install-agent.sh first." >&2; exit 1; }

umask 077
mkdir -p "$BIN_DIR"
for script in agent-daemon.sh agent-run.sh agent-heartbeat.sh agent-inventory.sh agent-logs.sh agent-commands.sh; do
  cp "$ROOT_DIR/$script" "$BIN_DIR/$script"
  chmod 700 "$BIN_DIR/$script"
done

case "$(uname -s)" in
Darwin)
  launchctl kickstart -k "gui/$(id -u)/com.server-os.agent"
  ;;
Linux)
  systemctl --user restart server-os-agent.service
  ;;
*)
  echo "Agent files updated. Restart the agent service manually on this operating system." >&2
  ;;
esac

echo "Server-OS agent updated without changing its token."
