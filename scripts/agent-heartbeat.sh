#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"

CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
INTERVAL_SECONDS=${SERVER_OS_HEARTBEAT_INTERVAL:-20}

case "$INTERVAL_SECONDS" in
  *[!0-9]*|'') echo "SERVER_OS_HEARTBEAT_INTERVAL must be a positive number" >&2; exit 1 ;;
esac

echo "Server-OS agent heartbeat started: ${CONTROL_URL} every ${INTERVAL_SECONDS}s"

host_ram_percent() {
  if [ -r /proc/meminfo ]; then
    awk '/MemTotal:/ { total = $2 } /MemAvailable:/ { available = $2 } END { if (total > 0) printf "%.0f", ((total - available) * 100 / total); else print 0 }' /proc/meminfo
    return
  fi
  if command -v vm_stat >/dev/null 2>&1 && command -v sysctl >/dev/null 2>&1; then
    total=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
    page_size=$(sysctl -n hw.pagesize 2>/dev/null || echo 4096)
    available_pages=$(vm_stat 2>/dev/null | awk '/Pages free/ || /Pages speculative/ || /Pages inactive/ { gsub(/\./, "", $3); total += $3 } END { print total + 0 }')
    awk -v total="$total" -v page_size="$page_size" -v available="$available_pages" 'BEGIN { if (total > 0) { value = (total - available * page_size) * 100 / total; if (value < 0) value = 0; if (value > 100) value = 100; printf "%.0f", value } else print 0 }'
    return
  fi
  echo 0
}

host_uptime_seconds() {
  if [ -r /proc/uptime ]; then awk '{ print int($1) }' /proc/uptime; return; fi
  if command -v sysctl >/dev/null 2>&1; then
    boot=$(sysctl -n kern.boottime 2>/dev/null | sed -n 's/.*sec = \([0-9][0-9]*\).*/\1/p')
    now=$(date +%s)
    if [ -n "$boot" ] && [ "$now" -ge "$boot" ]; then echo $((now - boot)); return; fi
  fi
  echo 0
}

while :; do
  if command -v top >/dev/null 2>&1 && [ "$(uname -s)" = Darwin ]; then
    CPU=$(top -l 1 2>/dev/null | awk -F'[,:%]' '/CPU usage/ { printf "%.0f", $2 + $4; exit }' || echo 0)
  else
    CPU=$(ps -A -o %cpu= 2>/dev/null | awk '{sum += $1} END { printf "%.0f", sum }' || echo 0)
  fi
  RAM=$(host_ram_percent)
  DISK=$(df -P / 2>/dev/null | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }' || echo 0)
  UPTIME=$(host_uptime_seconds)
  [ -n "$CPU" ] || CPU=0
  [ -n "$RAM" ] || RAM=0
  [ -n "$DISK" ] || DISK=0
  [ -n "$UPTIME" ] || UPTIME=0
  [ "$CPU" -le 100 ] 2>/dev/null || CPU=100
  [ "$RAM" -le 100 ] 2>/dev/null || RAM=100
  if ! curl --fail --silent --show-error \
    --request POST "${CONTROL_URL}/agent/v1/heartbeat" \
    --header "Authorization: Agent ${SERVER_OS_AGENT_TOKEN}" \
    --header 'Content-Type: application/json' \
    --data "{\"host\":{\"cpu\":${CPU},\"ram\":${RAM},\"disk\":${DISK},\"uptimeSec\":${UPTIME}}}"
  then
    echo "Server-OS heartbeat failed; retrying on the next interval" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done
