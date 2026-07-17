#!/bin/sh
set -eu

: "${SERVER_OS_AGENT_TOKEN:?Set SERVER_OS_AGENT_TOKEN before starting the agent}"
CONTROL_URL=${SERVER_OS_CONTROL_URL:-http://127.0.0.1:8081}

case "$CONTROL_URL" in
  https://*) TLS_ARGS="--proto =https --tlsv1.2" ;;
  http://127.0.0.1|http://127.0.0.1:*|http://localhost|http://localhost:*) TLS_ARGS= ;;
  *) echo "NodeDeck agent requires HTTPS for a remote control plane." >&2; exit 1 ;;
esac

umask 077
AUTH_CONFIG=$(mktemp "${TMPDIR:-/tmp}/nodedeck-curl.XXXXXX")
cleanup() { rm -f "$AUTH_CONFIG"; }
trap cleanup EXIT HUP INT TERM
printf 'header = "Authorization: Agent %s"\n' "$SERVER_OS_AGENT_TOKEN" > "$AUTH_CONFIG"

# The credential is read from an owner-only temporary config, so it never
# appears in the curl process arguments or ordinary agent logs.
# shellcheck disable=SC2086
curl --config "$AUTH_CONFIG" $TLS_ARGS "$@"
