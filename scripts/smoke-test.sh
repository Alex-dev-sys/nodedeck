#!/bin/sh
set -eu

BASE_URL=${SERVER_OS_SMOKE_URL:-http://127.0.0.1:8081}
EMAIL=${SERVER_OS_SMOKE_EMAIL:-owner@example.com}
: "${SERVER_OS_SMOKE_PASSWORD:?Set SERVER_OS_SMOKE_PASSWORD before running smoke tests}"

cookie_jar=$(mktemp)
trap 'rm -f "$cookie_jar"' EXIT

curl --fail --silent --show-error "${BASE_URL}/healthz" >/dev/null
login=$(curl --fail --silent --show-error --cookie-jar "$cookie_jar" --request POST "${BASE_URL}/api/v1/auth/login" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"${EMAIL}\",\"password\":\"${SERVER_OS_SMOKE_PASSWORD}\"}")

token=$(printf '%s' "$login" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
[ -n "$token" ] || { echo "Login did not return an access token" >&2; exit 1; }
initial_refresh=$(awk '$6 == "server_os_refresh" { print $7 }' "$cookie_jar")
[ -n "$initial_refresh" ] || { echo "Login did not set a refresh cookie" >&2; exit 1; }
curl --fail --silent --show-error "${BASE_URL}/api/v1/services" --header "Authorization: Bearer ${token}" >/dev/null
curl --fail --silent --show-error --cookie "$cookie_jar" --cookie-jar "$cookie_jar" --request POST "${BASE_URL}/api/v1/auth/refresh" >/dev/null
rotated_refresh=$(awk '$6 == "server_os_refresh" { print $7 }' "$cookie_jar")
[ "$initial_refresh" != "$rotated_refresh" ] || { echo "Refresh session did not rotate" >&2; exit 1; }
curl --fail --silent --show-error --cookie "$cookie_jar" --cookie-jar "$cookie_jar" --request POST "${BASE_URL}/api/v1/auth/logout" >/dev/null
refresh_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --cookie "$cookie_jar" --request POST "${BASE_URL}/api/v1/auth/refresh")
[ "$refresh_status" = "401" ] || { echo "Logout did not revoke the refresh session" >&2; exit 1; }
echo "Server-OS smoke test passed"
