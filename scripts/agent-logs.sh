#!/bin/sh
set -eu
: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
LOG_WINDOW_SECONDS=${SERVER_OS_LOG_WINDOW_SECONDS:-90}
command -v docker >/dev/null 2>&1 || { echo "Docker CLI is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

payload=$(docker ps --format '{{.ID}}' | while IFS= read -r id; do
  docker logs --timestamps --since "${LOG_WINDOW_SECONDS}s" --tail 30 "$id" 2>&1 | tail -n 30 \
    | sed -E -e 's/([Pp]assword|[Tt]oken|[Ss]ecret|[Aa][Pp][Ii][_-]?[Kk]ey)[=:][^[:space:]]+/\1=[REDACTED]/g' \
    | jq -R --arg containerId "$id" '
        select(length > 0) |
        (capture("^(?<ts>[^ ]+) (?<message>.*)$")? // {ts: null, message: .}) as $line |
        {containerId: $containerId, ts: $line.ts, level: (
          if ($line.message | test("(^|[^a-z])(fatal|error|exception|panic)([^a-z]|$)"; "i")) then "error"
          elif ($line.message | test("(^|[^a-z])(warn|warning)([^a-z]|$)"; "i")) then "warn"
          elif ($line.message | test("(^|[^a-z])(debug|trace)([^a-z]|$)"; "i")) then "debug"
          else "info" end
        ), text: $line.message} |
        if .ts == null then del(.ts) else . end'
done | head -n 500 | jq -s '{entries: .}')
curl --fail --silent --show-error --request POST "${CONTROL_URL}/agent/v1/logs" --header "Authorization: Agent ${SERVER_OS_AGENT_TOKEN}" --header 'Content-Type: application/json' --data "$payload"
echo "Server-OS logs sent"
