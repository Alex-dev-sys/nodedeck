#!/bin/sh
set -eu
: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
POLL_SECONDS=${SERVER_OS_COMMAND_POLL_INTERVAL:-5}
MAX_BACKOFF_SECONDS=${SERVER_OS_COMMAND_MAX_BACKOFF:-30}
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

backoff=1
while :; do
  response=$("$ROOT_DIR/agent-http.sh" --silent --show-error --write-out '\n%{http_code}' --request POST "${CONTROL_URL}/agent/v1/commands/next") || response='\n000'
  body=$(printf '%s' "$response" | sed '$d')
  status=$(printf '%s' "$response" | tail -n 1)
  if [ "$status" = 200 ]; then
    backoff=1
    id=$(printf '%s' "$body" | jq -r '.command.id')
    action=$(printf '%s' "$body" | jq -r '.command.action')
    kind=$(printf '%s' "$body" | jq -r '.command.kind')
    resource_key=$(printf '%s' "$body" | jq -r '.command.resourceKey')
    if result=$("$ROOT_DIR/agent-command-exec.sh" "$action" "$kind" "$resource_key"); then
      ok=true
    else
      ok=false
    fi
    payload=$(printf '%s' "$result" | jq --argjson ok "$ok" '. + {ok:$ok}')
    "$ROOT_DIR/agent-http.sh" --fail --silent --show-error --request POST "${CONTROL_URL}/agent/v1/commands/${id}/result" --header 'Content-Type: application/json' --data "$payload" || true
  elif [ "$status" != 204 ]; then
    echo "Server-OS command poll failed (HTTP ${status}); retrying in ${backoff}s" >&2
    sleep "$backoff"
    if [ "$backoff" -lt "$MAX_BACKOFF_SECONDS" ]; then backoff=$((backoff * 2)); fi
    if [ "$backoff" -gt "$MAX_BACKOFF_SECONDS" ]; then backoff=$MAX_BACKOFF_SECONDS; fi
    continue
  fi
  if [ "${SERVER_OS_COMMAND_ONCE:-false}" = true ]; then exit 0; fi
  sleep "$POLL_SECONDS"
done
