import cors from 'cors'
import { createHash, randomBytes } from 'node:crypto'
import express, { type Request, type Response } from 'express'
import type { Pool } from 'pg'
import { z } from 'zod'
import { createRefreshToken, hashRefreshToken, signAccessToken, verifyAccessToken, verifyPasswordOrDummy, type Role } from './auth.js'
import type { Config } from './config.js'
import { inTransaction } from './db/pool.js'
import { publishSnapshotChanged, subscribeSnapshotChanged } from './events.js'
import { errorHandler, requireAuth, requireRole, type AuthenticatedRequest } from './http.js'
import { deliverPendingNotifications } from './maintenance.js'
import { sendNotification, validateWebhookUrl, type NotificationChannelConfig } from './notifications.js'
import { registerOwner, RegistrationConflictError, registrationSchema } from './registration.js'
import { openSecret, sealSecret } from './secrets.js'
import { agentCredentialKey, clientAddress, rateLimit, securityHeaders } from './security.js'

const loginSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128) }).strict()
const commandSchema = z.object({ action: z.enum(['start', 'restart', 'stop']) }).strict()
const servicePolicySchema = z.object({
  displayName: z.string().trim().min(1).max(80).nullable(),
  controlEnabled: z.boolean(),
  autoRecovery: z.boolean(),
  recoveryDelaySec: z.coerce.number().int().min(60).max(900),
  cpuAlertThreshold: z.coerce.number().int().min(50).max(100),
  ramAlertThreshold: z.coerce.number().int().min(50).max(100),
}).strict().refine((value) => !value.autoRecovery || value.controlEnabled, { message: 'Auto recovery requires remote control to be enabled.', path: ['autoRecovery'] })
const enrollmentSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict()
const agentEnrollmentSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/), hostname: z.string().trim().min(1).max(255) }).strict()
const heartbeatSchema = z.object({
  host: z.object({
    cpu: z.coerce.number().min(0).max(100),
    ram: z.coerce.number().min(0).max(100),
    disk: z.coerce.number().min(0).max(100),
    uptimeSec: z.coerce.number().int().min(0),
  }).strict().optional(),
}).strict()
const inventorySchema = z.object({
  services: z.array(z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(255),
    kind: z.enum(['docker', 'systemd', 'launchd', 'pm2']).default('docker'),
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
  }).strict()).max(500),
}).strict()
const commandResultSchema = z.object({
  ok: z.boolean(),
  message: z.string().max(2000).optional(),
  observedState: z.string().max(32).optional(),
  healthStatus: z.string().max(32).optional(),
}).strict()
const logBatchSchema = z.object({ entries: z.array(z.object({ containerId: z.string().min(1).max(128), ts: z.string().datetime().optional(), level: z.enum(['info', 'warn', 'error', 'debug']).default('info'), text: z.string().min(1).max(4000) }).strict()).max(500) }).strict()
const commandListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
const logListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100), serviceId: z.string().min(1).optional() })
const metricRangeSchema = z.object({ range: z.enum(['15m', '1h', '6h', '24h', '7d', '30d']).default('1h') })
const notificationChannelSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('telegram'),
    name: z.string().trim().min(1).max(80),
    botToken: z.string().trim().min(20).max(255),
    chatId: z.string().trim().min(1).max(100),
  }).strict(),
  z.object({
    kind: z.literal('webhook'),
    name: z.string().trim().min(1).max(80),
    url: z.string().url().max(2000),
  }).strict(),
])
const uuidSchema = z.string().uuid()
const serviceIdSchema = z.string().min(1).max(128)

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function readAgentToken(req: Request) {
  const value = req.header('authorization')
  if (!value?.startsWith('Agent ')) return null
  const token = value.slice(6)
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null
}

function readCookie(header: string | undefined, name: string) {
  const encoded = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
  if (!encoded) return undefined
  try {
    return decodeURIComponent(encoded)
  } catch {
    return undefined
  }
}

function refreshCookieName(config: Config) {
  return config.COOKIE_SECURE ? '__Host-nodedeck_refresh' : 'nodedeck_refresh'
}

function refreshCookie(req: Request, config: Config) {
  return readCookie(req.header('cookie'), refreshCookieName(config)) ?? readCookie(req.header('cookie'), 'server_os_refresh')
}

function setRefreshCookie(res: Response, token: string, config: Config) {
  res.cookie(refreshCookieName(config), token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.COOKIE_SECURE,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: config.COOKIE_SECURE ? '/' : '/api/v1',
  })
}

