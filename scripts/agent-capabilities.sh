#!/bin/sh

AGENT_CAPABILITIES_FILE=${SERVER_OS_AGENT_CAPABILITIES_FILE:-"${SERVER_OS_AGENT_STATE_DIR:-$HOME/.server-os-agent}/capabilities.env"}

load_agent_capabilities() {
  SERVER_OS_TRACK_HOST_METRICS=true
  SERVER_OS_TRACK_DOCKER=true
  SERVER_OS_TRACK_NATIVE=true
  SERVER_OS_COLLECT_LOGS=true
  SERVER_OS_REMOTE_CONTROL=true
  SERVER_OS_AUTOMATIC_UPDATES=true
  if [ -r "$AGENT_CAPABILITIES_FILE" ]; then
    # This file is generated locally from the authenticated control-plane response.
    . "$AGENT_CAPABILITIES_FILE"
  fi
}

capability_enabled() {
  [ "${1:-false}" = true ]
}

save_agent_capabilities() {
  response=${1:-}
  [ -n "$response" ] || return 0
  content=$(printf '%s' "$response" | jq -er '
    .capabilities |
    select(
      (.trackHostMetrics | type) == "boolean" and
      (.trackDocker | type) == "boolean" and
      (.trackNative | type) == "boolean" and
      (.collectLogs | type) == "boolean" and
      (.remoteControl | type) == "boolean" and
      (.automaticUpdates | type) == "boolean"
    ) |
    "SERVER_OS_TRACK_HOST_METRICS=\(.trackHostMetrics)\n" +
    "SERVER_OS_TRACK_DOCKER=\(.trackDocker)\n" +
    "SERVER_OS_TRACK_NATIVE=\(.trackNative)\n" +
    "SERVER_OS_COLLECT_LOGS=\(.collectLogs)\n" +
    "SERVER_OS_REMOTE_CONTROL=\(.remoteControl)\n" +
    "SERVER_OS_AUTOMATIC_UPDATES=\(.automaticUpdates)"
  ') || return 0
  directory=$(dirname "$AGENT_CAPABILITIES_FILE")
  umask 077
  mkdir -p "$directory"
  temporary="${AGENT_CAPABILITIES_FILE}.tmp.$$"
  printf '%s\n' "$content" > "$temporary"
  mv "$temporary" "$AGENT_CAPABILITIES_FILE"
}
