#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
PROTECTED_PROJECTS=${SERVER_OS_PROTECTED_PROJECTS:-server-os,server-os-stage2,infra-dashboard-release-smoke,infra-dashboard,nodedeck}
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

docker_services='[]'
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  stats=$(docker stats --no-stream --no-trunc --format '{{json .}}' | jq -s 'map({key: .ID, cpu: ((.CPUPerc // "0%" | rtrimstr("%") | tonumber) // 0), ram: ((.MemPerc // "0%" | rtrimstr("%") | tonumber) // 0)})')
  container_ids=$(docker ps -aq --no-trunc)
  if [ -n "$container_ids" ]; then
    inspection=$(docker inspect $container_ids | jq --arg protected "$PROTECTED_PROJECTS" '
      ($protected | split(",") | map(gsub("^\\s+|\\s+$"; ""))) as $protectedProjects |
      [.[] |
      (.Config.Labels // {}) as $labels |
      ($labels["io.nodedeck.project.key"] // null) as $explicitProjectKey |
      ($labels["com.docker.compose.project"] // null) as $composeProject |
      (if $explicitProjectKey != null then $explicitProjectKey elif ($protectedProjects | index($composeProject)) != null then "infra-dashboard" else $composeProject end) as $projectKey |
      ($labels["io.nodedeck.project.name"] // (if $projectKey == "infra-dashboard" then "Infra Dashboard" else $projectKey end) // (.Name | ltrimstr("/"))) as $projectName |
      {
        containerId: .Id,
        containerName: (.Name | ltrimstr("/")),
        image: (.Config.Image // .Image),
        runtimeState: (.State.Status // "unknown"),
        healthStatus: (.State.Health.Status // "none"),
        restartCount: (.RestartCount // 0),
        startedAt: (if .State.Running and (.State.StartedAt // "") != "0001-01-01T00:00:00Z" then .State.StartedAt else null end),
        composeProject: $composeProject,
        composeService: ($labels["com.docker.compose.service"] // null),
        projectKey: $projectKey,
        projectName: $projectName,
        resourceKey: (if $projectKey == null then .Id else "docker-compose:" + $projectKey end),
        explicitlyProtected: (($labels["io.nodedeck.protected"] // "false") == "true"),
        ports: ((.NetworkSettings.Ports // {}) | to_entries | map(
          if .value == null then .key
          else .key + " → " + ([.value[] | ((.HostIp // "0.0.0.0") + ":" + (.HostPort // ""))] | join(", ")) end
        ))
      }
    ]')
  else
    inspection='[]'
  fi

  docker_services=$(printf '%s' "$inspection" | jq --argjson stats "$stats" --arg protected "$PROTECTED_PROJECTS" '
    ($protected | split(",") | map(gsub("^\\s+|\\s+$"; ""))) as $protectedProjects |
    map(. as $container |
      (($stats | map(select(.key == $container.containerId)) | .[0]) // {cpu: 0, ram: 0}) as $metrics |
      . + {cpu: $metrics.cpu, ram: $metrics.ram}
    ) |
    group_by(.resourceKey) |
    map(
      . as $group |
      ($group | length) as $count |
      ($group | map(select(.runtimeState == "running")) | length) as $running |
      ($group | any(.runtimeState == "restarting")) as $restarting |
      ($group | any(.healthStatus == "unhealthy")) as $unhealthy |
      ($group | map(.cpu) | add // 0) as $cpu |
      ($group | map(.ram) | add // 0) as $ram |
      {
        id: $group[0].resourceKey,
        name: $group[0].projectName,
        kind: "docker",
        image: (if $count == 1 then $group[0].image else "\($count) containers" end),
        status: (
          if $restarting then "restarting"
          elif $running == 0 then "offline"
          elif $running < $count or $unhealthy then "degraded"
          else "healthy" end
        ),
        cpu: (if $cpu > 100 then 100 else $cpu end),
        ram: (if $ram > 100 then 100 else $ram end),
        runtimeState: (if $count == 1 then $group[0].runtimeState else "\($running)/\($count) running" end),
        healthStatus: (if $unhealthy then "unhealthy" elif ($group | all(.healthStatus == "healthy")) then "healthy" else "none" end),
        restartCount: ($group | map(.restartCount) | add // 0),
        startedAt: (($group | map(.startedAt) | map(select(. != null)) | sort | .[0]) // null),
        composeProject: $group[0].projectKey,
        composeService: (if $count == 1 and $group[0].projectKey == null then $group[0].composeService else null end),
        ports: ($group | map(.ports) | flatten | unique),
        protected: (($group | any(.explicitlyProtected)) or (($group[0].projectKey // "") as $project | ($protectedProjects | index($project)) != null))
      }
    )
  ')
fi

systemd_services=$(
  if command -v systemctl >/dev/null 2>&1; then
    for scope in user system; do
      if [ "$scope" = user ]; then
        unit_dir="$HOME/.config/systemd/user"
      else
        unit_dir="/etc/systemd/system"
      fi
      [ -d "$unit_dir" ] || continue
      for unit_file in "$unit_dir"/*.service; do
        [ -e "$unit_file" ] || continue
        unit=$(basename "$unit_file")
        if [ "$unit" = server-os-agent.service ] || [ "$unit" = nodedeck-agent.service ] || printf '%s' "$unit" | grep -q '^pm2-.*\.service$'; then
          continue
        fi
        if [ "$scope" = user ]; then
          details=$(systemctl --user show "$unit" --property=Description --property=ActiveState --property=SubState 2>/dev/null) || continue
        else
          details=$(systemctl show "$unit" --property=Description --property=ActiveState --property=SubState 2>/dev/null) || continue
        fi
        description=$(printf '%s\n' "$details" | sed -n 's/^Description=//p')
        active=$(printf '%s\n' "$details" | sed -n 's/^ActiveState=//p')
        sub=$(printf '%s\n' "$details" | sed -n 's/^SubState=//p')
        [ -n "$description" ] || description=${unit%.service}
        if [ "$active" = active ]; then
          status=healthy
        elif [ "$active" = activating ] || [ "$active" = reloading ]; then
          status=restarting
        elif [ "$active" = failed ] || [ "$active" = inactive ] || [ "$active" = deactivating ]; then
          status=offline
        else
          status=degraded
        fi
        jq -n \
          --arg id "systemd-${scope}:${unit}" \
          --arg name "$description" \
          --arg image "${scope} systemd service" \
          --arg status "$status" \
          --arg runtimeState "${active:-unknown}/${sub:-unknown}" \
          '{id:$id,name:$name,kind:"systemd",image:$image,status:$status,cpu:0,ram:0,runtimeState:$runtimeState,healthStatus:"none",restartCount:0,ports:[],protected:false}'
      done
    done
  fi
) || true
systemd_services=$(printf '%s\n' "$systemd_services" | jq -s 'unique_by(.id)')

collect_launchd_services() {
  if [ "$(uname -s)" = Darwin ] && command -v launchctl >/dev/null 2>&1 && command -v plutil >/dev/null 2>&1; then
    launchd_dir="$HOME/Library/LaunchAgents"
    if [ -d "$launchd_dir" ]; then
      for plist in "$launchd_dir"/*.plist; do
        [ -e "$plist" ] || continue
        label=$(plutil -extract Label raw -o - "$plist" 2>/dev/null || true)
        [ -n "$label" ] || continue
        [ "${#label}" -le 114 ] || continue
        case "$label" in
          com.server-os.agent|com.nodedeck.agent|pm2.*|*.pm2.*) continue ;;
        esac

        details=$(launchctl print "gui/$(id -u)/$label" 2>/dev/null || true)
        state=$(printf '%s\n' "$details" | sed -n 's/^[[:space:]]*state = //p' | head -n 1)
        [ "$state" = running ] || continue
        pid=$(printf '%s\n' "$details" | sed -n 's/^[[:space:]]*pid = //p' | head -n 1)
        case "$pid" in *[!0-9]*|'') pid= ;; esac

        program=$(plutil -extract Program raw -o - "$plist" 2>/dev/null || true)
        [ -n "$program" ] || program=$(plutil -extract ProgramArguments.0 raw -o - "$plist" 2>/dev/null || true)
        [ -n "$program" ] || program="macOS LaunchAgent"
        program=$(printf '%.512s' "$program")

        cpu=0
        ram=0
        if [ -n "$pid" ]; then
          metrics=$(ps -p "$pid" -o %cpu= -o %mem= 2>/dev/null | awk 'NR == 1 { print $1, $2 }')
          cpu=$(printf '%s\n' "$metrics" | awk '{ print $1 + 0 }')
          ram=$(printf '%s\n' "$metrics" | awk '{ print $2 + 0 }')
        fi

        jq -n \
          --arg id "launchd-user:$label" \
          --arg name "$label" \
          --arg image "$program" \
          --arg runtimeState "$state" \
          --argjson cpu "$(awk -v value="$cpu" 'BEGIN { capped = value > 100 ? 100 : value; print capped }')" \
          --argjson ram "$(awk -v value="$ram" 'BEGIN { capped = value > 100 ? 100 : value; print capped }')" \
          '{id:$id,name:$name,kind:"launchd",image:$image,status:"healthy",cpu:$cpu,ram:$ram,runtimeState:$runtimeState,healthStatus:"none",restartCount:0,ports:[],protected:false}'
      done
    fi
  fi
}
launchd_services=$(collect_launchd_services) || true
launchd_services=$(printf '%s\n' "$launchd_services" | jq -s 'unique_by(.id)')

pm2_services='[]'
if command -v pm2 >/dev/null 2>&1; then
  pm2_services=$(pm2 jlist 2>/dev/null | jq '[.[] |
    (.pm2_env.status // "unknown") as $runtimeState |
    {
      id: ("pm2:" + (.pm_id | tostring)),
      name: (.name // ("PM2 " + (.pm_id | tostring))),
      kind: "pm2",
      image: (.pm2_env.pm_exec_path // .pm2_env.exec_interpreter // "PM2 process"),
      status: (if $runtimeState == "online" then "healthy" elif $runtimeState == "launching" then "restarting" elif $runtimeState == "errored" or $runtimeState == "stopped" then "offline" else "degraded" end),
      cpu: (if ((.monit.cpu // 0) | tonumber) > 100 then 100 else ((.monit.cpu // 0) | tonumber) end),
      ram: 0,
      runtimeState: $runtimeState,
      healthStatus: "none",
      restartCount: (.pm2_env.restart_time // 0),
      ports: [],
      protected: false
    }
  ]' 2>/dev/null || printf '[]')
fi

payload=$(jq -n \
  --argjson docker "$docker_services" \
  --argjson systemd "$systemd_services" \
  --argjson launchd "$launchd_services" \
  --argjson pm2 "$pm2_services" \
  '{services: (($docker + $systemd + $launchd + $pm2) | unique_by(.id))}')

if [ "${SERVER_OS_INVENTORY_DRY_RUN:-false}" = true ]; then
  printf '%s\n' "$payload"
  exit 0
fi

"$ROOT_DIR/agent-http.sh" --fail --silent --show-error \
  --request POST "${CONTROL_URL}/agent/v1/inventory" \
  --header 'Content-Type: application/json' \
  --data "$payload"

echo "NodeDeck inventory sent"