function clearRefreshCookies(res: Response, config: Config) {
  res.clearCookie(refreshCookieName(config), {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.COOKIE_SECURE,
    path: config.COOKIE_SECURE ? '/' : '/api/v1',
  })
  res.clearCookie('server_os_refresh', { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/api/v1' })
  res.clearCookie('server_os_refresh', { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/api/v1/auth' })
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
  controlEnabled: boolean
  autoRecovery: boolean
  desiredState: string
  updatedAt: string
}

async function snapshot(pool: Pool, organizationId: string) {
  const [services, incidents, agent] = await Promise.all([
    pool.query<ServiceRow>(
      `SELECT s.id, COALESCE(p.display_name, s.name) AS name, s.kind, s.status, s.hostname, s.version, s.cpu, s.ram,
              s.container_id AS "containerId", s.runtime_state AS "runtimeState", s.health_status AS "healthStatus",
              s.restart_count AS "restartCount",
              CASE WHEN s.started_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - s.started_at)))::bigint END AS "uptimeSec",
              s.compose_project AS "composeProject", s.compose_service AS "composeService", s.ports,
              s.is_protected AS "protected",
              COALESCE(p.control_enabled, true) AS "controlEnabled",
              COALESCE(p.auto_recovery, false) AS "autoRecovery",
              s.desired_state AS "desiredState",
              (s.container_id IS NOT NULL AND (
                s.kind = 'docker'
                OR (s.kind = 'systemd' AND s.container_id LIKE 'systemd-user:%')
                OR (s.kind = 'pm2' AND s.container_id LIKE 'pm2:%')
              )) AS managed,
              s.updated_at AS "updatedAt"
       FROM services s JOIN agents a ON a.id = s.agent_id
       LEFT JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
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
  app.disable('etag')
  app.use(securityHeaders)
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] }))
  app.use((req: AuthenticatedRequest, res: Response, next: (error?: unknown) => void) => {
    const supplied = req.header('x-request-id')
    req.requestId = supplied && /^[A-Za-z0-9_-]{8,128}$/.test(supplied) ? supplied : randomBytes(12).toString('hex')
    res.setHeader('X-Request-ID', req.requestId)
    next()
  })
  app.use(express.json({ limit: '256kb', strict: true }))
  app.use('/api/v1/auth', rateLimit(pool, {
    scope: 'auth.ip', limit: 120, windowSeconds: 15 * 60, key: clientAddress,
  }))
  app.use('/agent/v1', rateLimit(pool, {
    scope: 'agent.ip', limit: 180, windowSeconds: 60, key: clientAddress,
  }))

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
    const refreshToken = refreshCookie(req, config)
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

  app.get('/healthz', rateLimit(pool, {
    scope: 'health.ip', limit: 60, windowSeconds: 60, key: clientAddress,
  }), async (_req, res) => {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  })

  app.post('/api/v1/auth/login', rateLimit(pool, {
    scope: 'auth.login', limit: 12, windowSeconds: 15 * 60,
    key: (req) => `${clientAddress(req)}:${typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'invalid'}`,
  }), async (req, res) => {
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
    const passwordValid = await verifyPasswordOrDummy(password, user?.passwordHash)
    if (!user || !passwordValid) {
      res.status(401).json({ error: 'invalid_credentials' })
      return
    }
    const refreshToken = createRefreshToken()
    await pool.query(`INSERT INTO refresh_sessions (user_id, organization_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '30 days')`, [user.id, user.organizationId, hashRefreshToken(refreshToken)])
    setRefreshCookie(res, refreshToken, config)
    res.json({
      accessToken: signAccessToken(user, config),
      user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    })
  })

  app.post('/api/v1/auth/register', rateLimit(pool, {
    scope: 'auth.register', limit: 5, windowSeconds: 60 * 60, key: clientAddress,
  }), async (req, res) => {
    const input = registrationSchema.parse(req.body)
    try {
      const { user, refreshToken } = await registerOwner(pool, input)
      setRefreshCookie(res, refreshToken, config)
      res.status(201).json({ accessToken: signAccessToken(user, config), user })
    } catch (error) {
      if (error instanceof RegistrationConflictError) {
        res.status(409).json({ error: error.code })
        return
      }
      throw error
    }
  })

  app.post('/api/v1/auth/local-session', rateLimit(pool, {
    scope: 'auth.local_session', limit: 20, windowSeconds: 15 * 60, key: clientAddress,
  }), async (_req, res) => {
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
    setRefreshCookie(res, refreshToken, config)
    res.json({ accessToken: signAccessToken(user, config), user })
  })

  app.post('/api/v1/auth/refresh', rateLimit(pool, {
    scope: 'auth.refresh', limit: 60, windowSeconds: 15 * 60, key: clientAddress,
  }), async (req, res) => {
    const token = refreshCookie(req, config)
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
    setRefreshCookie(res, session.replacement, config)
    res.json({ accessToken: signAccessToken(session.user, config), user: session.user })
  })

  app.post('/api/v1/auth/logout', async (req, res) => {
    const token = refreshCookie(req, config)
    if (token) await pool.query('UPDATE refresh_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashRefreshToken(token)])
    clearRefreshCookies(res, config)
    res.status(204).end()
  })

  app.get('/api/v1/me', requireAuth(config), (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user })
  })

  app.post('/api/v1/agent-enrollments', requireAuth(config), requireRole('owner', 'admin'), rateLimit(pool, {
    scope: 'ui.agent_enrollment', limit: 10, windowSeconds: 60 * 60, key: (req: AuthenticatedRequest) => req.user!.id,
  }), async (req: AuthenticatedRequest, res) => {
    const user = req.user!
    const { name } = enrollmentSchema.parse(req.body)
    const token = randomBytes(32).toString('base64url')
    const result = await pool.query<{ id: string; expiresAt: string }>(
      `INSERT INTO agent_enrollments (organization_id, token_hash, agent_name, created_by, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '15 minutes')
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

  app.post('/api/v1/notification-channels', requireAuth(config), requireRole('owner', 'admin'), rateLimit(pool, {
    scope: 'ui.notification_create', limit: 10, windowSeconds: 60 * 60, key: (req: AuthenticatedRequest) => req.user!.id,
  }), async (req: AuthenticatedRequest, res) => {
    const user = req.user!
    const input = notificationChannelSchema.parse(req.body)
    const channelConfig: NotificationChannelConfig = input.kind === 'telegram'
      ? { kind: 'telegram', botToken: input.botToken, chatId: input.chatId }
      : { kind: 'webhook', url: validateWebhookUrl(input.url) }
    await sendNotification(channelConfig, {
      id: randomBytes(16).toString('hex'),
      kind: 'connection_test',
      title: 'NodeDeck notifications connected',
      details: { message: 'This test confirms that NodeDeck can reach this channel.' },
      openedAt: new Date().toISOString(),
    })
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
    res.status(201).json({ channel: channel.rows[0], testDelivered: true })
  })

  app.post('/api/v1/notification-channels/:channelId/test', requireAuth(config), requireRole('owner', 'admin'), rateLimit(pool, {
    scope: 'ui.notification_test', limit: 5, windowSeconds: 5 * 60, key: (req: AuthenticatedRequest) => req.user!.id,
  }), async (req: AuthenticatedRequest, res) => {
    const channelId = uuidSchema.parse(req.params.channelId)
    const channel = await pool.query<{ encryptedConfig: string }>(
      `SELECT config_encrypted AS "encryptedConfig" FROM notification_channels
       WHERE id = $1 AND organization_id = $2 AND enabled = true`,
      [channelId, req.user!.organizationId],
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
    const channelId = uuidSchema.parse(req.params.channelId)
    const deleted = await pool.query(
      `DELETE FROM notification_channels WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [channelId, req.user!.organizationId],
    )
    if (!deleted.rowCount) return res.status(404).json({ error: 'notification_channel_not_found' })
    await pool.query(
      `INSERT INTO audit_logs (organization_id, actor_id, action, target, result)
       VALUES ($1, $2, 'notification_channel.delete', $3, 'ok')`,
      [req.user!.organizationId, req.user!.id, channelId],
    )
    res.status(204).end()
  })

  app.delete('/api/v1/agents/:agentId', requireAuth(config), requireRole('owner', 'admin'), async (req: AuthenticatedRequest, res) => {
    const user = req.user!
    const agentId = uuidSchema.parse(req.params.agentId)
    const revoked = await inTransaction(pool, async (client) => {
      const agent = await client.query<{ id: string }>(
        `UPDATE agents SET revoked_at = now(), token_hash = $3
         WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL RETURNING id`,
        [agentId, user.organizationId, tokenHash(randomBytes(32).toString('base64url'))],
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

  app.post('/agent/v1/enroll', rateLimit(pool, {
    scope: 'agent.enroll', limit: 20, windowSeconds: 15 * 60, key: clientAddress,
  }), async (req, res) => {
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

  app.post('/agent/v1/heartbeat', rateLimit(pool, {
    scope: 'agent.heartbeat', limit: 12, windowSeconds: 60, key: agentCredentialKey,
  }), async (req, res) => {
    const { host } = heartbeatSchema.parse(req.body)
    const agentToken = readAgentToken(req)
    if (!agentToken) return res.status(401).json({ error: 'agent_authentication_required' })
    const result = await pool.query<{ id: string; organizationId: string }>(
      `UPDATE agents
       SET last_seen_at = now(), host_cpu = $1, host_ram = $2, host_disk = $3, host_uptime_sec = $4
       WHERE token_hash = $5 AND revoked_at IS NULL RETURNING id, organization_id AS "organizationId"`,
      [host?.cpu ?? null, host?.ram ?? null, host?.disk ?? null, host?.uptimeSec ?? null, tokenHash(agentToken)],
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
    await deliverPendingNotifications(pool, config)
    res.status(204).end()
  })

  app.post('/agent/v1/inventory', rateLimit(pool, {
    scope: 'agent.inventory', limit: 5, windowSeconds: 60, key: agentCredentialKey,
  }), async (req, res) => {
    const { services } = inventorySchema.parse(req.body)
    const agentToken = readAgentToken(req)
    if (!agentToken) return res.status(401).json({ error: 'agent_authentication_required' })
    const agent = await pool.query<{ id: string; organizationId: string; hostname: string }>(
      `SELECT id, organization_id AS "organizationId", hostname FROM agents WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash(agentToken)],
    )
    const current = agent.rows[0]
    if (!current) return res.status(401).json({ error: 'invalid_agent_token' })
    const openedAlerts = await inTransaction(pool, async (client) => {
      let opened = false
      for (const service of services) {
        const stored = await client.query<{ id: string }>(
          `INSERT INTO services (
             id, organization_id, agent_id, container_id, name, kind, status, hostname, version, cpu, ram,
             runtime_state, health_status, restart_count, started_at, compose_project, compose_service, ports, is_protected
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19)
           ON CONFLICT (agent_id, container_id) WHERE container_id IS NOT NULL DO UPDATE SET
             name = EXCLUDED.name, kind = EXCLUDED.kind, status = EXCLUDED.status,
             hostname = EXCLUDED.hostname, version = EXCLUDED.version, cpu = EXCLUDED.cpu, ram = EXCLUDED.ram,
             runtime_state = EXCLUDED.runtime_state, health_status = EXCLUDED.health_status,
             restart_count = EXCLUDED.restart_count, started_at = EXCLUDED.started_at,
             compose_project = EXCLUDED.compose_project, compose_service = EXCLUDED.compose_service,
             ports = EXCLUDED.ports, is_protected = EXCLUDED.is_protected, updated_at = now()
           RETURNING id`,
          [
            `resource-${current.id}-${tokenHash(service.id).slice(0, 24)}`, current.organizationId, current.id, service.id, service.name, service.kind, service.status,
            current.hostname, service.image, service.cpu ?? null, service.ram ?? null,
            service.runtimeState ?? null, service.healthStatus ?? null, service.restartCount ?? 0,
            service.startedAt ?? null, service.composeProject ?? null, service.composeService ?? null,
            JSON.stringify(service.ports ?? []), service.protected ?? false,
          ],
        )
        const serviceId = stored.rows[0].id
        if (service.status === 'offline' || service.status === 'degraded') {
          const kind = service.status === 'degraded' ? 'service_unhealthy' : 'service_offline'
          const title = service.status === 'degraded' ? `${service.name} is degraded` : `${service.name} is offline`
          const created = await client.query(
            `INSERT INTO alert_events (organization_id, agent_id, service_id, kind, title, details)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT (service_id, kind) WHERE status = 'open' AND service_id IS NOT NULL DO NOTHING`,
            [current.organizationId, current.id, serviceId, kind, title, JSON.stringify({ name: service.name, resourceKey: service.id, source: service.kind, healthStatus: service.healthStatus })],
          )
          opened ||= Boolean(created.rowCount)
        }
        await client.query(`UPDATE alert_events SET status = 'resolved', resolved_at = now()
          WHERE service_id = $1 AND kind = 'service_offline' AND status = 'open' AND $2 <> 'offline'`, [serviceId, service.status])
        await client.query(`UPDATE alert_events SET status = 'resolved', resolved_at = now()
          WHERE service_id = $1 AND kind = 'service_unhealthy' AND status = 'open' AND $2 <> 'degraded'`, [serviceId, service.status])
      }
      const resourceKeys = services.map((service) => service.id)
      const resourceAlerts = await client.query(
        `INSERT INTO alert_events (organization_id, agent_id, service_id, kind, title, details)
         SELECT s.organization_id, s.agent_id, s.id, 'service_resource_high', 'Service resource usage is high',
                jsonb_build_object('name', COALESCE(p.display_name, s.name), 'cpu', s.cpu, 'ram', s.ram,
                  'cpuThreshold', p.cpu_alert_threshold, 'ramThreshold', p.ram_alert_threshold)
         FROM services s JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
         WHERE s.agent_id = $1 AND s.container_id = ANY($2::text[])
           AND (s.cpu >= p.cpu_alert_threshold OR s.ram >= p.ram_alert_threshold)
         ON CONFLICT (service_id, kind) WHERE status = 'open' AND service_id IS NOT NULL DO NOTHING`,
        [current.id, resourceKeys],
      )
      opened ||= Boolean(resourceAlerts.rowCount)
      await client.query(
        `UPDATE alert_events a SET status = 'resolved', resolved_at = now()
         FROM services s JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
         WHERE a.service_id = s.id AND a.kind = 'service_resource_high' AND a.status = 'open'
           AND s.agent_id = $1 AND s.container_id = ANY($2::text[])
           AND s.cpu < p.cpu_alert_threshold AND s.ram < p.ram_alert_threshold`,
        [current.id, resourceKeys],
      )
      await client.query(
        `WITH eligible AS (
           SELECT s.id AS service_id, s.organization_id, s.agent_id, p.updated_by,
                  'auto_' || md5(s.id || ':' || floor(extract(epoch FROM now()) / p.recovery_delay_sec)::text) AS idempotency_key
           FROM services s
           JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
           JOIN agents a ON a.id = s.agent_id AND a.revoked_at IS NULL AND a.last_seen_at >= now() - interval '60 seconds'
           WHERE s.agent_id = $1 AND s.container_id = ANY($2::text[])
             AND s.status = 'offline' AND s.runtime_state IS DISTINCT FROM 'missing'
             AND s.desired_state = 'running' AND p.auto_recovery = true AND p.control_enabled = true
             AND s.is_protected = false
             AND (s.kind = 'docker' OR (s.kind = 'systemd' AND s.container_id LIKE 'systemd-user:%') OR (s.kind = 'pm2' AND s.container_id LIKE 'pm2:%'))
             AND NOT EXISTS (
               SELECT 1 FROM commands c WHERE c.service_id = s.id AND c.action = 'restart'
                 AND (c.status IN ('queued', 'running') OR c.created_at > now() - make_interval(secs => p.recovery_delay_sec))
             )
         ), created AS (
           INSERT INTO commands (organization_id, agent_id, service_id, action, requested_by, expires_at, idempotency_key)
           SELECT organization_id, agent_id, service_id, 'restart', updated_by, now() + interval '10 minutes', idempotency_key
           FROM eligible
           ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
           RETURNING id, organization_id, requested_by, service_id
         ), audited AS (
           INSERT INTO audit_logs (organization_id, actor_id, action, target, result, metadata)
           SELECT organization_id, requested_by, 'service.restart.auto', service_id, 'ok', jsonb_build_object('commandId', id)
           FROM created RETURNING id
         ) SELECT count(*) FROM audited`,
        [current.id, resourceKeys],
      )
      await client.query(
        `UPDATE services SET status = 'offline', runtime_state = 'missing', cpu = 0, ram = 0, updated_at = now()
         WHERE agent_id = $1 AND container_id IS NOT NULL AND NOT (container_id = ANY($2::text[]))`,
        [current.id, resourceKeys],
      )
      const disappearedAlerts = await client.query(
        `INSERT INTO alert_events (organization_id, agent_id, service_id, kind, title, details)
         SELECT organization_id, agent_id, id, 'service_offline', 'Service disappeared from inventory', jsonb_build_object('name', name, 'resourceKey', container_id, 'source', kind)
         FROM services WHERE agent_id = $1 AND runtime_state = 'missing'
           AND (compose_project IS NULL OR container_id LIKE 'docker-compose:%')
         ON CONFLICT (service_id, kind) WHERE status = 'open' AND service_id IS NOT NULL DO NOTHING`,
        [current.id],
      )
      opened ||= Boolean(disappearedAlerts.rowCount)
      await client.query('UPDATE agents SET last_seen_at = now() WHERE id = $1', [current.id])
      return opened
    })
    publishSnapshotChanged(current.organizationId)
    if (openedAlerts) await deliverPendingNotifications(pool, config)
    res.status(204).end()
  })

  app.post('/agent/v1/commands/next', rateLimit(pool, {
    scope: 'agent.command_poll', limit: 30, windowSeconds: 60, key: agentCredentialKey,
  }), async (req, res) => {
    const agentToken = readAgentToken(req)
    if (!agentToken) return res.status(401).json({ error: 'agent_authentication_required' })
    const command = await inTransaction(pool, async (client) => {
      const agent = await client.query<{ id: string }>('SELECT id FROM agents WHERE token_hash = $1 AND revoked_at IS NULL FOR UPDATE', [tokenHash(agentToken)])
      if (!agent.rowCount) return 'invalid' as const
      await client.query(`UPDATE commands SET status = 'expired', completed_at = now(), result = $2::jsonb
        WHERE agent_id = $1 AND status = 'queued' AND expires_at <= now()`, [agent.rows[0].id, JSON.stringify({ message: 'Command expired before the agent claimed it.' })])
      await client.query(`UPDATE commands SET status = 'expired', completed_at = now(), result = $2::jsonb
        WHERE agent_id = $1 AND status = 'running' AND lease_expires_at <= now()`, [agent.rows[0].id, JSON.stringify({ message: 'Agent lease expired before the command completed.' })])
      const next = await client.query<{ id: string; action: string; resourceKey: string; containerId: string; kind: string }>(
        `SELECT c.id, c.action, s.container_id AS "resourceKey", s.container_id AS "containerId", s.kind FROM commands c
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

  app.post('/agent/v1/commands/:commandId/result', rateLimit(pool, {
    scope: 'agent.command_result', limit: 30, windowSeconds: 60, key: agentCredentialKey,
  }), async (req, res) => {
    const { ok, message, observedState, healthStatus } = commandResultSchema.parse(req.body)
    const commandId = uuidSchema.parse(req.params.commandId)
    const agentToken = readAgentToken(req)
    if (!agentToken) return res.status(401).json({ error: 'agent_authentication_required' })
    const updated = await pool.query<{ organizationId: string; agentId: string; id: string }>(
      `UPDATE commands c SET status = $1, completed_at = now(), result = $2::jsonb
       FROM agents a WHERE c.id = $3 AND c.agent_id = a.id AND a.token_hash = $4 AND a.revoked_at IS NULL AND c.status = 'running'
       RETURNING c.organization_id AS "organizationId", c.agent_id AS "agentId", c.id`,
      [ok ? 'succeeded' : 'failed', JSON.stringify({ message: message ?? '', observedState, healthStatus }), commandId, tokenHash(agentToken)],
    )
    if (!updated.rowCount) return res.status(404).json({ error: 'command_not_found' })
    if (!ok) await pool.query(
      `INSERT INTO alert_events (organization_id, agent_id, command_id, kind, title, details)
       VALUES ($1, $2, $3, 'command_failed', 'Docker command failed', $4::jsonb)
       ON CONFLICT (command_id) WHERE command_id IS NOT NULL DO NOTHING`,
      [updated.rows[0].organizationId, updated.rows[0].agentId, updated.rows[0].id, JSON.stringify({ message: message ?? '' })],
    )
    publishSnapshotChanged(updated.rows[0].organizationId)
    if (!ok) await deliverPendingNotifications(pool, config)
    res.status(204).end()
  })

  app.post('/agent/v1/logs', rateLimit(pool, {
    scope: 'agent.logs', limit: 2, windowSeconds: 60, key: agentCredentialKey,
  }), rateLimit(pool, {
    scope: 'agent.logs_daily', limit: 100_000, windowSeconds: 24 * 60 * 60, key: agentCredentialKey,
    cost: (req) => Array.isArray(req.body?.entries) ? req.body.entries.length : 1,
  }), async (req, res) => {
    const { entries } = logBatchSchema.parse(req.body)
    const agentToken = readAgentToken(req)
    if (!agentToken) return res.status(401).json({ error: 'agent_authentication_required' })
    const agent = await pool.query<{ id: string; organizationId: string }>('SELECT id, organization_id AS "organizationId" FROM agents WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash(agentToken)])
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

  app.get('/api/v1/services/:serviceId/settings', requireAuth(config), async (req: AuthenticatedRequest, res) => {
    const serviceId = serviceIdSchema.parse(req.params.serviceId)
    const settings = await pool.query(
      `SELECT p.display_name AS "displayName", COALESCE(p.control_enabled, true) AS "controlEnabled",
              COALESCE(p.auto_recovery, false) AS "autoRecovery", COALESCE(p.recovery_delay_sec, 120) AS "recoveryDelaySec",
              COALESCE(p.cpu_alert_threshold, 90) AS "cpuAlertThreshold", COALESCE(p.ram_alert_threshold, 90) AS "ramAlertThreshold",
              p.updated_at AS "updatedAt", s.is_protected AS protected
       FROM services s LEFT JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
       WHERE s.id = $1 AND s.organization_id = $2`,
      [serviceId, req.user!.organizationId],
    )
    if (!settings.rowCount) return res.status(404).json({ error: 'service_not_found' })
    res.json({ settings: settings.rows[0] })
  })

  app.put(
    '/api/v1/services/:serviceId/settings',
    requireAuth(config),
    requireRole('owner', 'admin'),
    async (req: AuthenticatedRequest, res) => {
      const input = servicePolicySchema.parse(req.body)
      const user = req.user!
      const serviceId = serviceIdSchema.parse(req.params.serviceId)
      const outcome = await inTransaction(pool, async (client) => {
        const service = await client.query<{ id: string; protected: boolean; managed: boolean }>(
          `SELECT s.id, s.is_protected AS protected,
                  (s.container_id IS NOT NULL AND (
                    s.kind = 'docker'
                    OR (s.kind = 'systemd' AND s.container_id LIKE 'systemd-user:%')
                    OR (s.kind = 'pm2' AND s.container_id LIKE 'pm2:%')
                  )) AS managed
           FROM services s WHERE s.id = $1 AND s.organization_id = $2 FOR UPDATE`,
          [serviceId, user.organizationId],
        )
        const current = service.rows[0]
        if (!current) return 'missing' as const
        if (input.autoRecovery && (current.protected || !current.managed)) return 'auto_recovery_unavailable' as const

        const saved = await client.query(
          `INSERT INTO service_policies (
             service_id, organization_id, display_name, control_enabled, auto_recovery, recovery_delay_sec,
             cpu_alert_threshold, ram_alert_threshold, created_by, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
           ON CONFLICT (service_id) DO UPDATE SET
             display_name = EXCLUDED.display_name, control_enabled = EXCLUDED.control_enabled,
             auto_recovery = EXCLUDED.auto_recovery, recovery_delay_sec = EXCLUDED.recovery_delay_sec,
             cpu_alert_threshold = EXCLUDED.cpu_alert_threshold, ram_alert_threshold = EXCLUDED.ram_alert_threshold,
             updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING display_name AS "displayName", control_enabled AS "controlEnabled", auto_recovery AS "autoRecovery",
             recovery_delay_sec AS "recoveryDelaySec", cpu_alert_threshold AS "cpuAlertThreshold",
             ram_alert_threshold AS "ramAlertThreshold", updated_at AS "updatedAt"`,
          [current.id, user.organizationId, input.displayName, input.controlEnabled, input.autoRecovery, input.recoveryDelaySec, input.cpuAlertThreshold, input.ramAlertThreshold, user.id],
        )
        await client.query(
          `INSERT INTO audit_logs (organization_id, actor_id, action, target, result, metadata)
           VALUES ($1, $2, 'service.settings.update', $3, 'ok', $4::jsonb)`,
          [user.organizationId, user.id, current.id, JSON.stringify({ controlEnabled: input.controlEnabled, autoRecovery: input.autoRecovery, recoveryDelaySec: input.recoveryDelaySec, cpuAlertThreshold: input.cpuAlertThreshold, ramAlertThreshold: input.ramAlertThreshold })],
        )
        return { ...saved.rows[0], protected: current.protected }
      })

      if (outcome === 'missing') return res.status(404).json({ error: 'service_not_found' })
      if (outcome === 'auto_recovery_unavailable') return res.status(409).json({ error: 'auto_recovery_unavailable', message: 'Auto recovery is unavailable for protected or monitoring-only services.' })
      publishSnapshotChanged(user.organizationId)
      res.json({ settings: outcome })
    },
  )

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
    const serviceId = serviceIdSchema.parse(req.params.serviceId)
    const logs = await pool.query(`SELECT occurred_at AS ts, level, text FROM service_logs WHERE organization_id = $1 AND service_id = $2 ORDER BY occurred_at DESC LIMIT 200`, [req.user!.organizationId, serviceId])
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
      `SELECT c.id, c.service_id AS "serviceId", COALESCE(p.display_name, s.name) AS "serviceName", c.action, c.status,
              c.created_at AS "createdAt", c.claimed_at AS "claimedAt", c.started_at AS "startedAt",
              c.completed_at AS "completedAt", c.expires_at AS "expiresAt", c.result
       FROM commands c JOIN services s ON s.id = c.service_id AND s.organization_id = c.organization_id
       LEFT JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
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
    rateLimit(pool, {
      scope: 'ui.service_command', limit: 30, windowSeconds: 60,
      key: (req) => (req as AuthenticatedRequest).user!.id,
    }),
    async (req: AuthenticatedRequest, res) => {
      const user = req.user!
      const { action } = commandSchema.parse(req.body)
      const serviceId = serviceIdSchema.parse(req.params.serviceId)
      const idempotencyKey = req.header('idempotency-key')
      if (idempotencyKey && !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ error: 'invalid_idempotency_key' })
      const command = await inTransaction(pool, async (client) => {
        const service = await client.query<{ id: string; agentId: string | null; agentOnline: boolean; protected: boolean; managed: boolean; controlEnabled: boolean }>(
          `SELECT s.id, s.agent_id AS "agentId", s.is_protected AS protected,
                  (s.container_id IS NOT NULL AND (
                    s.kind = 'docker'
                    OR (s.kind = 'systemd' AND s.container_id LIKE 'systemd-user:%')
                    OR (s.kind = 'pm2' AND s.container_id LIKE 'pm2:%')
                  )) AS managed,
                  COALESCE(p.control_enabled, true) AS "controlEnabled",
                  (a.revoked_at IS NULL AND a.last_seen_at >= now() - interval '60 seconds') AS "agentOnline"
           FROM services s LEFT JOIN agents a ON a.id = s.agent_id
           LEFT JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
           WHERE s.id = $1 AND s.organization_id = $2 FOR UPDATE OF s`,
          [serviceId, user.organizationId],
        )
        if (!service.rowCount) return null
        if (!service.rows[0].agentId) return 'unmanaged' as const
        if (!service.rows[0].managed) return 'unmanaged' as const
        if (!service.rows[0].controlEnabled) return 'control_disabled' as const
        if (!service.rows[0].agentOnline) return 'agent_offline' as const
        if (service.rows[0].protected) return 'protected' as const

        const created = await client.query(
          `INSERT INTO commands (organization_id, agent_id, service_id, action, requested_by, expires_at, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes', $6)
           ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
           RETURNING id, service_id AS "serviceId", action, status, created_at AS "createdAt", expires_at AS "expiresAt"`,
          [user.organizationId, service.rows[0].agentId, serviceId, action, user.id, idempotencyKey ?? null],
        )
        if (!created.rowCount && idempotencyKey) {
          const existing = await client.query(
            `SELECT id, service_id AS "serviceId", action, status, created_at AS "createdAt", expires_at AS "expiresAt"
             FROM commands WHERE organization_id = $1 AND idempotency_key = $2`,
            [user.organizationId, idempotencyKey],
          )
          await client.query(`UPDATE services SET desired_state = $2 WHERE id = $1 AND organization_id = $3`, [serviceId, action === 'stop' ? 'stopped' : 'running', user.organizationId])
          return existing.rows[0]
        }
        await client.query(`UPDATE services SET desired_state = $2 WHERE id = $1 AND organization_id = $3`, [serviceId, action === 'stop' ? 'stopped' : 'running', user.organizationId])
        await client.query(
          `INSERT INTO audit_logs (organization_id, actor_id, action, target, result, metadata)
           VALUES ($1, $2, $3, $4, 'ok', $5::jsonb)`,
          [user.organizationId, user.id, `service.${action}.requested`, serviceId, JSON.stringify({ commandId: created.rows[0].id })],
        )
        return created.rows[0]
      })

      if (!command) {
        res.status(404).json({ error: 'service_not_found' })
        return
      }
      if (command === 'unmanaged') return res.status(409).json({ error: 'service_not_managed' })
      if (command === 'control_disabled') return res.status(409).json({ error: 'service_control_disabled', message: 'Remote control is disabled in this service settings.' })
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
      const incidentId = uuidSchema.parse(req.params.incidentId)
      const outcome = await inTransaction(pool, async (client) => {
        const incident = await client.query<{ id: string; serviceStatus: string; resolvedAt: string | null }>(
          `SELECT i.id, i.resolved_at AS "resolvedAt", s.status AS "serviceStatus"
           FROM incidents i JOIN services s ON s.id = i.service_id
           WHERE i.id = $1 AND i.organization_id = $2 AND s.organization_id = $2 FOR UPDATE`,
          [incidentId, user.organizationId],
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

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))
  app.use(errorHandler)
  return app
}
