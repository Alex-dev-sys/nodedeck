#!/bin/sh
set -eu
: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
POLL_SECONDS=${SERVER_OS_COMMAND_POLL_INTERVAL:-5}
MAX_BACKOFF_SECONDS=${SERVER_OS_COMMAND_MAX_BACKOFF:-30}

command -v docker >/dev/null 2>&1 || { echo "Docker CLI is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

backoff=1
while :; do
  response=$(curl --silent --show-error --write-out '\n%{http_code}' --request POST "${CONTROL_URL}/agent/v1/commands/next" --header "Authorization: Agent ${SERVER_OS_AGENT_TOKEN}") || response='\n000'
  body=$(printf '%s' "$response" | sed '$d')
  status=$(printf '%s' "$response" | tail -n 1)
  if [ "$status" = 200 ]; then
    backoff=1
    id=$(printf '%s' "$body" | jq -r '.command.id')
    action=$(printf '%s' "$body" | jq -r '.command.action')
    container=$(printf '%s' "$body" | jq -r '.command.containerId')
    output_file=$(mktemp "${TMPDIR:-/tmp}/server-os-command.XXXXXX")
    trap 'rm -f "$output_file"' EXIT HUP INT TERM
    ok=unset
    case "$action" in
      start|restart|stop) ;;
      *)
        ok=false
        printf '%s\n' "Unsupported command action rejected by agent: $action" >"$output_file"
        ;;
    esac
    if [ "$ok" != false ]; then
      if docker "$action" "$container" >"$output_file" 2>&1; then
        ok=true
        observed_state=unknown
        health_status=unknown
        attempt=0
        while [ "$attempt" -lt 15 ]; do
          inspected=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || printf 'missing|unknown')
          observed_state=${inspected%%|*}
          health_status=${inspected#*|}
          if [ "$action" = stop ]; then
            [ "$observed_state" != running ] && break
          elif [ "$observed_state" = running ] && { [ "$health_status" = healthy ] || [ "$health_status" = none ]; }; then
            break
          fi
          attempt=$((attempt + 1))
          sleep 2
        done
        if [ "$action" = stop ]; then
          if [ "$observed_state" = running ]; then ok=false; fi
        elif [ "$observed_state" != running ] || { [ "$health_status" != healthy ] && [ "$health_status" != none ]; }; then
          ok=false
        fi
        if [ "$ok" = false ]; then
          printf '\nPost-command verification failed: state=%s health=%s\n' "$observed_state" "$health_status" >>"$output_file"
        fi
      else
        ok=false
        observed_state=unknown
        health_status=unknown
      fi
    fi
    message=$(tail -c 1500 "$output_file")
    payload=$(jq -n --argjson ok "$ok" --arg message "$message" --arg state "${observed_state:-unknown}" --arg health "${health_status:-unknown}" \
      '{ok:$ok,message:$message,observedState:$state,healthStatus:$health}')
    curl --fail --silent --show-error --request POST "${CONTROL_URL}/agent/v1/commands/${id}/result" --header "Authorization: Agent ${SERVER_OS_AGENT_TOKEN}" --header 'Content-Type: application/json' --data "$payload" || true
    rm -f "$output_file"
    trap - EXIT HUP INT TERM
  elif [ "$status" != 204 ]; then
    echo "Server-OS command poll failed (HTTP ${status}); retrying in ${backoff}s" >&2
    sleep "$backoff"
    if [ "$backoff" -lt "$MAX_BACKOFF_SECONDS" ]; then backoff=$((backoff * 2)); fi
    if [ "$backoff" -gt "$MAX_BACKOFF_SECONDS" ]; then backoff=$MAX_BACKOFF_SECONDS; fi
    continue
  fi
  sleep "$POLL_SECONDS"
done
