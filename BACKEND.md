# Backend API

The dashboard backend is an Express service backed by PostgreSQL. It deliberately
queues operational commands instead of running Docker, RCON, or SSH from the
browser. A later executor consumes only `queued` commands using a scoped service
identity and reports its result back to the API.

## Local setup

1. Copy `.env.example` to `.env` and set a unique `JWT_SECRET` and bootstrap password.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Apply the schema: `npm run db:migrate`.
4. Create or rotate the owner account: `npm run db:seed`.
5. Start the API: `npm run api:dev`.

The development API listens on `http://127.0.0.1:8787`.

## Contract

- `POST /api/v1/auth/login` issues a 15-minute Bearer token.
- `GET /api/v1/me` validates the current token.
- `GET /api/v1/services` returns services and incidents.
- `GET /api/v1/events` is an authenticated SSE stream of fresh snapshots.
- `POST /api/v1/services/:serviceId/commands` accepts `start`, `restart`, `stop`, or `rollback` from operator-or-higher roles and returns a queued command.
- `POST /api/v1/incidents/:incidentId/resolve` requires an operator-or-higher role and refuses to resolve unless the service is healthy.

Authentication is mandatory for every operational route. The API writes an audit
entry before returning a queued command or resolved incident.
