#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before installing the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STATE_DIR=${SERVER_OS_AGENT_STATE_DIR:-"$HOME/.server-os-agent"}
PLIST="$HOME/Library/LaunchAgents/com.server-os.agent.plist"
CONFIG_FILE="$STATE_DIR/agent.env"
BIN_DIR="$STATE_DIR/bin"

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

umask 077
mkdir -p "$STATE_DIR" "$BIN_DIR"
for script in agent-daemon.sh agent-run.sh agent-http.sh agent-heartbeat.sh agent-inventory.sh agent-logs.sh agent-commands.sh agent-command-exec.sh; do
  cp "$ROOT_DIR/$script" "$BIN_DIR/$script"
  chmod 700 "$BIN_DIR/$script"
done
printf 'SERVER_OS_AGENT_TOKEN=%s\nSERVER_OS_CONTROL_URL=%s\n' "$SERVER_OS_AGENT_TOKEN" "$CONTROL_URL" > "$CONFIG_FILE"

case "$(uname -s)" in
Darwin)
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.server-os.agent</string>
  <key>ProgramArguments</key><array><string>${BIN_DIR}/agent-daemon.sh</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>SERVER_OS_AGENT_CONFIG</key><string>${CONFIG_FILE}</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${STATE_DIR}/agent.log</string>
  <key>StandardErrorPath</key><string>${STATE_DIR}/agent.error.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Server-OS agent installed and started. Logs: ${STATE_DIR}/agent.log"
;;
Linux)
command -v systemctl >/dev/null 2>&1 || { echo "systemd is required for automatic Linux installation" >&2; exit 1; }
SYSTEMD_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SYSTEMD_DIR/server-os-agent.service"
mkdir -p "$SYSTEMD_DIR"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=NodeDeck Server Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=SERVER_OS_AGENT_CONFIG=${CONFIG_FILE}
ExecStart=${BIN_DIR}/agent-daemon.sh
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now server-os-agent.service
echo "Server-OS agent installed and started as a systemd user service."
echo "Status: systemctl --user status server-os-agent.service"
echo "For startup without an interactive login, run: sudo loginctl enable-linger $(id -un)"
;;
*)
echo "Unsupported operating system: $(uname -s)" >&2
exit 1
;;
esac
