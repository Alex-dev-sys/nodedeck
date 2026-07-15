const AGENT_ARCHIVE_URL = 'https://github.com/Alex-dev-sys/nodedeck/archive/refs/heads/main.tar.gz'

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

export function buildAgentInstallCommand(enrollmentToken: string, controlUrl: string) {
  const normalizedControlUrl = controlUrl.replace(/\/$/, '')

  return `set -eu
command -v curl >/dev/null 2>&1 || { echo 'curl is required' >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo 'tar is required' >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo 'jq is required' >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo 'Docker CLI is required' >&2; exit 1; }

NODEDECK_DIR=$(mktemp -d)
cleanup() { rm -rf "$NODEDECK_DIR"; }
trap cleanup EXIT HUP INT TERM

curl -fsSL ${shellQuote(AGENT_ARCHIVE_URL)} | tar -xz -C "$NODEDECK_DIR" --strip-components=1
ENROLLMENT_TOKEN=${shellQuote(enrollmentToken)}
AGENT_TOKEN=$(curl -fsS -X POST ${shellQuote(`${normalizedControlUrl}/agent/v1/enroll`)} \
  -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg token "$ENROLLMENT_TOKEN" --arg hostname "$(hostname)" '{token: $token, hostname: $hostname}')" | jq -er .agentToken)

SERVER_OS_CONTROL_URL=${shellQuote(normalizedControlUrl)} \
SERVER_OS_AGENT_TOKEN="$AGENT_TOKEN" \
"$NODEDECK_DIR/scripts/install-agent.sh"`
}
