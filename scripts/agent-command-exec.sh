#!/bin/sh
set -u

ACTION=${1:-}
KIND=${2:-}
RESOURCE_KEY=${3:-}
PROTECTED_PROJECTS=${SERVER_OS_PROTECTED_PROJECTS:-server-os,server-os-stage2,infra-dashboard-release-smoke,infra-dashboard,nodedeck}
OUTPUT_FILE=$(mktemp "${TMPDIR:-/tmp}/nodedeck-command.XXXXXX")
trap 'rm -f "$OUTPUT_FILE"' EXIT HUP INT TERM

command -v jq >/dev/null 2>&1 || { printf '%s\n' '{"message":"jq is required","observedState":"unknown","healthStatus":"unknown"}'; exit 1; }

emit() {
  message=$(tail -c 1500 "$OUTPUT_FILE" 2>/dev/null || true)
  jq -n --arg message "$message" --arg state "${OBSERVED_STATE:-unknown}" --arg health "${HEALTH_STATUS:-none}" \
    '{message:$message,observedState:$state,healthStatus:$health}'
}

fail() {
  printf '%s\n' "$1" >>"$OUTPUT_FILE"
  emit
  exit 1
}

succeed() {
  emit
  exit 0
}

case "$ACTION" in
  start|restart|stop) ;;
  *) fail "Unsupported command action: $ACTION" ;;
esac

case "$KIND" in
docker)
  command -v docker >/dev/null 2>&1 || fail "Docker is not installed on this host."
  docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable."
  case "$RESOURCE_KEY" in
    docker-compose:*)
      project_key=${RESOURCE_KEY#docker-compose:}
      all_ids=$(docker ps -aq --no-trunc 2>/dev/null) || fail "Could not list Docker containers."
      [ -n "$all_ids" ] || fail "No containers were found for this Compose project."
      targets=$(docker inspect $all_ids 2>/dev/null | jq -r --arg desired "$project_key" --arg protected "$PROTECTED_PROJECTS" '
        ($protected | split(",") | map(gsub("^\\s+|\\s+$"; ""))) as $protectedProjects |
        .[] | (.Config.Labels // {}) as $labels |
        ($labels["io.nodedeck.project.key"] // null) as $explicitProjectKey |
        ($labels["com.docker.compose.project"] // null) as $composeProject |
        (if $explicitProjectKey != null then $explicitProjectKey elif ($protectedProjects | index($composeProject)) != null then "infra-dashboard" else $composeProject end) as $key |
        select($key == $desired) | .Id
      ') || fail "Could not inspect the Compose project."
      [ -n "$targets" ] || fail "The Compose project no longer has any containers."
      ;;
    *)
      case "$RESOURCE_KEY" in *[!A-Za-z0-9_.:-]*|'') fail "Invalid Docker resource identifier." ;; esac
      targets=$RESOURCE_KEY
      ;;
  esac

  if ! docker "$ACTION" $targets >>"$OUTPUT_FILE" 2>&1; then
    fail "Docker could not ${ACTION} the selected project."
  fi

  attempt=0
  while [ "$attempt" -lt 15 ]; do
    states=$(docker inspect $targets 2>/dev/null | jq -r '[.[] | {state:(.State.Status // "missing"),health:(.State.Health.Status // "none")}]') || states='[]'
    if [ "$ACTION" = stop ]; then
      ready=$(printf '%s' "$states" | jq -r 'all(.state != "running")')
    else
      ready=$(printf '%s' "$states" | jq -r 'length > 0 and all(.state == "running" and (.health == "healthy" or .health == "none"))')
    fi
    [ "$ready" = true ] && break
    attempt=$((attempt + 1))
    sleep 2
  done
  OBSERVED_STATE=$(printf '%s' "$states" | jq -r 'if length == 1 then .[0].state elif length == 0 then "missing" else "\(map(select(.state == "running")) | length)/\(length) running" end')
  HEALTH_STATUS=$(printf '%s' "$states" | jq -r 'if any(.health == "unhealthy") then "unhealthy" elif all(.health == "healthy") then "healthy" else "none" end')
  [ "$ready" = true ] || fail "Post-command verification failed."
  succeed
  ;;
systemd)
  command -v systemctl >/dev/null 2>&1 || fail "systemd is not available on this host."
  case "$RESOURCE_KEY" in
    systemd-user:*) unit=${RESOURCE_KEY#systemd-user:} ;;
    systemd-system:*) fail "System-level services need administrator permission and are monitoring-only." ;;
    *) fail "Invalid systemd resource identifier." ;;
  esac
  case "$unit" in *[!A-Za-z0-9@_.:-]*|'') fail "Invalid systemd unit name." ;; esac
  if ! systemctl --user "$ACTION" "$unit" >>"$OUTPUT_FILE" 2>&1; then
    fail "systemd could not ${ACTION} ${unit}."
  fi
  OBSERVED_STATE=$(systemctl --user is-active "$unit" 2>/dev/null || true)
  HEALTH_STATUS=none
  if [ "$ACTION" = stop ]; then
    [ "$OBSERVED_STATE" != active ] || fail "The service is still active."
  else
    [ "$OBSERVED_STATE" = active ] || fail "The service did not become active."
  fi
  succeed
  ;;
pm2)
  command -v pm2 >/dev/null 2>&1 || fail "PM2 is not installed for this user."
  case "$RESOURCE_KEY" in pm2:*) pm_id=${RESOURCE_KEY#pm2:} ;; *) fail "Invalid PM2 resource identifier." ;; esac
  case "$pm_id" in *[!0-9]*|'') fail "Invalid PM2 process identifier." ;; esac
  if ! pm2 "$ACTION" "$pm_id" >>"$OUTPUT_FILE" 2>&1; then
    fail "PM2 could not ${ACTION} process ${pm_id}."
  fi
  OBSERVED_STATE=$(pm2 jlist 2>/dev/null | jq -r --argjson id "$pm_id" '.[] | select(.pm_id == $id) | .pm2_env.status' | head -n 1)
  [ -n "$OBSERVED_STATE" ] || OBSERVED_STATE=missing
  HEALTH_STATUS=none
  if [ "$ACTION" = stop ]; then
    [ "$OBSERVED_STATE" = stopped ] || fail "The PM2 process is still running."
  else
    [ "$OBSERVED_STATE" = online ] || fail "The PM2 process did not become online."
  fi
  succeed
  ;;
*)
  fail "Unsupported service source: $KIND"
  ;;
esac
