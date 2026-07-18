# NodeDeck security

NodeDeck controls real workloads, so security is part of the product boundary rather than an optional deployment extra. This document describes the current guarantees, the trust model, and how to report a vulnerability.

## Reporting a vulnerability

Do not publish an exploit, token, customer data, or a working proof of concept in a public issue. Use GitHub's private vulnerability reporting for the repository so the problem can be reproduced and fixed before disclosure:

https://github.com/Alex-dev-sys/nodedeck/security/advisories/new

Include the affected route or agent version, impact, minimal reproduction steps, and whether any real data or credentials may have been exposed.

## Trust model

- The browser talks only to the NodeDeck control plane over HTTPS.
- Access tokens are short lived and stay in browser memory. Refresh tokens are random, rotated, hashed in the database, and stored in an HttpOnly, SameSite cookie. Reuse of a rotated token revokes its entire session family and creates a denied audit event.
- Every product query is scoped to the authenticated organization. Mutating routes also enforce an explicit role.
- The Supabase Data API roles have no privileges on NodeDeck tables. The backend uses a trusted direct Postgres connection; RLS remains enabled as an additional deny-by-default boundary.
- Agent enrollment tokens are one-time credentials that expire after 15 minutes. Long-lived agent tokens are random, stored only as hashes by the control plane, and can be revoked by deleting the agent.
- The agent accepts only `start`, `restart`, and `stop` for an already discovered Docker project, user systemd unit, or numeric PM2 process. It does not accept arbitrary shell text from the browser or API.
- Remote agent traffic must use HTTPS. Plain HTTP is accepted only for `localhost` development.

## Important agent boundary

Docker access is powerful: on most Linux systems, access to the Docker daemon is effectively administrator-level access to that host. Install the agent as a dedicated non-root user where possible, protect that user's account, and do not expose its `~/.server-os-agent` directory. The token file and installed scripts are created with owner-only permissions.

NodeDeck redacts common password, bearer-token, API-key, and database-URL patterns before uploading logs. Redaction cannot recognize every application-specific secret, so applications must still avoid writing credentials to stdout or stderr.

## Production requirements

- Use an HTTPS control-plane URL and `COOKIE_SECURE=true`.
- Use a unique, randomly generated `JWT_SECRET` and `CRON_SECRET`; never commit `.env` files.
- Use TLS certificate verification for remote Postgres connections.
- Supabase connections pin the public Supabase Root 2021 CA (SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`). Review Supabase's current root before this certificate expires in April 2031.
- Keep the pinned agent release current and review changes before updating the pin.
- Review Supabase security advisors, Vercel runtime errors, dependency audit results, and failed authentication traffic before every release.
- Rotate any credential immediately if it appears in a terminal recording, issue, chat, log, or build artifact.
- Keep Stripe secrets server-side, verify every webhook signature against the raw request body, and never grant browser roles access to billing event tables.

## Defense in depth

NodeDeck currently includes database-backed rate limits for authentication, registration, health checks, agent enrollment, heartbeats, inventory, logs, command polling, and user-triggered control actions. API responses are non-cacheable and carry restrictive browser security headers. Request bodies, identifiers, methods, content types, command targets, and webhook destinations are validated before use.

No software can promise zero vulnerabilities. Before handling paying customers' production infrastructure, commission an independent penetration test and add multi-factor authentication, verified email recovery, signed agent releases, and automated secret scanning.
