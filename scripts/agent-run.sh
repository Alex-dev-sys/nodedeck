#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INVENTORY_INTERVAL=${SERVER_OS_INVENTORY_INTERVAL:-60}
LOGS_INTERVAL=${SERVER_OS_LOGS_INTERVAL:-60}

case "$INVENTORY_INTERVAL" in
  *[!0-9]*|'') echo "SERVER_OS_INVENTORY_INTERVAL must be a positive number" >&2; exit 1 ;;
esac
case "$LOGS_INTERVAL" in
  *[!0-9]*|'') echo "SERVER_OS_LOGS_INTERVAL must be a positive number" >&2; exit 1 ;;
esac

"$ROOT_DIR/agent-heartbeat.sh" &
HEARTBEAT_PID=$!
COMMAND_PID=
LOGS_PID=
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  "$ROOT_DIR/agent-commands.sh" &
  COMMAND_PID=$!
  (
    while :; do
      "$ROOT_DIR/agent-logs.sh" || echo "NodeDeck log collection failed; retrying on the next interval" >&2
      sleep "$LOGS_INTERVAL"
    done
  ) &
  LOGS_PID=$!
fi

cleanup() {
  kill "$HEARTBEAT_PID" 2>/dev/null || true
  [ -z "$COMMAND_PID" ] || kill "$COMMAND_PID" 2>/dev/null || true
  [ -z "$LOGS_PID" ] || kill "$LOGS_PID" 2>/dev/null || true
  wait "$HEARTBEAT_PID" 2>/dev/null || true
  [ -z "$COMMAND_PID" ] || wait "$COMMAND_PID" 2>/dev/null || true
  [ -z "$LOGS_PID" ] || wait "$LOGS_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "NodeDeck agent runner started; inventory every ${INVENTORY_INTERVAL}s"
while :; do
  "$ROOT_DIR/agent-inventory.sh" || echo "NodeDeck inventory failed; retrying on the next interval" >&2
  sleep "$INVENTORY_INTERVAL"
done
