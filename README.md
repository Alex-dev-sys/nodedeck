# NodeDeck

NodeDeck is a lightweight control plane for server projects. It provides a React dashboard,
an Express/PostgreSQL API, and a restricted local agent that discovers Docker Compose projects,
standalone containers, custom systemd services, and PM2 processes without creating duplicate
entries. Remote control is currently limited to standalone Docker containers.

## Local release

Copy `.env.example` to `.env`, replace every placeholder secret, then start the stack:

```sh
docker compose --env-file .env up --build -d
```

The default local URL is `http://127.0.0.1:8081`. The release smoke check requires
the owner password and validates health, login, refresh, logout, and an authenticated API read:

```sh
SERVER_OS_SMOKE_PASSWORD='your-owner-password' ./scripts/smoke-test.sh
```

For a TLS deployment, set `COOKIE_SECURE=true`, set `CORS_ORIGIN` to the public HTTPS URL,
and put TLS termination in front of the web container.
Set `HOST_ALERT_THRESHOLD` (50–100, default `90`) to control when CPU, RAM, or disk usage opens a host alert.

## Connect a server

1. Sign in, open **Agents**, and click **Enroll agent**.
2. Copy the generated one-line enrollment command; it installs the background agent and exchanges the token with `POST /agent/v1/enroll`.
3. Paste the generated command into any terminal. For local development from a checkout, use:

```sh
SERVER_OS_CONTROL_URL="http://127.0.0.1:8081" SERVER_OS_AGENT_TOKEN="$AGENT_TOKEN" ./scripts/install-agent.sh
```

Update an already enrolled agent without creating a new token:

```bash
./scripts/update-agent.sh
```

It sends a heartbeat every 20 seconds and a deduplicated inventory every 60 seconds. Docker is
optional. When Docker is available, the agent also sends a bounded, redacted log batch every
60 seconds. The browser never sends a shell command directly to the host.

Owners and admins can revoke an agent from **Agents**. Revocation immediately invalidates its
credential and marks its managed services offline; it never stops or deletes containers on the host.

NodeDeck can start, stop, and restart standalone Docker containers, whole Docker Compose projects,
user-level systemd services, and PM2 processes. System-level systemd units stay monitoring-only,
and the NodeDeck control plane is protected from managing itself.

### Start on macOS automatically

The installer copies the agent into `~/.server-os-agent`, so the repository can be moved or removed
after installation. Docker Desktop is only required when Docker projects should be discovered:

```sh
SERVER_OS_AGENT_TOKEN="$AGENT_TOKEN" \
SERVER_OS_CONTROL_URL="http://127.0.0.1:8081" \
./scripts/install-agent.sh
```

This writes the token with owner-only permissions to `~/.server-os-agent/agent.env` and creates
`~/Library/LaunchAgents/com.server-os.agent.plist`. Its logs are in `~/.server-os-agent/`.
To stop it:

```sh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.server-os.agent.plist"
```

## Command safety

Commands are organization-scoped and tied to the agent that owns the discovered resource. They
expire after ten minutes, are leased for two minutes once claimed, and are reported as queued,
running, succeeded, failed, or expired. The agent validates the same allowlist before invoking
Docker, systemd, or PM2 and accepts no arbitrary shell command from the API. Browser-issued commands carry an
idempotency key, so a repeated click or network retry does not queue a duplicate action.

The dashboard receives snapshots through same-origin Server-Sent Events authenticated by the
HttpOnly refresh cookie. If the browser does not support EventSource, it falls back to polling.

## Checks

```sh
npm run typecheck
npm test
npm run lint
npm run build
SERVER_OS_E2E_PASSWORD='your-owner-password' ./scripts/agent-e2e-test.sh
SERVER_OS_RELEASE_PASSWORD='your-owner-password' ./scripts/release-verify.sh
```

GitHub Actions runs these checks plus shell syntax validation on pull requests and `main`.

## Security

Read [SECURITY.md](SECURITY.md) before exposing NodeDeck to the internet or installing an agent on a production Docker host. It documents the trust boundary, agent privileges, required deployment settings, and private vulnerability-reporting process.
