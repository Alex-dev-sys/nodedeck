#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
PROTECTED_PROJECTS=${SERVER_OS_PROTECTED_PROJECTS:-server-os,server-os-stage2}

command -v docker >/dev/null 2>&1 || { echo "Docker CLI is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

stats=$(docker stats --no-stream --no-trunc --format '{{json .}}' | jq -s 'map({key: .ID, cpu: ((.CPUPerc // "0%" | rtrimstr("%") | tonumber) // 0), ram: ((.MemPerc // "0%" | rtrimstr("%") | tonumber) // 0)})')
container_ids=$(docker ps -aq --no-trunc)
if [ -n "$container_ids" ]; then
  inspection=$(docker inspect $container_ids | jq '[.[] | {
    id: .Id,
    name: (.Name | ltrimstr("/")),
    image: (.Config.Image // .Image),
    runtimeState: (.State.Status // "unknown"),
    healthStatus: (.State.Health.Status // "none"),
    restartCount: (.RestartCount // 0),
    startedAt: (if .State.Running and (.State.StartedAt // "") != "0001-01-01T00:00:00Z" then .State.StartedAt else null end),
    composeProject: (.Config.Labels["com.docker.compose.project"] // null),
    composeService: (.Config.Labels["com.docker.compose.service"] // null),
    ports: ((.NetworkSettings.Ports // {}) | to_entries | map(
      if .value == null then .key
      else .key + " → " + ([.value[] | ((.HostIp // "0.0.0.0") + ":" + (.HostPort // ""))] | join(", ")) end
    ))
  }]')
else
  inspection='[]'
fi

payload=$(jq -n --argjson containers "$inspection" --argjson stats "$stats" --arg protected "$PROTECTED_PROJECTS" '
  ($protected | split(",") | map(gsub("^\\s+|\\s+$"; ""))) as $protectedProjects |
  {services: $containers | map(
    . as $container |
    (($stats | map(select(.key == $container.id)) | .[0]) // {cpu: 0, ram: 0}) as $metrics |
    . + {
      status: (
        if .runtimeState == "restarting" then "restarting"
        elif .runtimeState != "running" then "offline"
        elif .healthStatus == "unhealthy" then "degraded"
        else "healthy" end
      ),
      cpu: $metrics.cpu,
      ram: $metrics.ram,
      protected: ((.composeProject // "") as $project | ($protectedProjects | index($project)) != null)
    }
  )}
')

curl --fail --silent --show-error \
  --request POST "${CONTROL_URL}/agent/v1/inventory" \
  --header "Authorization: Agent ${SERVER_OS_AGENT_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data "$payload"

echo "Server-OS inventory sent"
