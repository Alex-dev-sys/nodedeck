# NodeDeck

NodeDeck is a local control plane for Docker hosts. It provides a React dashboard,
an Express/PostgreSQL API, and a restricted local agent that inventories containers,
collects recent logs, and performs only `start`, `stop`, and `restart` commands.

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

## Connect a Docker host

1. Sign in, open **Agents**, and click **Enroll agent**.
2. Copy the generated one-time enrollment command; it exchanges the token with `POST /agent/v1/enroll`.
3. Run the agent from this checked-out release:

```sh
SERVER_OS_AGENT_TOKEN="$AGENT_TOKEN" ./scripts/install-agent.sh
```

Update an already enrolled agent without creating a new token:

```bash
./scripts/update-agent.sh
```

It sends a heartbeat every 20 seconds, Docker inventory every 60 seconds, and a bounded,
redacted log batch every 60 seconds. Only a host-local Docker CLI is used; the browser never
sends a container ID or shell command directly to Docker.

Owners and admins can revoke an agent from **Agents**. Revocation immediately invalidates its
credential and marks its managed services offline; it never stops or deletes containers on the host.

### Start on macOS automatically

The repository must remain at its current path because the LaunchAgent starts its scripts there.
With Docker Desktop running:

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

Commands are organization-scoped and tied to the agent that owns the discovered container. They
expire after ten minutes, are leased for two minutes once claimed, and are reported as queued,
running, succeeded, failed, or expired. The agent validates the same allowlist before invoking
Docker and sends no arbitrary shell command from the API. Browser-issued commands carry an
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
