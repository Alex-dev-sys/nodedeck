#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"

CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}
INTERVAL_SECONDS=${SERVER_OS_HEARTBEAT_INTERVAL:-20}
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HTTP_HELPER=${SERVER_OS_AGENT_HTTP_HELPER:-"$ROOT_DIR/agent-http.sh"}
PROC_STAT_PATH=${SERVER_OS_PROC_STAT_PATH:-/proc/stat}
CPU_SAMPLE_SECONDS=${SERVER_OS_CPU_SAMPLE_SECONDS:-1}
HEARTBEAT_ONCE=${SERVER_OS_HEARTBEAT_ONCE:-false}
PREVIOUS_CPU_TOTAL=
PREVIOUS_CPU_IDLE=

case "$INTERVAL_SECONDS" in
  *[!0-9]*|'') echo "SERVER_OS_HEARTBEAT_INTERVAL must be a positive number" >&2; exit 1 ;;
esac

echo "Server-OS agent heartbeat started: ${CONTROL_URL} every ${INTERVAL_SECONDS}s"

read_linux_cpu_sample() {
  awk '/^cpu / {
    total = 0
    last = NF < 9 ? NF : 9
    for (field = 2; field <= last; field++) total += $field
    idle = $5 + $6
    printf "%.0f %.0f\n", total, idle
    exit
  }' "$PROC_STAT_PATH"
}

host_cpu_percent() {
  if [ -r "$PROC_STAT_PATH" ]; then
    set -- $(read_linux_cpu_sample)
    current_total=${1:-0}
    current_idle=${2:-0}
    if [ -z "$PREVIOUS_CPU_TOTAL" ]; then
      PREVIOUS_CPU_TOTAL=$current_total
      PREVIOUS_CPU_IDLE=$current_idle
      sleep "$CPU_SAMPLE_SECONDS"
      set -- $(read_linux_cpu_sample)
      current_total=${1:-0}
      current_idle=${2:-0}
    fi
    total_delta=$((current_total - PREVIOUS_CPU_TOTAL))
    idle_delta=$((current_idle - PREVIOUS_CPU_IDLE))
    PREVIOUS_CPU_TOTAL=$current_total
    PREVIOUS_CPU_IDLE=$current_idle
    CPU=$(awk -v total="$total_delta" -v idle="$idle_delta" 'BEGIN {
      if (total <= 0) { print 0; exit }
      value = (total - idle) * 100 / total
      if (value < 0) value = 0
      if (value > 100) value = 100
      printf "%.0f", value
    }')
    return
  fi
  if command -v top >/dev/null 2>&1 && [ "$(uname -s)" = Darwin ]; then
    CPU=$(top -l 1 2>/dev/null | awk -F'[,:%]' '/CPU usage/ { printf "%.0f", $2 + $4; exit }' || echo 0)
    return
  fi
  cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)
  case "$cores" in *[!0-9]*|' '|''|0) cores=1 ;; esac
  CPU=$(ps -A -o %cpu= 2>/dev/null | awk -v cores="$cores" '{sum += $1} END { value = sum / cores; if (value > 100) value = 100; printf "%.0f", value }' || echo 0)
}

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
  host_cpu_percent
  RAM=$(host_ram_percent)
  DISK=$(df -P / 2>/dev/null | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }' || echo 0)
  UPTIME=$(host_uptime_seconds)
  [ -n "$CPU" ] || CPU=0
  [ -n "$RAM" ] || RAM=0
  [ -n "$DISK" ] || DISK=0
  [ -n "$UPTIME" ] || UPTIME=0
  [ "$CPU" -le 100 ] 2>/dev/null || CPU=100
  [ "$RAM" -le 100 ] 2>/dev/null || RAM=100
  if ! "$HTTP_HELPER" --fail --silent --show-error \
    --request POST "${CONTROL_URL}/agent/v1/heartbeat" \
    --header 'Content-Type: application/json' \
    --data "{\"host\":{\"cpu\":${CPU},\"ram\":${RAM},\"disk\":${DISK},\"uptimeSec\":${UPTIME}}}"
  then
    echo "Server-OS heartbeat failed; retrying on the next interval" >&2
  fi
  [ "$HEARTBEAT_ONCE" = true ] && break
  sleep "$INTERVAL_SECONDS"
done
