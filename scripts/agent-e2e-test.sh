#!/bin/sh
set -eu

BASE_URL=${SERVER_OS_E2E_URL:-http://127.0.0.1:8081}
EMAIL=${SERVER_OS_E2E_EMAIL:-owner@example.com}
: "${SERVER_OS_E2E_PASSWORD:?Set SERVER_OS_E2E_PASSWORD before running the agent E2E test}"

TEST_CONTAINER="server-os-agent-e2e-$$"
AGENT_NAME="agent-e2e-$$"

cleanup() {
  if [ -n "${worker_pid:-}" ]; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
  if [ -n "${agent_id:-}" ] && [ -n "${token:-}" ]; then
    curl --silent --show-error --request DELETE "$BASE_URL/api/v1/agents/${agent_id}" --header "Authorization: Bearer $token" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

command -v docker >/dev/null 2>&1 || { echo "Docker CLI is required" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

docker create --name "$TEST_CONTAINER" node:22-alpine sleep 600 >/dev/null
token=$(curl --fail --silent --show-error --request POST "$BASE_URL/api/v1/auth/login" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"${EMAIL}\",\"password\":\"${SERVER_OS_E2E_PASSWORD}\"}" | jq -r .accessToken)
[ -n "$token" ] && [ "$token" != null ] || { echo "Login did not return an access token" >&2; exit 1; }

enrollment=$(curl --fail --silent --show-error --request POST "$BASE_URL/api/v1/agent-enrollments" \
  --header "Authorization: Bearer $token" --header 'Content-Type: application/json' \
  --data "{\"name\":\"${AGENT_NAME}\"}" | jq -r .enrollment.token)
agent=$(curl --fail --silent --show-error --request POST "$BASE_URL/agent/v1/enroll" \
  --header 'Content-Type: application/json' \
  --data "{\"token\":\"${enrollment}\",\"hostname\":\"${AGENT_NAME}\"}")
agent_token=$(printf '%s' "$agent" | jq -r .agentToken)
agent_id=$(printf '%s' "$agent" | jq -r .agentId)
[ -n "$agent_token" ] && [ "$agent_token" != null ] || { echo "Enrollment did not return an agent token" >&2; exit 1; }

container_id=$(docker ps -a --no-trunc --filter "name=^/${TEST_CONTAINER}$" --format '{{.ID}}')
curl --fail --silent --show-error --request POST "$BASE_URL/agent/v1/inventory" \
  --header "Authorization: Agent $agent_token" --header 'Content-Type: application/json' \
  --data "{\"services\":[{\"id\":\"${container_id}\",\"name\":\"${TEST_CONTAINER}\",\"image\":\"node:22-alpine\",\"status\":\"offline\",\"cpu\":0,\"ram\":0,\"runtimeState\":\"created\",\"healthStatus\":\"none\",\"restartCount\":0,\"ports\":[],\"protected\":false}]}" >/dev/null
service_id="docker-${container_id}"
offline_alert=$(curl --fail --silent --show-error "$BASE_URL/api/v1/alerts" --header "Authorization: Bearer $token" \
  | jq -r --arg service "$service_id" '.alerts[] | select(.serviceId == $service and .kind == "service_offline" and .status == "open") | .id' | head -n 1)
[ -n "$offline_alert" ] || { echo "Offline container did not create an alert" >&2; exit 1; }
curl --fail --silent --show-error --request POST "$BASE_URL/agent/v1/logs" \
  --header "Authorization: Agent $agent_token" --header 'Content-Type: application/json' \
  --data "{\"entries\":[{\"containerId\":\"${container_id}\",\"level\":\"info\",\"text\":\"Server-OS agent E2E log\"}]}" >/dev/null
log_text=$(curl --fail --silent --show-error "$BASE_URL/api/v1/logs?serviceId=${service_id}" --header "Authorization: Bearer $token" \
  | jq -r '.logs[] | select(.text == "Server-OS agent E2E log") | .text' | head -n 1)
[ "$log_text" = 'Server-OS agent E2E log' ] || { echo "Agent log was not stored" >&2; exit 1; }
metrics_present=$(curl --fail --silent --show-error "$BASE_URL/api/v1/services" --header "Authorization: Bearer $token" \
  | jq --arg service "$service_id" '[.services[] | select(.id == $service and (.cpu != null) and (.ram != null))] | length')
[ "$metrics_present" = 1 ] || { echo "Agent runtime metrics were not stored" >&2; exit 1; }
command_id=$(curl --fail --silent --show-error --request POST "$BASE_URL/api/v1/services/${service_id}/commands" \
  --header "Authorization: Bearer $token" --header 'Content-Type: application/json' --data '{"action":"start"}' | jq -r .command.id)

SERVER_OS_AGENT_TOKEN="$agent_token" SERVER_OS_CONTROL_URL="$BASE_URL" SERVER_OS_COMMAND_POLL_INTERVAL=1 ./scripts/agent-commands.sh >/tmp/server-os-agent-e2e.log 2>&1 &
worker_pid=$!
command_status=queued
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  command_status=$(curl --fail --silent --show-error "$BASE_URL/api/v1/commands" --header "Authorization: Bearer $token" \
    | jq -r --arg id "$command_id" '.commands[] | select(.id == $id) | .status')
  [ "$command_status" = succeeded ] && break
  sleep 1
done

[ "$command_status" = succeeded ] || { echo "Command did not succeed: ${command_status}" >&2; exit 1; }
[ "$(docker inspect --format '{{.State.Running}}' "$TEST_CONTAINER")" = true ] || { echo "Agent did not start the test container" >&2; exit 1; }
curl --fail --silent --show-error --request POST "$BASE_URL/agent/v1/inventory" \
  --header "Authorization: Agent $agent_token" --header 'Content-Type: application/json' \
  --data "{\"services\":[{\"id\":\"${container_id}\",\"name\":\"${TEST_CONTAINER}\",\"image\":\"node:22-alpine\",\"status\":\"healthy\",\"cpu\":0,\"ram\":0,\"runtimeState\":\"running\",\"healthStatus\":\"none\",\"restartCount\":0,\"ports\":[],\"protected\":false}]}" >/dev/null
resolved_alert=$(curl --fail --silent --show-error "$BASE_URL/api/v1/alerts" --header "Authorization: Bearer $token" \
  | jq -r --arg id "$offline_alert" '.alerts[] | select(.id == $id) | .status')
[ "$resolved_alert" = resolved ] || { echo "Recovered service alert was not resolved" >&2; exit 1; }
curl --fail --silent --show-error --request DELETE "$BASE_URL/api/v1/agents/${agent_id}" --header "Authorization: Bearer $token" >/dev/null
agent_id=
echo "Server-OS agent E2E test passed"
