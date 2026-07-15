# Infra Dashboard v0.1 Private Alpha

## Product boundary

This release is a self-hosted control plane for one server owner. It ships a
local web UI, PostgreSQL and API as a Docker Compose stack. Browser clients
never receive Docker, SSH or RCON credentials.

The first production capability is deliberately narrow: discover and control
local Docker services through a local agent. The current UI demo remains
available until the agent-backed source replaces it.

## Install target

```sh
git clone <release-repository> infra-dashboard
cd infra-dashboard
INFRA_OWNER_EMAIL=owner@example.com ./scripts/install.sh
```

The installer generates secrets in `.env`, builds the compose stack, applies
migrations, creates the first owner account and exposes the UI only on
`127.0.0.1:8080`.

## v0.1 acceptance criteria

- A fresh host installs the stack without hand-editing compose files.
- The API persists users, services, incidents, audit events and command jobs.
- A local agent discovers Docker containers and reports status/logs.
- Start, stop and restart create audited jobs and only the local agent executes them.
- The UI renders real API data and has no demo-only actions in production mode.
- Backups, upgrades, uninstalls and security boundaries are documented and smoke-tested.

## Explicitly outside v0.1

- Payments, cloud accounts and remote access.
- Minecraft/RCON, VPN and systemd adapters.
- Multi-host orchestration.
- Automatic production deploys without an approval policy.
