#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_CONFIG:?Set SERVER_OS_AGENT_CONFIG to the agent environment file}"
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

[ -r "$SERVER_OS_AGENT_CONFIG" ] || { echo "Server-OS agent configuration is not readable" >&2; exit 1; }
set -a
. "$SERVER_OS_AGENT_CONFIG"
set +a

exec "$ROOT_DIR/agent-run.sh"
