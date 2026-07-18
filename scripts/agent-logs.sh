#!/bin/sh
set -eu
: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
LOG_WINDOW_SECONDS=${SERVER_OS_LOG_WINDOW_SECONDS:-90}
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$ROOT_DIR/agent-capabilities.sh"
load_agent_capabilities
capability_enabled "$SERVER_OS_COLLECT_LOGS" || exit 0
capability_enabled "$SERVER_OS_TRACK_DOCKER" || exit 0
command -v docker >/dev/null 2>&1 || { echo "Docker CLI is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

payload=$(docker ps --no-trunc --format '{{.ID}}' | while IFS= read -r id; do
  resource_key=$(docker inspect "$id" | jq -r '.[0] |
    (.Config.Labels // {}) as $labels |
    ($labels["io.nodedeck.project.key"] // $labels["com.docker.compose.project"] // null) as $project |
    if $project == null then .Id else "docker-compose:" + $project end')
  docker logs --timestamps --since "${LOG_WINDOW_SECONDS}s" --tail 30 "$id" 2>&1 | tail -n 30 \
    | sed -E \
        -e 's/([Pp]assword|[Tt]oken|[Ss]ecret|[Aa][Pp][Ii][_-]?[Kk]ey)[[:space:]]*[=:][[:space:]]*[^,;[:space:]]+/\1=[REDACTED]/g' \
        -e 's/([Bb]earer)[[:space:]]+[A-Za-z0-9._~+\/=:-]+/\1 [REDACTED]/g' \
        -e 's#(postgres(ql)?|mysql|mongodb)://([^:/[:space:]]+):([^@/[:space:]]+)@#\1://\3:[REDACTED]@#g' \
    | jq -R --arg containerId "$resource_key" '
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
"$ROOT_DIR/agent-http.sh" --fail --silent --show-error --request POST "${CONTROL_URL}/agent/v1/logs" --header 'Content-Type: application/json' --data "$payload"
echo "NodeDeck logs sent"
