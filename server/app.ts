import cors from 'cors'
import { createHash, randomBytes } from 'node:crypto'
import express, { type Response } from 'express'
import type { Pool } from 'pg'
import { z } from 'zod'
import { createRefreshToken, hashRefreshToken, signAccessToken, verifyAccessToken, verifyPassword, type Role } from './auth.js'
import type { Config } from './config.js'
import { inTransaction } from './db/pool.js'
import { publishSnapshotChanged, subscribeSnapshotChanged } from './events.js'
import { errorHandler, requireAuth, requireRole, type AuthenticatedRequest } from './http.js'
import { sendNotification, validateWebhookUrl, type NotificationChannelConfig } from './notifications.js'
import { registerOwner, RegistrationConflictError, registrationSchema } from './registration.js'
import { openSecret, sealSecret } from './secrets.js'

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
const commandSchema = z.object({ action: z.enum(['start', 'restart', 'stop']) })
const enrollmentSchema = z.object({ name: z.string().trim().min(1).max(80) })
const agentEnrollmentSchema = z.object({ token: z.string().min(32), hostname: z.string().trim().min(1).max(255) })
const heartbeatSchema = z.object({
  host: z.object({
    cpu: z.coerce.number().min(0).max(100),
    ram: z.coerce.number().min(0).max(100),
    disk: z.coerce.number().min(0).max(100),
    uptimeSec: z.coerce.number().int().min(0),
  }).optional(),
})
const inventorySchema = z.object({
  services: z.array(z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(255),
    image: z.string().min(1).max(512),
    status: z.enum(['healthy', 'degraded', 'restarting', 'updating', 'offline']),
    cpu: z.coerce.number().min(0).max(100).optional(),
    ram: z.coerce.number().min(0).max(100).optional(),
    runtimeState: z.string().max(32).optional(),
    healthStatus: z.string().max(32).optional(),
    restartCount: z.coerce.number().int().min(0).optional(),
    startedAt: z.string().datetime().nullable().optional(),
    composeProject: z.string().max(255).nullable().optional(),
    composeService: z.string().max(255).nullable().optional(),
    ports: z.array(z.string().max(255)).max(100).optional(),
    protected: z.boolean().optional(),
  })).max(500),
})
const commandResultSchema = z.object({
  ok: z.boolean(),
  message: z.string().max(2000).optional(),
  observedState: z.string().max(32).optional(),
  healthStatus: z.string().max(32).optional(),
})
const logBatchSchema = z.object({ entries: z.array(z.object({ containerId: z.string().min(1).max(128), ts: z.string().datetime().optional(), level: z.enum(['info', 'warn', 'error', 'debug']).default('info'), text: z.string().min(1).max(4000) })).max(500) })
const commandListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
const logListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100), serviceId: z.string().min(1).optional() })
const metricRangeSchema = z.object({ range: z.enum(['15m', '1h', '6h', '24h', '7d', '30d']).default('1h') })
const notificationChannelSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('telegram'),
    name: z.string().trim().min(1).max(80),
    botToken: z.string().trim().min(20).max(255),
    chatId: z.string().trim().min(1).max(100),
  }),
  z.object({
    kind: z.literal('webhook'),
    name: z.string().trim().min(1).max(80),
    url: z.string().url().max(2000),
  }),
])

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function readCookie(header: string | undefined, name: string) {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

interface ServiceRow {
  id: string
  name: string
  kind: string
  status: string
  hostname: string
  version: string
  cpu: number | null
  ram: number | null
  containerId: string | null
  runtimeState: string | null
  healthStatus: string | null
  restartCount: number
  uptimeSec: number | null
  composeProject: string | null
  composeService: string | null
  ports: string[]
  protected: boolean
  updatedAt: string
}

async function snapshot(pool: Pool, organizationId: string) {
  const [services, incidents, agent] = await Promise.all([
    pool.query<ServiceRow>(
      `SELECT s.id, s.name, s.kind, s.status, s.hostname, s.version, s.cpu, s.ram,
              s.container_id AS "containerId", s.runtime_state AS "runtimeState", s.health_status AS "healthStatus",
              s.restart_count AS "restartCount",
              CASE WHEN s.started_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - s.started_at)))::bigint END AS "uptimeSec",
              s.compose_project AS "composeProject", s.compose_service AS "composeService", s.ports,
              s.is_protected AS "protected", s.updated_at AS "updatedAt"
       FROM services s JOIN agents a ON a.id = s.agent_id
       WHERE s.organization_id = $1 AND a.revoked_at IS NULL AND s.runtime_state IS DISTINCT FROM 'missing'
       ORDER BY s.name`,
      [organizationId],
    ),
    pool.query(
      `SELECT i.id, i.service_id AS "serviceId", i.severity, i.title, i.root_cause AS "rootCause",
              i.started_at AS "startedAt", i.resolved_at AS "resolvedAt", i.resolved_by AS "resolvedBy"
       FROM incidents i WHERE i.organization_id = $1 ORDER BY i.started_at DESC LIMIT 100`,
      [organizationId],
    ),
    pool.query<{ cpu: number | null; ram: number | null; disk: number | null; uptimeSec: number | null }>(
      `SELECT host_cpu AS cpu, host_ram AS ram, host_disk AS disk, host_uptime_sec AS "uptimeSec"
       FROM agents WHERE organization_id = $1 AND revoked_at IS NULL
       ORDER BY last_seen_at DESC NULLS LAST LIMIT 1`,
      [organizationId],
    ),
  ])
  const latestHost = agent.rows[0]
  return {
    services: services.rows,
    incidents: incidents.rows,
    host: {
      cpu: Number(latestHost?.cpu ?? 0),
      ram: Number(latestHost?.ram ?? 0),
      disk: Number(latestHost?.disk ?? 0),
      uptimeSec: Number(latestHost?.uptimeSec ?? 0),
    },
    serverTimeMs: Date.now(),
  }
}

function writeEvent(res: Response, event: string, body: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`)
}

export function createApp(config: Config, pool: Pool) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] }))
  app.use((req: AuthenticatedRequest, res: Response, next: (error?: unknown) => void) => {
    const supplied = req.header('x-request-id')
    req.requestId = supplied && /^[A-Za-z0-9_-]{8,128}$/.test(supplied) ? supplied : randomBytes(12).toString('hex')
    res.setHeader('X-Request-ID', req.requestId)
    next()
  })
  app.use(express.json({ limit: '16kb' }))

  const requireEventAuth = async (req: AuthenticatedRequest, res: Response, next: (error?: unknown) => void) => {
    const authorization = req.header('authorization')
    if (authorization?.startsWith('Bearer ')) {
      try {
        req.user = verifyAccessToken(authorization.slice(7), config)
        next()
        return
      } catch {
        res.status(401).json({ error: 'invalid_access_token' })
        return
      }
    }
    const refreshToken = readCookie(req.header('cookie'), 'server_os_refresh')
    if (!refreshToken) {
      res.status(401).json({ error: 'authentication_required' })
      return
    }
    try {
      const result = await pool.query<{ id: string; email: string; role: Role; organizationId: string }>(
        `SELECT u.id, u.email, m.role, s.organization_id AS "organizationId" FROM refresh_sessions s
         JOIN users u ON u.id = s.user_id JOIN organization_members m ON m.user_id = u.id AND m.organization_id = s.organization_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [hashRefreshToken(refreshToken)],
      )
      if (!result.rowCount) {
        res.status(401).json({ error: 'invalid_refresh_session' })
        return
      }
      req.user = result.rows[0]
      next()
    } catch (error) {
      next(error)
    }
  }

  app.get('/healthz', async (_req, res) => {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  })

  app.post('/api/v1/auth/login', async (req, res) => {
    const { email, password } = loginSchema.parse(req.body)
    const result = await pool.query<{ id: string; email: string; passwordHash: string; role: 'owner' | 'admin' | 'operator' | 'viewer'; organizationId: string }>(
      `SELECT u.id, u.email, u.password_hash AS "passwordHash", m.role, m.organization_id AS "organizationId"
       FROM users u
       JOIN organization_members m ON m.user_id = u.id
       WHERE u.email = $1
       ORDER BY m.created_at
       LIMIT 1`,
      [email.toLowerCase()],
    )
    const user = result.rows[0]
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'invalid_credentials' })
      return
    }
    const refreshToken = createRefreshToken()
    await pool.query(`INSERT INTO refresh_sessions (user_id, organization_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '30 days')`, [user.id, user.organizationId, hashRefreshToken(refreshToken)])
    res.cookie('server_os_refresh', refreshToken, { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/v1' })
    res.json({
      accessToken: signAccessToken(user, config),
      user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    })
  })

  app.post('/api/v1/auth/register', async (req, res) => {
    const input = registrationSchema.parse(req.body)
    try {
      const { user, refreshToken } = await registerOwner(pool, input)
      res.cookie('server_os_refresh', refreshToken, { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/v1' })
      res.status(201).json({ accessToken: signAccessToken(user, config), user })
    } catch (error) {
      if (error instanceof RegistrationConflictError) {
        res.status(409).json({ error: error.code })
        return
      }
      throw error
    }
  })

  app.post('/api/v1/auth/local-session', async (_req, res) => {
    if (!config.LOCAL_AUTH_BYPASS) return res.status(404).json({ error: 'local_auth_disabled' })
    if (!config.BOOTSTRAP_EMAIL) return res.status(503).json({ error: 'bootstrap_owner_missing' })
    const result = await pool.query<{ id: string; email: string; role: Role; organizationId: string }>(
      `SELECT u.id, u.email, m.role, m.organization_id AS "organizationId"
       FROM users u JOIN organization_members m ON m.user_id = u.id
       WHERE u.email = $1 ORDER BY m.created_at LIMIT 1`,
      [config.BOOTSTRAP_EMAIL.toLowerCase()],
    )
    const user = result.rows[0]
    if (!user) return res.status(503).json({ error: 'bootstrap_owner_missing' })
    const refreshToken = createRefreshToken()
    await pool.query(`INSERT INTO refresh_sessions (user_id, organization_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '30 days')`, [user.id, user.organizationId, hashRefreshToken(refreshToken)])
    res.cookie('server_os_refresh', refreshToken, { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/v1' })
    res.json({ accessToken: signAccessToken(user, config), user })
  })

  app.post('/api/v1/auth/refresh', async (req, res) => {
    const token = readCookie(req.header('cookie'), 'server_os_refresh')
    if (!token) return res.status(401).json({ error: 'refresh_required' })
    const session = await inTransaction(pool, async (client) => {
      const result = await client.query<{ sessionId: string; id: string; email: string; role: Role; organizationId: string }>(
        `SELECT s.id AS "sessionId", u.id, u.email, m.role, s.organization_id AS "organizationId" FROM refresh_sessions s
         JOIN users u ON u.id = s.user_id JOIN organization_members m ON m.user_id = u.id AND m.organization_id = s.organization_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() FOR UPDATE`, [hashRefreshToken(token)])
      const current = result.rows[0]
      if (!current) return null
      const replacement = createRefreshToken()
      await client.query('UPDATE refresh_sessions SET revoked_at = now() WHERE id = $1', [current.sessionId])
      await client.query(`INSERT INTO refresh_sessions (user_id, organization_id, token_hash, expires_at)
        VALUES ($1, $2, $3, now() + interval '30 days')`, [current.id, current.organizationId, hashRefreshToken(replacement)])
      return { user: { id: current.id, email: current.email, role: current.role, organizationId: current.organizationId }, replacement }
    })
    if (!session) return res.status(401).json({ error: 'invalid_refresh_session' })
    res.cookie('server_os_refresh', session.replacement, { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/v1' })
    res.json({ accessToken: signAccessToken(session.user, config), user: session.user })
  })

  app.post('/api/v1/auth/logout', async (req, res) => {
    const token = readCookie(req.header('cookie'), 'server_os_refresh')
    if (token) await pool.query('UPDATE refresh_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashRefreshToken(token)])
    res.clearCookie('server_os_refresh', { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/api/v1' })
    res.clearCookie('server_os_refresh', { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/api/v1/auth' })
    res.status(204).end()
  })

  app.get('/api/v1/me', requireAuth(config), (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user })
  })

  app.post('/api/v1/agent-enrollments', requireAuth(config), requireRole('owner', 'admin'), async (req: AuthenticatedRequest, res) => {
    const user = req.user!
    const { name } = enrollmentSchema.parse(req.body)
    const token = randomBytes(32).toString('base64url')
    const result = await pool.query<{ id: string; expiresAt: string }>(
      `INSERT INTO agent_enrollments (organization_id, token_hash, agent_name, created_by, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour')
       RETURNING id, expires_at AS "expiresAt"`,
      [user.organizationId, tokenHash(token), name, user.id],
    )
    res.status(201).json({ enrollment: { id: result.rows[0].id, token, expiresAt: result.rows[0].expiresAt } })
  })

  app.get('/api/v1/agents', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const agents = await pool.query(
      `SELECT id, name, hostname, last_seen_at AS "lastSeenAt", created_at AS "createdAt",
              host_cpu AS "hostCpu", host_ram AS "hostRam", host_disk AS "hostDisk", host_uptime_sec AS "hostUptimeSec"
       FROM agents WHERE organization_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [req.user!.organizationId],
    )
    res.json({ agents: agents.rows, serverTimeMs: Date.now() })
  })

  app.get('/api/v1/notification-channels', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const channels = await pool.query(
      `SELECT id, kind, name, target, enabled, created_at AS "createdAt"
       FROM notification_channels WHERE organization_id = $1 ORDER BY created_at DESC`,
      [req.user!.organizationId],
    )
    res.json({ channels: channels.rows })
  })

  app.post('/api/v1/notification-channels', requireAuth(config), requireRole('owner', 'admin'), async (req: AuthenticatedRequest, res) => {
    const user = req.user!
    const input = notificationChannelSchema.parse(req.body)
    const channelConfig: NotificationChannelConfig = input.kind === 'telegram'
      ? { kind: 'telegram', botToken: input.botToken, chatId: input.chatId }
      : { kind: 'webhook', url: validateWebhookUrl(input.url) }
    const target = input.kind === 'telegram' ? `Chat ${input.chatId}` : new URL(channelConfig.kind === 'webhook' ? channelConfig.url : '').host
    const channel = await pool.query(
      `INSERT INTO notification_channels (organization_id, kind, name, target, config_encrypted, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, name, target, enabled, created_at AS "createdAt"`,
      [user.organizationId, input.kind, input.name, target, sealSecret(channelConfig, config.JWT_SECRET), user.id],
    )
    await pool.query(
      `INSERT INTO audit_logs (organization_id, actor_id, action, target, result)
       VALUES ($1, $2, 'notification_channel.create', $3, 'ok')`,
      [user.organizationId, user.id, channel.rows[0].id],
    )
    res.status(201).json({ channel: channel.rows[0] })
  })

  app.post('/api/v1/notification-channels/:channelId/test', requireAuth(config), requireRole('owner', 'admin'), async (req: AuthenticatedRequest, res) => {
    const channel = await pool.query<{ encryptedConfig: string }>(
      `SELECT config_encrypted AS "encryptedConfig" FROM notification_channels
       WHERE id = $1 AND organization_id = $2 AND enabled = true`,
      [req.params.channelId, req.user!.organizationId],
    )
    if (!channel.rowCount) return res.status(404).json({ error: 'notification_channel_not_found' })
    await sendNotification(openSecret<NotificationChannelConfig>(channel.rows[0].encryptedConfig, config.JWT_SECRET), {
      id: randomBytes(16).toString('hex'),
      kind: 'test',
      title: 'Test notification delivered',
      details: { message: 'NodeDeck can reach this channel.' },
      openedAt: new Date().toISOString(),
    })
    res.status(204).end()
  })

  app.delete('/api/v1/notification-channels/:channelId', requireAuth(config), requireRole('owner', 'admin'), async (req: AuthenticatedRequest, res) => {
    const deleted = await pool.query(
      `DELETE FROM notification_channels WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.channelId, req.user!.organizationId],
    )
    if (!deleted.rowCount) return res.status(404).json({ error: 'notification_channel_not_found' })
    await pool.query(
      `INSERT INTO audit_logs (organization_id, actor_id, action, target, result)
       VALUES ($1, $2, 'notification_channel.delete', $3, 'ok')`,
      [req.user!.organizationId, req.user!.id, req.params.channelId],
    )
    res.status(204).end()
  })

  app.delete('/api/v1/agents/:agentId', requireAuth(config), requireRole('owner', 'admin'), async (req: AuthenticatedRequest, res) => {
    const user = req.user!
    const revoked = await inTransaction(pool, async (client) => {
      const agent = await client.query<{ id: string }>(
        `UPDATE agents SET revoked_at = now(), token_hash = $3
         WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL RETURNING id`,
        [req.params.agentId, user.organizationId, tokenHash(randomBytes(32).toString('base64url'))],
      )
      if (!agent.rowCount) return false
      await client.query(`UPDATE services SET status = 'offline', cpu = 0, ram = 0, updated_at = now()
        WHERE organization_id = $1 AND agent_id = $2`, [user.organizationId, agent.rows[0].id])
      await client.query(`UPDATE alert_events SET status = 'resolved', resolved_at = now()
        WHERE agent_id = $1 AND status = 'open'`, [agent.rows[0].id])
      await client.query(`INSERT INTO audit_logs (organization_id, actor_id, action, target, result)
        VALUES ($1, $2, 'agent.revoke', $3, 'ok')`, [user.organizationId, user.id, agent.rows[0].id])
      return true
    })
    if (!revoked) return res.status(404).json({ error: 'agent_not_found' })
    publishSnapshotChanged(user.organizationId)
    res.status(204).end()
  })

  app.post('/agent/v1/enroll', async (req, res) => {
    const { token, hostname } = agentEnrollmentSchema.parse(req.body)
    const enrollment = await inTransaction(pool, async (client) => {
      const found = await client.query<{ id: string; organizationId: string; agentName: string }>(
        `SELECT id, organization_id AS "organizationId", agent_name AS "agentName"
         FROM agent_enrollments WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
        [tokenHash(token)],
      )
      const current = found.rows[0]
      if (!current) return null
      const agentToken = randomBytes(32).toString('base64url')
      const agent = await client.query<{ id: string }>(
        `INSERT INTO agents (organization_id, name, hostname, token_hash)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [current.organizationId, current.agentName, hostname, tokenHash(agentToken)],
      )
      await client.query('UPDATE agent_enrollments SET used_at = now() WHERE id = $1', [current.id])
      return { agentId: agent.rows[0].id, agentToken }
    })
    if (!enrollment) return res.status(401).json({ error: 'invalid_or_expired_enrollment' })
    res.status(201).json(enrollment)
  })

  app.post('/agent/v1/heartbeat', async (req, res) => {
    const { host } = heartbeatSchema.parse(req.body)
    const value = req.header('authorization')
    if (!value?.startsWith('Agent ')) return res.status(401).json({ error: 'agent_authentication_required' })
    const result = await pool.query<{ id: string; organizationId: string }>(
      `UPDATE agents
       SET last_seen_at = now(), host_cpu = $1, host_ram = $2, host_disk = $3, host_uptime_sec = $4
       WHERE token_hash = $5 AND revoked_at IS NULL RETURNING id, organization_id AS "organizationId"`,
      [host?.cpu ?? null, host?.ram ?? null, host?.disk ?? null, host?.uptimeSec ?? null, tokenHash(value.slice(6))],
    )
    if (!result.rowCount) return res.status(401).json({ error: 'invalid_agent_token' })
    if (host) {
      await pool.query(
        `INSERT INTO host_metric_samples (organization_id, agent_id, cpu, ram, disk, uptime_sec)
         SELECT organization_id, id, $2, $3, $4, $5 FROM agents WHERE id = $1`,
        [result.rows[0].id, host.cpu, host.ram, host.disk, host.uptimeSec],
      )
      await pool.query(`DELETE FROM host_metric_samples WHERE agent_id = $1 AND recorded_at < now() - interval '30 days'`, [result.rows[0].id])
    }
    await pool.query(`UPDATE alert_events SET status = 'resolved', resolved_at = now()
      WHERE agent_id = $1 AND kind = 'agent_offline' AND status = 'open'`, [result.rows[0].id])
    const metrics = [host?.cpu, host?.ram, host?.disk].filter((value): value is number => value != null)
    if (metrics.some((value) => value >= config.HOST_ALERT_THRESHOLD)) {
      await pool.query(
        `INSERT INTO alert_events (organization_id, agent_id, kind, title, details)
         SELECT organization_id, id, 'host_resource_high', 'Host resource usage is high', $2::jsonb FROM agents WHERE id = $1
         ON CONFLICT (agent_id, kind) WHERE status = 'open' AND agent_id IS NOT NULL AND service_id IS NULL AND command_id IS NULL DO NOTHING`,
        [result.rows[0].id, JSON.stringify({ cpu: host?.cpu, ram: host?.ram, disk: host?.disk, threshold: config.HOST_ALERT_THRESHOLD })],
      )
    } else {
      await pool.query(`UPDATE alert_events SET status = 'resolved', resolved_at = now()
        WHERE agent_id = $1 AND kind = 'host_resource_high' AND status = 'open'`, [result.rows[0].id])
    }
    publishSnapshotChanged(result.rows[0].organizationId)
    res.status(204).end()
  })

  app.post('/agent/v1/inventory', async (req, res) => {
    const { services } = inventorySchema.parse(req.body)
    const value = req.header('authorization')
    if (!value?.startsWith('Agent ')) return res.status(401).json({ error: 'agent_authentication_required' })
    const agent = await pool.query<{ id: string; organizationId: string; hostname: string }>(
      `SELECT id, organization_id AS "organizationId", hostname FROM agents WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash(value.slice(6))],
    )
    const current = agent.rows[0]
    if (!current) return res.status(401).json({ error: 'invalid_agent_token' })
    await inTransaction(pool, async (client) => {
      for (const service of services) {
        const stored = await client.query<{ id: string }>(
          `INSERT INTO services (
             id, organization_id, agent_id, container_id, name, kind, status, hostname, version, cpu, ram,
             runtime_state, health_status, restart_count, started_at, compose_project, compose_service, ports, is_protected
           )
           VALUES ($1, $2, $3, $4, $5, 'docker', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18)
           ON CONFLICT (agent_id, container_id) WHERE container_id IS NOT NULL DO UPDATE SET
             name = EXCLUDED.name, status = EXCLUDED.status,
             hostname = EXCLUDED.hostname, version = EXCLUDED.version, cpu = EXCLUDED.cpu, ram = EXCLUDED.ram,
             runtime_state = EXCLUDED.runtime_state, health_status = EXCLUDED.health_status,
             restart_count = EXCLUDED.restart_count, started_at = EXCLUDED.started_at,
             compose_project = EXCLUDED.compose_project, compose_service = EXCLUDED.compose_service,
             ports = EXCLUDED.ports, is_protected = EXCLUDED.is_protected, updated_at = now()
           RETURNING id`,
          [
            `docker-${current.id}-${service.id}`, current.organizationId, current.id, service.id, service.name, service.status,
            current.hostname, service.image, service.cpu ?? null, service.ram ?? null,
            service.runtimeState ?? null, service.healthStatus ?? null, service.restartCount ?? 0,
            service.startedAt ?? null, service.composeProject ?? null, service.composeService ?? null,
            JSON.stringify(service.ports ?? []), service.protected ?? false,
          ],
        )
        const serviceId = stored.rows[0].id
        if (service.status === 'offline' || service.status === 'degraded') {
          const kind = service.status === 'degraded' ? 'service_unhealthy' : 'service_offline'
          const title = service.status === 'degraded' ? 'Docker healthcheck is failing' : 'Docker service is offline'
          await client.query(
            `INSERT INTO alert_events (organization_id, agent_id, service_id, kind, title, details)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT (service_id, kind) WHERE status = 'open' AND service_id IS NOT NULL DO NOTHING`,
            [current.organizationId, current.id, serviceId, kind, title, JSON.stringify({ name: service.name, containerId: service.id, healthStatus: service.healthStatus })],
          )
        }
        await client.query(`UPDATE alert_events SET status = 'resolved', resolved_at = now()
          WHERE service_id = $1 AND kind = 'service_offline' AND status = 'open' AND $2 <> 'offline'`, [serviceId, service.status])
        await client.query(`UPDATE alert_events SET status = 'resolved', resolved_at = now()
          WHERE service_id = $1 AND kind = 'service_unhealthy' AND status = 'open' AND $2 <> 'degraded'`, [serviceId, service.status])
      }
      const containerIds = services.map((service) => service.id)
      await client.query(
        `UPDATE services SET status = 'offline', runtime_state = 'missing', cpu = 0, ram = 0, updated_at = now()
         WHERE agent_id = $1 AND container_id IS NOT NULL AND NOT (container_id = ANY($2::text[]))`,
        [current.id, containerIds],
      )
      await client.query(
        `INSERT INTO alert_events (organization_id, agent_id, service_id, kind, title, details)
         SELECT organization_id, agent_id, id, 'service_offline', 'Docker service disappeared from inventory', jsonb_build_object('name', name, 'containerId', container_id)
         FROM services WHERE agent_id = $1 AND runtime_state = 'missing'
         ON CONFLICT (service_id, kind) WHERE status = 'open' AND service_id IS NOT NULL DO NOTHING`,
        [current.id],
      )
      await client.query('UPDATE agents SET last_seen_at = now() WHERE id = $1', [current.id])
    })
    publishSnapshotChanged(current.organizationId)
    res.status(204).end()
  })

  app.post('/agent/v1/commands/next', async (req, res) => {
    const value = req.header('authorization')
    if (!value?.startsWith('Agent ')) return res.status(401).json({ error: 'agent_authentication_required' })
    const command = await inTransaction(pool, async (client) => {
      const agent = await client.query<{ id: string }>('SELECT id FROM agents WHERE token_hash = $1 AND revoked_at IS NULL FOR UPDATE', [tokenHash(value.slice(6))])
      if (!agent.rowCount) return 'invalid' as const
      await client.query(`UPDATE commands SET status = 'expired', completed_at = now(), result = $2::jsonb
        WHERE agent_id = $1 AND status = 'queued' AND expires_at <= now()`, [agent.rows[0].id, JSON.stringify({ message: 'Command expired before the agent claimed it.' })])
      await client.query(`UPDATE commands SET status = 'expired', completed_at = now(), result = $2::jsonb
        WHERE agent_id = $1 AND status = 'running' AND lease_expires_at <= now()`, [agent.rows[0].id, JSON.stringify({ message: 'Agent lease expired before the command completed.' })])
      const next = await client.query<{ id: string; action: string; containerId: string }>(
        `SELECT c.id, c.action, s.container_id AS "containerId" FROM commands c
         JOIN services s ON s.id = c.service_id
         WHERE c.agent_id = $1 AND c.status = 'queued' AND c.expires_at > now() AND s.container_id IS NOT NULL
         ORDER BY c.created_at FOR UPDATE SKIP LOCKED LIMIT 1`, [agent.rows[0].id])
      if (!next.rowCount) return null
      await client.query(`UPDATE commands SET status = 'running', claimed_at = now(), started_at = now(), lease_expires_at = now() + interval '2 minutes' WHERE id = $1`, [next.rows[0].id])
      return next.rows[0]
    })
    if (command === 'invalid') return res.status(401).json({ error: 'invalid_agent_token' })
    if (!command) return res.status(204).end()
    res.json({ command })
  })

  app.post('/agent/v1/commands/:commandId/result', async (req, res) => {
    const { ok, message, observedState, healthStatus } = commandResultSchema.parse(req.body)
    const value = req.header('authorization')
    if (!value?.startsWith('Agent ')) return res.status(401).json({ error: 'agent_authentication_required' })
    const updated = await pool.query<{ organizationId: string; agentId: string; id: string }>(
      `UPDATE commands c SET status = $1, completed_at = now(), result = $2::jsonb
       FROM agents a WHERE c.id = $3 AND c.agent_id = a.id AND a.token_hash = $4 AND a.revoked_at IS NULL AND c.status = 'running'
       RETURNING c.organization_id AS "organizationId", c.agent_id AS "agentId", c.id`,
      [ok ? 'succeeded' : 'failed', JSON.stringify({ message: message ?? '', observedState, healthStatus }), req.params.commandId, tokenHash(value.slice(6))],
    )
    if (!updated.rowCount) return res.status(404).json({ error: 'command_not_found' })
    if (!ok) await pool.query(
      `INSERT INTO alert_events (organization_id, agent_id, command_id, kind, title, details)
       VALUES ($1, $2, $3, 'command_failed', 'Docker command failed', $4::jsonb)
       ON CONFLICT (command_id) WHERE command_id IS NOT NULL DO NOTHING`,
      [updated.rows[0].organizationId, updated.rows[0].agentId, updated.rows[0].id, JSON.stringify({ message: message ?? '' })],
    )
    publishSnapshotChanged(updated.rows[0].organizationId)
    res.status(204).end()
  })

  app.post('/agent/v1/logs', async (req, res) => {
    const { entries } = logBatchSchema.parse(req.body)
    const value = req.header('authorization')
    if (!value?.startsWith('Agent ')) return res.status(401).json({ error: 'agent_authentication_required' })
    const agent = await pool.query<{ id: string; organizationId: string }>('SELECT id, organization_id AS "organizationId" FROM agents WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash(value.slice(6))])
    if (!agent.rowCount) return res.status(401).json({ error: 'invalid_agent_token' })
    await inTransaction(pool, async (client) => {
      for (const entry of entries) {
        const service = await client.query<{ id: string }>('SELECT id FROM services WHERE agent_id = $1 AND container_id = $2', [agent.rows[0].id, entry.containerId])
        if (service.rowCount) await client.query(
          `INSERT INTO service_logs (organization_id, service_id, agent_id, occurred_at, level, text)
           VALUES ($1, $2, $3, COALESCE($4, now()), $5, $6) ON CONFLICT DO NOTHING`,
          [agent.rows[0].organizationId, service.rows[0].id, agent.rows[0].id, entry.ts ?? null, entry.level, entry.text],
        )
      }
    })
    res.status(204).end()
  })

  app.get('/api/v1/services', requireAuth(config), async (_req: AuthenticatedRequest, res) => {
    const user = _req.user!
    const data = await snapshot(pool, user.organizationId)
    res.json(data)
  })

  app.get('/api/v1/metrics/host', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const { range } = metricRangeSchema.parse(req.query)
    const rangeInterval = { '15m': '15 minutes', '1h': '1 hour', '6h': '6 hours', '24h': '24 hours', '7d': '7 days', '30d': '30 days' }[range]
    const metrics = await pool.query(
      `SELECT recorded_at AS ts, cpu, ram, disk
       FROM host_metric_samples
       WHERE organization_id = $1 AND recorded_at >= now() - $2::interval
       ORDER BY recorded_at DESC LIMIT 2000`,
      [req.user!.organizationId, rangeInterval],
    )
    res.json({ metrics: metrics.rows.reverse() })
  })

  app.get('/api/v1/services/:serviceId/logs', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const logs = await pool.query(`SELECT occurred_at AS ts, level, text FROM service_logs WHERE organization_id = $1 AND service_id = $2 ORDER BY occurred_at DESC LIMIT 200`, [req.user!.organizationId, req.params.serviceId])
    res.json({ logs: logs.rows })
  })

  app.get('/api/v1/logs', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const { limit, serviceId } = logListQuerySchema.parse(req.query)
    const values: unknown[] = [req.user!.organizationId]
    let serviceFilter = ''
    if (serviceId) {
      values.push(serviceId)
      serviceFilter = 'AND l.service_id = $2'
    }
    values.push(limit)
    const logs = await pool.query(
      `SELECT l.occurred_at AS ts, l.level, l.text, l.service_id AS "serviceId", s.name AS "serviceName"
       FROM service_logs l JOIN services s ON s.id = l.service_id AND s.organization_id = l.organization_id
       WHERE l.organization_id = $1 ${serviceFilter}
       ORDER BY l.occurred_at DESC LIMIT $${values.length}`,
      values,
    )
    res.json({ logs: logs.rows.reverse() })
  })

  app.get('/api/v1/alerts', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const alerts = await pool.query(`SELECT id, service_id AS "serviceId", kind, status, title, details, opened_at AS "openedAt", resolved_at AS "resolvedAt" FROM alert_events WHERE organization_id = $1 ORDER BY opened_at DESC LIMIT 100`, [req.user!.organizationId])
    res.json({ alerts: alerts.rows })
  })

  app.get('/api/v1/commands', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const { limit } = commandListQuerySchema.parse(req.query)
    const commands = await pool.query(
      `SELECT c.id, c.service_id AS "serviceId", s.name AS "serviceName", c.action, c.status,
              c.created_at AS "createdAt", c.claimed_at AS "claimedAt", c.started_at AS "startedAt",
              c.completed_at AS "completedAt", c.expires_at AS "expiresAt", c.result
       FROM commands c JOIN services s ON s.id = c.service_id AND s.organization_id = c.organization_id
       WHERE c.organization_id = $1 ORDER BY c.created_at DESC LIMIT $2`,
      [req.user!.organizationId, limit],
    )
    res.json({ commands: commands.rows })
  })

  app.get('/api/v1/events', requireEventAuth, async (_req: AuthenticatedRequest, res) => {
    const user = _req.user!
    res.status(200)
    res.set({
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()

    const sendSnapshot = async () => writeEvent(res, 'snapshot', await snapshot(pool, user.organizationId))
    const onChange = () => void sendSnapshot().catch(() => res.end())
    const heartbeat = setInterval(() => writeEvent(res, 'heartbeat', { at: Date.now() }), 25_000)
    const unsubscribe = subscribeSnapshotChanged(user.organizationId, onChange)
    await sendSnapshot()

    res.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  app.post(
    '/api/v1/services/:serviceId/commands',
    requireAuth(config),
    requireRole('owner', 'admin', 'operator'),
    async (req: AuthenticatedRequest, res) => {
      const user = req.user!
      const { action } = commandSchema.parse(req.body)
      const idempotencyKey = req.header('idempotency-key')
      if (idempotencyKey && !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ error: 'invalid_idempotency_key' })
      const command = await inTransaction(pool, async (client) => {
        const service = await client.query<{ id: string; agentId: string | null; agentOnline: boolean; protected: boolean }>(
          `SELECT s.id, s.agent_id AS "agentId", s.is_protected AS protected,
                  (a.revoked_at IS NULL AND a.last_seen_at >= now() - interval '60 seconds') AS "agentOnline"
           FROM services s LEFT JOIN agents a ON a.id = s.agent_id
           WHERE s.id = $1 AND s.organization_id = $2 FOR UPDATE OF s`,
          [req.params.serviceId, user.organizationId],
        )
        if (!service.rowCount) return null
        if (!service.rows[0].agentId) return 'unmanaged' as const
        if (!service.rows[0].agentOnline) return 'agent_offline' as const
        if (service.rows[0].protected) return 'protected' as const

        const created = await client.query(
          `INSERT INTO commands (organization_id, agent_id, service_id, action, requested_by, expires_at, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes', $6)
           ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
           RETURNING id, service_id AS "serviceId", action, status, created_at AS "createdAt", expires_at AS "expiresAt"`,
          [user.organizationId, service.rows[0].agentId, req.params.serviceId, action, user.id, idempotencyKey ?? null],
        )
        if (!created.rowCount && idempotencyKey) {
          const existing = await client.query(
            `SELECT id, service_id AS "serviceId", action, status, created_at AS "createdAt", expires_at AS "expiresAt"
             FROM commands WHERE organization_id = $1 AND idempotency_key = $2`,
            [user.organizationId, idempotencyKey],
          )
          return existing.rows[0]
        }
        await client.query(
          `INSERT INTO audit_logs (organization_id, actor_id, action, target, result, metadata)
           VALUES ($1, $2, $3, $4, 'ok', $5::jsonb)`,
          [user.organizationId, user.id, `service.${action}.requested`, req.params.serviceId, JSON.stringify({ commandId: created.rows[0].id })],
        )
        return created.rows[0]
      })

      if (!command) {
        res.status(404).json({ error: 'service_not_found' })
        return
      }
      if (command === 'unmanaged') return res.status(409).json({ error: 'service_not_managed' })
      if (command === 'agent_offline') return res.status(409).json({ error: 'agent_offline', message: 'This service agent is offline. Reconnect it from the Agents page, then try again.' })
      if (command === 'protected') return res.status(409).json({ error: 'service_protected', message: 'NodeDeck control-plane containers are protected from self-management.' })
      publishSnapshotChanged(user.organizationId)
      res.status(202).json({ command })
    },
  )

  app.post(
    '/api/v1/incidents/:incidentId/resolve',
    requireAuth(config),
    requireRole('owner', 'admin', 'operator'),
    async (req: AuthenticatedRequest, res) => {
      const user = req.user!
      const outcome = await inTransaction(pool, async (client) => {
        const incident = await client.query<{ id: string; serviceStatus: string; resolvedAt: string | null }>(
          `SELECT i.id, i.resolved_at AS "resolvedAt", s.status AS "serviceStatus"
           FROM incidents i JOIN services s ON s.id = i.service_id
           WHERE i.id = $1 AND i.organization_id = $2 AND s.organization_id = $2 FOR UPDATE`,
          [req.params.incidentId, user.organizationId],
        )
        const current = incident.rows[0]
        if (!current) return 'missing' as const
        if (current.resolvedAt) return 'already_resolved' as const
        if (current.serviceStatus !== 'healthy') return 'service_unhealthy' as const

        await client.query('UPDATE incidents SET resolved_at = now(), resolved_by = $2 WHERE id = $1', [current.id, user.id])
        await client.query(
          `INSERT INTO audit_logs (organization_id, actor_id, action, target, result)
           VALUES ($1, $2, 'incident.resolve', $3, 'ok')`,
          [user.organizationId, user.id, current.id],
        )
        return 'resolved' as const
      })

      if (outcome === 'missing') {
        res.status(404).json({ error: 'incident_not_found' })
        return
      }
      if (outcome === 'already_resolved') {
        res.status(409).json({ error: 'incident_already_resolved' })
        return
      }
      if (outcome === 'service_unhealthy') {
        res.status(409).json({ error: 'service_not_healthy' })
        return
      }
      publishSnapshotChanged(user.organizationId)
      res.status(204).end()
    },
  )

  app.use(errorHandler)
  return app
}
