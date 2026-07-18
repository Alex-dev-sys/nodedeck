#!/bin/sh
set -eu

CURRENT_VERSION=${1:-}
RESPONSE=${2:-}
STATE_DIR=${SERVER_OS_AGENT_STATE_DIR:-"$HOME/.server-os-agent"}
ATTEMPT_FILE=${SERVER_OS_AGENT_UPDATE_ATTEMPT_FILE:-"$STATE_DIR/update-attempt"}
RETRY_SECONDS=${SERVER_OS_AGENT_UPDATE_RETRY_SECONDS:-3600}

[ -n "$CURRENT_VERSION" ] || exit 0
[ -n "$RESPONSE" ] || exit 0

automatic=$(printf '%s' "$RESPONSE" | jq -er '.capabilities.automaticUpdates | select(type == "boolean")' 2>/dev/null || printf false)
[ "$automatic" = true ] || exit 0

release=$(printf '%s' "$RESPONSE" | jq -er '
  .agentRelease |
  select(
    (.version | type) == "string" and
    (.ref | test("^[a-f0-9]{40}$")) and
    (.archiveUrl | type) == "string" and
    (.sha256 | test("^[a-f0-9]{64}$"))
  ) |
  [.version, .ref, .archiveUrl, .sha256] | @tsv
' 2>/dev/null || true)
[ -n "$release" ] || exit 0

tab_character=$(printf '\t')
IFS="$tab_character" read -r latest_version release_ref archive_url expected_sha256 <<EOF
$release
EOF
[ "$latest_version" != "$CURRENT_VERSION" ] || exit 0
case "$archive_url" in
  https://*) ;;
  *) echo "NodeDeck refused a non-HTTPS agent update URL" >&2; exit 0 ;;
esac
case "$archive_url" in *@*) echo "NodeDeck refused an agent update URL containing credentials" >&2; exit 0 ;; esac

now=$(date +%s)
last_version=
last_attempt=0
if [ -r "$ATTEMPT_FILE" ]; then
  read -r last_version last_attempt < "$ATTEMPT_FILE" || true
fi
case "$last_attempt" in *[!0-9]*|'') last_attempt=0 ;; esac
if [ "$last_version" = "$latest_version" ] && [ $((now - last_attempt)) -lt "$RETRY_SECONDS" ]; then
  exit 0
fi

command -v curl >/dev/null 2>&1 || { echo "curl is required for automatic agent updates" >&2; exit 0; }
command -v tar >/dev/null 2>&1 || { echo "tar is required for automatic agent updates" >&2; exit 0; }
if command -v sha256sum >/dev/null 2>&1; then
  calculate_sha256() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  calculate_sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "sha256sum or shasum is required for automatic agent updates" >&2
  exit 0
fi

umask 077
mkdir -p "$STATE_DIR"
work_dir=$(mktemp -d "$STATE_DIR/update.XXXXXX")
archive="$work_dir/agent.tar.gz"
if ! curl --proto '=https' --tlsv1.2 -fsSL "$archive_url" -o "$archive"; then
  rm -rf "$work_dir"
  echo "NodeDeck could not download agent ${latest_version}" >&2
  exit 0
fi
actual_sha256=$(calculate_sha256 "$archive")
if [ "$actual_sha256" != "$expected_sha256" ]; then
  rm -rf "$work_dir"
  echo "NodeDeck rejected agent ${latest_version}: SHA-256 mismatch" >&2
  exit 0
fi
mkdir -p "$work_dir/release"
if ! tar -xzf "$archive" -C "$work_dir/release" --strip-components=1; then
  rm -rf "$work_dir"
  echo "NodeDeck could not unpack agent ${latest_version}" >&2
  exit 0
fi
update_script="$work_dir/release/scripts/update-agent.sh"
[ -x "$update_script" ] || { rm -rf "$work_dir"; echo "NodeDeck rejected an incomplete agent release" >&2; exit 0; }

printf '%s %s\n' "$latest_version" "$now" > "$ATTEMPT_FILE"
echo "NodeDeck verified agent ${latest_version} (${release_ref}); installing…"
if [ "${SERVER_OS_AGENT_UPDATE_FOREGROUND:-false}" = true ]; then
  "$update_script"
  rm -rf "$work_dir"
else
  (
    trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
    "$update_script"
  ) >> "$STATE_DIR/update.log" 2>&1 &
fi
