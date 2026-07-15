#!/bin/sh
set -eu

BASE_URL=${SERVER_OS_RELEASE_URL:-http://127.0.0.1:8081}
: "${SERVER_OS_RELEASE_PASSWORD:?Set SERVER_OS_RELEASE_PASSWORD before release verification}"

SERVER_OS_SMOKE_URL="$BASE_URL" SERVER_OS_SMOKE_PASSWORD="$SERVER_OS_RELEASE_PASSWORD" ./scripts/smoke-test.sh
SERVER_OS_E2E_URL="$BASE_URL" SERVER_OS_E2E_PASSWORD="$SERVER_OS_RELEASE_PASSWORD" ./scripts/agent-e2e-test.sh

headers=$(curl --fail --silent --show-error --head "$BASE_URL/healthz")
printf '%s\n' "$headers" | grep -qi '^X-Content-Type-Options: nosniff' || { echo "Missing X-Content-Type-Options" >&2; exit 1; }
printf '%s\n' "$headers" | grep -qi '^X-Frame-Options: DENY' || { echo "Missing X-Frame-Options" >&2; exit 1; }
printf '%s\n' "$headers" | grep -qi '^Content-Security-Policy:' || { echo "Missing Content-Security-Policy" >&2; exit 1; }

echo "Server-OS release verification passed"
