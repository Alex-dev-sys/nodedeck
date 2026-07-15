import type {
  AppNotification,
  AuditEntry,
  Deployment,
  HostVitals,
  Incident,
  InfraSnapshot,
  InfraSummary,
  LogLine,
  Service,
  ServiceAction,
  ServiceStatus,
  User,
} from '@/types'
import { clamp, seeded } from '@/lib/utils'

// ── Static definitions ───────────────────────────────────
// dependsOn = upstream services this one needs to be healthy.

interface Seed {
  id: string
  name: string
  kind: Service['kind']
  version: string
  hostname: string
  ip: string
  container: string
  status: ServiceStatus
  cpu: number
  ram: number
  ramMb: number
  disk: number
  dependsOn: string[]
}

const SEEDS: Seed[] = [
  { id: 'nginx', name: 'Nginx', kind: 'nginx', version: '1.27.3', hostname: 'edge-01', ip: '10.0.0.2', container: 'nginx-edge', status: 'healthy', cpu: 4, ram: 12, ramMb: 96, disk: 8, dependsOn: [] },
  { id: 'docker', name: 'Docker', kind: 'docker', version: '27.3.1', hostname: 'core-01', ip: '10.0.0.3', container: '—', status: 'healthy', cpu: 9, ram: 22, ramMb: 512, disk: 41, dependsOn: [] },
  { id: 'postgres', name: 'PostgreSQL', kind: 'postgres', version: '17.2', hostname: 'db-01', ip: '10.0.0.4', container: 'pg-main', status: 'healthy', cpu: 17, ram: 44, ramMb: 2048, disk: 63, dependsOn: ['docker'] },
  { id: 'redis', name: 'Redis', kind: 'redis', version: '7.4.1', hostname: 'db-01', ip: '10.0.0.5', container: 'redis-cache', status: 'healthy', cpu: 6, ram: 18, ramMb: 384, disk: 4, dependsOn: ['docker'] },
  { id: 'api', name: 'REST API', kind: 'api', version: '2.8.0', hostname: 'app-01', ip: '10.0.0.6', container: 'api-node', status: 'healthy', cpu: 23, ram: 38, ramMb: 768, disk: 12, dependsOn: ['nginx', 'postgres', 'redis', 'queue'] },
  { id: 'website', name: 'Website', kind: 'website', version: '4.1.2', hostname: 'app-01', ip: '10.0.0.7', container: 'web-next', status: 'healthy', cpu: 11, ram: 26, ramMb: 512, disk: 9, dependsOn: ['nginx', 'api'] },
  { id: 'minecraft', name: 'Minecraft', kind: 'minecraft', version: 'Paper 1.21.4', hostname: 'game-01', ip: '10.0.0.8', container: 'mc-paper', status: 'healthy', cpu: 48, ram: 71, ramMb: 6144, disk: 58, dependsOn: ['docker'] },
  { id: 'openclaw', name: 'OpenClaw', kind: 'openclaw', version: '0.9.3', hostname: 'game-01', ip: '10.0.0.9', container: 'openclaw', status: 'healthy', cpu: 14, ram: 29, ramMb: 640, disk: 7, dependsOn: ['api'] },
  { id: 'backup', name: 'Backup Server', kind: 'backup', version: 'restic 0.17', hostname: 'stor-01', ip: '10.0.0.10', container: 'restic', status: 'healthy', cpu: 3, ram: 9, ramMb: 256, disk: 77, dependsOn: ['postgres', 'storage'] },
  { id: 'monitoring', name: 'Monitoring', kind: 'monitoring', version: 'Prom 3.0', hostname: 'obs-01', ip: '10.0.0.11', container: 'prometheus', status: 'healthy', cpu: 12, ram: 31, ramMb: 896, disk: 34, dependsOn: [] },
  { id: 'vpn', name: 'VPN Gateway', kind: 'vpn', version: 'WireGuard 1.0', hostname: 'edge-01', ip: '10.0.0.12', container: 'wg-gateway', status: 'healthy', cpu: 5, ram: 14, ramMb: 192, disk: 6, dependsOn: ['docker'] },
  { id: 'storage', name: 'Object Storage', kind: 'storage', version: 'MinIO RELEASE.2025', hostname: 'stor-01', ip: '10.0.0.13', container: 'minio', status: 'healthy', cpu: 10, ram: 36, ramMb: 1024, disk: 68, dependsOn: ['docker'] },
  { id: 'queue', name: 'Message Queue', kind: 'queue', version: 'NATS 2.10', hostname: 'app-01', ip: '10.0.0.14', container: 'nats', status: 'healthy', cpu: 8, ram: 19, ramMb: 384, disk: 11, dependsOn: ['docker'] },
  { id: 'ci', name: 'CI/CD Runner', kind: 'ci', version: 'Runner 17.8', hostname: 'core-01', ip: '10.0.0.15', container: 'ci-runner', status: 'healthy', cpu: 18, ram: 42, ramMb: 1536, disk: 32, dependsOn: ['docker', 'storage'] },
]

const USER = 'danil'

// ── Deployment history seed ──────────────────────────────
// Newest deploy per service matches that service's current `version`, so the
// history reconciles with the live service list. agoSec drives startedAt.
interface DeploySeed {
  serviceId: string
  version: string
  previousVersion: string
  status: Deployment['status']
  env: Deployment['env']
  branch: string
  message: string
  commit: string
  agoSec: number
  durationSec: number
}

const H = 3600
const DEPLOY_SEEDS: DeploySeed[] = [
  { serviceId: 'website', version: '4.2.0-rc.1', previousVersion: '4.1.2', status: 'in_progress', env: 'staging', branch: 'feat/new-dash', message: 'Preview: new analytics dashboard', commit: 'wf42rc1', agoSec: 300, durationSec: 0 },
  { serviceId: 'website', version: '4.1.2', previousVersion: '4.1.1', status: 'success', env: 'production', branch: 'main', message: 'Fix hero CTA + OG images', commit: 'a1b2c3d', agoSec: 1.5 * H, durationSec: 34 },
  { serviceId: 'api', version: '2.8.0', previousVersion: '2.7.4', status: 'success', env: 'production', branch: 'main', message: 'Add /v1/rollback endpoint + rate limiter', commit: 'e4f5a6b', agoSec: 3 * H, durationSec: 82 },
  { serviceId: 'minecraft', version: 'Paper 1.21.4', previousVersion: 'Paper 1.21.3', status: 'success', env: 'production', branch: 'release', message: 'Upgrade Paper build 1.21.4-58', commit: 'mc1d4e5', agoSec: 26 * H, durationSec: 145 },
  { serviceId: 'openclaw', version: '0.9.3', previousVersion: '0.9.2', status: 'success', env: 'production', branch: 'main', message: 'Session sync worker pool retune', commit: 'oc93a1b', agoSec: 30 * H, durationSec: 51 },
  { serviceId: 'website', version: '4.1.1', previousVersion: '4.1.0', status: 'success', env: 'production', branch: 'main', message: 'Perf: defer non-critical JS', commit: '7788aa1', agoSec: 48 * H, durationSec: 29 },
  { serviceId: 'api', version: '2.7.4', previousVersion: '2.7.3', status: 'failed', env: 'production', branch: 'main', message: 'Migrate to node 22 — healthcheck flapped', commit: 'deadbee', agoSec: 52 * H, durationSec: 61 },
  { serviceId: 'redis', version: '7.4.1', previousVersion: '7.4.0', status: 'success', env: 'production', branch: 'main', message: 'Bump redis 7.4.1 security patch', commit: 'rd7411c', agoSec: 72 * H, durationSec: 22 },
  { serviceId: 'postgres', version: '17.2', previousVersion: '17.1', status: 'success', env: 'production', branch: 'main', message: 'PostgreSQL 17.2 minor upgrade', commit: 'pg172aa', agoSec: 96 * H, durationSec: 210 },
  { serviceId: 'nginx', version: '1.27.3', previousVersion: '1.27.2', status: 'success', env: 'production', branch: 'main', message: 'nginx 1.27.3 + tighten TLS ciphers', commit: 'ng1273f', agoSec: 120 * H, durationSec: 18 },
  { serviceId: 'monitoring', version: 'Prom 3.0', previousVersion: 'Prom 2.54', status: 'success', env: 'production', branch: 'main', message: 'Prometheus 3.0 major upgrade', commit: 'pr30aa2', agoSec: 140 * H, durationSec: 96 },
  { serviceId: 'vpn', version: 'WireGuard 1.0', previousVersion: 'WireGuard 0.0.202401', status: 'success', env: 'production', branch: 'main', message: 'Rotate gateway image and refresh peer keys', commit: 'wg10a3f', agoSec: 132 * H, durationSec: 18 },
  { serviceId: 'storage', version: 'MinIO RELEASE.2025', previousVersion: 'MinIO RELEASE.2024', status: 'success', env: 'production', branch: 'main', message: 'Upgrade object storage and validate bucket lifecycle rules', commit: 'mn25b8c', agoSec: 84 * H, durationSec: 64 },
  { serviceId: 'queue', version: 'NATS 2.10', previousVersion: 'NATS 2.9', status: 'success', env: 'production', branch: 'main', message: 'Enable durable job streams for API workers', commit: 'nt210de', agoSec: 40 * H, durationSec: 31 },
  { serviceId: 'ci', version: 'Runner 17.8', previousVersion: 'Runner 17.7', status: 'success', env: 'production', branch: 'main', message: 'Add build cache volume and artifact cleanup', commit: 'ci178fa', agoSec: 18 * H, durationSec: 44 },
  { serviceId: 'api', version: '2.7.3', previousVersion: '2.7.2', status: 'success', env: 'production', branch: 'main', message: 'Cache layer for /v1/status', commit: 'api273z', agoSec: 150 * H, durationSec: 74 },
  { serviceId: 'openclaw', version: '0.9.2', previousVersion: '0.9.1', status: 'success', env: 'production', branch: 'main', message: 'Fix job dedupe race', commit: 'oc92xy1', agoSec: 168 * H, durationSec: 47 },
]

// ── Team & access seed ───────────────────────────────────
interface UserSeed {
  id: string
  name: string
  email: string
  role: User['role']
  status: User['status']
  mfa: boolean
  lastActiveSec: number // ago
  createdDaysAgo: number
  actionsCount: number
}

const USER_SEEDS: UserSeed[] = [
  { id: 'u-danil', name: 'Danil', email: 'danilitmo@gmail.com', role: 'owner', status: 'active', mfa: true, lastActiveSec: 90, createdDaysAgo: 412, actionsCount: 1284 },
  { id: 'u-mara', name: 'Mara Voss', email: 'mara@natux.world', role: 'admin', status: 'active', mfa: true, lastActiveSec: 22 * 60, createdDaysAgo: 210, actionsCount: 613 },
  { id: 'u-kai', name: 'Kai Renn', email: 'kai@natux.world', role: 'operator', status: 'active', mfa: false, lastActiveSec: 3 * 3600, createdDaysAgo: 96, actionsCount: 208 },
  { id: 'u-bot', name: 'Deploy Bot', email: 'ci@natux.world', role: 'operator', status: 'active', mfa: true, lastActiveSec: 300, createdDaysAgo: 180, actionsCount: 947 },
  { id: 'u-lena', name: 'Lena Ost', email: 'lena@natux.world', role: 'viewer', status: 'active', mfa: false, lastActiveSec: 26 * 3600, createdDaysAgo: 41, actionsCount: 37 },
  { id: 'u-new', name: 'Tom Adeyemi', email: 'tom@natux.world', role: 'operator', status: 'invited', mfa: false, lastActiveSec: 0, createdDaysAgo: 2, actionsCount: 0 },
  { id: 'u-old', name: 'Rex Halloran', email: 'rex@old.natux.world', role: 'admin', status: 'suspended', mfa: true, lastActiveSec: 61 * 86400, createdDaysAgo: 320, actionsCount: 502 },
]

interface AuditSeed {
  userId: string
  action: string
  target: string
  result: AuditEntry['result']
  ip: string
  agoSec: number
}

const AUDIT_SEEDS: AuditSeed[] = [
  { userId: 'u-bot', action: 'deploy.start', target: 'website@4.2.0-rc.1', result: 'ok', ip: '10.0.0.6', agoSec: 300 },
  { userId: 'u-danil', action: 'auth.login', target: 'console', result: 'ok', ip: '188.32.14.9', agoSec: 90 },
  { userId: 'u-mara', action: 'service.restart', target: 'redis', result: 'ok', ip: '10.0.0.4', agoSec: 22 * 60 },
  { userId: 'u-kai', action: 'service.stop', target: 'openclaw', result: 'denied', ip: '10.0.0.9', agoSec: 3 * 3600 },
  { userId: 'u-bot', action: 'deploy.rollback', target: 'api@2.7.4', result: 'ok', ip: '10.0.0.6', agoSec: 52 * 3600 },
  { userId: 'u-danil', action: 'user.role_change', target: 'kai → operator', result: 'ok', ip: '188.32.14.9', agoSec: 96 * 3600 },
  { userId: 'u-old', action: 'auth.login', target: 'console', result: 'failed', ip: '45.9.148.2', agoSec: 61 * 86400 },
  { userId: 'u-danil', action: 'user.suspend', target: 'rex', result: 'ok', ip: '188.32.14.9', agoSec: 60 * 86400 },
  { userId: 'u-mara', action: 'settings.update', target: 'integrations.pagerduty', result: 'ok', ip: '10.0.0.2', agoSec: 5 * 3600 },
  { userId: 'u-lena', action: 'incident.view', target: 'inc-postgres-01', result: 'ok', ip: '10.0.0.7', agoSec: 26 * 3600 },
  { userId: 'u-danil', action: 'user.invite', target: 'tom@natux.world', result: 'ok', ip: '188.32.14.9', agoSec: 2 * 86400 },
  { userId: 'u-kai', action: 'service.restart', target: 'minecraft', result: 'ok', ip: '10.0.0.8', agoSec: 30 * 3600 },
]

function isoAgo(nowMs: number, sec: number): string {
  return new Date(nowMs - sec * 1000).toISOString()
}

function initialLogs(kind: Service['kind'], nowMs: number): LogLine[] {
  const base: Record<string, [LogLine['level'], string][]> = {
    minecraft: [
      ['info', 'Done (12.4s)! For help, type "help"'],
      ['info', 'Player Steve joined the game'],
      ['warn', "Can't keep up! Is the server overloaded? Running 2140ms behind"],
      ['info', 'Saving chunks for level "world"'],
    ],
    api: [
      ['info', 'GET /v1/status 200 14ms'],
      ['info', 'POST /v1/deploy 202 88ms'],
      ['warn', 'pool near capacity: 18/20 connections'],
      ['info', 'GET /v1/metrics 200 6ms'],
    ],
    postgres: [
      ['info', 'checkpoint complete: wrote 214 buffers'],
      ['info', 'autovacuum: VACUUM public.events'],
      ['debug', 'connection authorized: user=api db=main'],
    ],
    vpn: [
      ['info', 'wireguard interface wg0: peer handshake complete'],
      ['info', '12 peers active · 184 Mbps egress'],
      ['debug', 'persistent keepalive sent to peer 10.8.0.14'],
    ],
    storage: [
      ['info', 'bucket backups: lifecycle scan complete'],
      ['info', 'S3 PUT world-snapshot.tar.zst 200'],
      ['debug', 'erasure set health check ok'],
    ],
    queue: [
      ['info', 'stream jobs: 18 pending messages'],
      ['debug', 'consumer api-workers acknowledged batch 42'],
      ['info', 'durable consumer backup-worker active'],
    ],
    ci: [
      ['info', 'job deploy-api #482 completed successfully'],
      ['debug', 'restored build cache layer'],
      ['info', 'runner ready: 2 slots available'],
    ],
    default: [
      ['info', 'service started'],
      ['info', 'health check ok'],
      ['debug', 'heartbeat'],
    ],
  }
  const lines = base[kind] ?? base.default
  return lines.map(([level, text], i) => ({
    ts: isoAgo(nowMs, (lines.length - i) * 20),
    level,
    text,
  }))
}

/** One line of plausible routine chatter for a service, keyed by kind. The
 *  seed keeps values reproducible per tick. Occasionally warns under load. */
function routineLine(s: Service, seed: number): [LogLine['level'], string] {
  const r = seeded(seed * 1.7)
  const n = (a: number, b: number) => a + Math.round(seeded(seed * 3.3 + a) * (b - a))
  const hot = s.metrics.cpu > 82 || s.metrics.ram > 88
  if (hot && r < 0.5) {
    return ['warn', `high load: cpu ${Math.round(s.metrics.cpu)}% ram ${Math.round(s.metrics.ram)}%`]
  }
  const byKind: Record<string, [LogLine['level'], string][]> = {
    minecraft: [
      ['info', `Saving chunks for level "world"`],
      ['info', `Player ${['Steve', 'Alex', 'Notch', 'danil'][n(0, 3)]} moved to a new region`],
      ['debug', `Autosave complete (${n(40, 120)}ms)`],
    ],
    openclaw: [
      ['info', `worker #${n(1, 8)} picked up job q:sync`],
      ['debug', `session ${n(1000, 9999)} synced`],
    ],
    website: [
      ['info', `GET / 200 ${n(4, 40)}ms`],
      ['info', `GET /assets/app.${n(10, 99)}.js 304 ${n(1, 6)}ms`],
    ],
    api: [
      ['info', `GET /v1/status 200 ${n(6, 30)}ms`],
      ['info', `POST /v1/events 202 ${n(20, 110)}ms`],
      ['debug', `pool ${n(4, 18)}/20 connections`],
    ],
    postgres: [
      ['info', `checkpoint complete: wrote ${n(80, 400)} buffers`],
      ['debug', `connection authorized: user=api db=main`],
    ],
    redis: [
      ['debug', `BGSAVE finished in ${n(1, 9)}00ms`],
      ['info', `${n(1, 40)}k ops/s · ${n(20, 90)}% hit rate`],
    ],
    nginx: [
      ['info', `${['GET', 'POST'][n(0, 1)]} 200 upstream ${n(2, 24)}ms`],
      ['debug', `worker reaped idle connection`],
    ],
    docker: [
      ['debug', `container health probe ok`],
      ['info', `image layer cache hit`],
    ],
    backup: [
      ['info', `snapshot ${n(1, 30)} verified (${n(1, 9)}.${n(0, 9)} GB)`],
      ['debug', `rsync delta ${n(1, 400)} MB`],
    ],
    monitoring: [
      ['debug', `scraped ${n(8, 12)} targets`],
      ['info', `retention compaction ok`],
    ],
    vpn: [
      ['info', `peer ${n(10, 29)} handshake refreshed`],
      ['debug', `wg0 transfer ${n(40, 280)} Mbps egress`],
      ['info', `${n(9, 18)} peers active`],
    ],
    storage: [
      ['info', `bucket lifecycle sweep: ${n(2, 18)} objects expired`],
      ['debug', `S3 health probe ${n(4, 28)}ms`],
    ],
    queue: [
      ['info', `jobs stream depth ${n(4, 52)}`],
      ['debug', `consumer api-workers ack latency ${n(1, 18)}ms`],
    ],
    ci: [
      ['info', `job #${n(400, 520)} started on runner slot ${n(1, 4)}`],
      ['debug', `artifact cache hit ${n(72, 98)}%`],
    ],
  }
  const pool = byKind[s.kind] ?? [['debug', 'heartbeat'] as [LogLine['level'], string]]
  return pool[Math.floor(r * pool.length)]
}

// ── Engine ───────────────────────────────────────────────

type Listener = (snap: InfraSnapshot) => void

export class MockInfraEngine {
  private services: Service[]
  private incidents: Incident[] = []
  private deployments: Deployment[] = []
  private notifications: AppNotification[] = []
  private users: User[] = []
  private auditLog: AuditEntry[] = []
  private listeners = new Set<Listener>()
  private tick = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private startMs: number

  constructor() {
    const now = Date.now()
    this.startMs = now
    this.services = SEEDS.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      status: s.status,
      metrics: { cpu: s.cpu, ram: s.ram, disk: s.disk, network: 20 + s.cpu, ping: 8 + Math.round(s.cpu / 6) },
      ramMb: s.ramMb,
      version: s.version,
      hostname: s.hostname,
      ip: s.ip,
      container: s.container,
      restartCount: 0,
      healthScore: 100,
      crashProbability: 0,
      lastBackup: isoAgo(now, 3600 * (2 + (SEEDS.indexOf(s) % 5))),
      lastDeploy: isoAgo(now, 3600 * 24 * (1 + (SEEDS.indexOf(s) % 6))),
      uptimeSec: 3600 * 24 * (3 + (SEEDS.indexOf(s) % 9)) + s.cpu * 37,
      dependsOn: s.dependsOn,
      recentLogs: initialLogs(s.kind, now),
    }))
    this.recomputeHealth()
    this.seedNotifications(now)
    this.seedDeployments(now)
    this.seedTeam(now)
  }

  // ── Subscriptions ──────────────────────────────────────
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    if (!this.timer) this.startLoop()
    return () => {
      this.listeners.delete(fn)
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  private startLoop() {
    this.timer = setInterval(() => this.step(), 2000)
  }

  private emit() {
    const snap = this.getSnapshot()
    for (const fn of this.listeners) fn(snap)
  }

  // ── Snapshot & derived state ───────────────────────────
  getSnapshot(): InfraSnapshot {
    const services = this.effectiveServices()
    return {
      services,
      incidents: [...this.incidents].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
      deployments: [...this.deployments].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
      notifications: [...this.notifications].sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
      ),
      users: this.users,
      auditLog: [...this.auditLog].sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
      ),
      host: this.hostVitals(services),
      summary: this.summarize(services),
      serverTimeMs: Date.now(),
    }
  }

  /** Apply dependency cascade: a service whose upstream is offline/restarting
   *  is shown degraded (unless it is itself down). This is the visual "why". */
  private effectiveServices(): Service[] {
    const byId = new Map(this.services.map((s) => [s.id, s]))
    const effectiveStatus = new Map<string, ServiceStatus>()
    const resolving = new Set<string>()

    const resolveStatus = (service: Service): ServiceStatus => {
      const cached = effectiveStatus.get(service.id)
      if (cached) return cached
      if (resolving.has(service.id)) return service.status
      resolving.add(service.id)

      const baseDown = service.status === 'offline' || service.status === 'restarting' || service.status === 'updating'
      const degraded = !baseDown && service.dependsOn.some((id) => {
        const dependency = byId.get(id)
        if (!dependency) return false
        const status = resolveStatus(dependency)
        return status === 'offline' || status === 'restarting' || status === 'degraded'
      })
      const status = baseDown ? service.status : degraded ? 'degraded' : service.status
      resolving.delete(service.id)
      effectiveStatus.set(service.id, status)
      return status
    }

    return this.services.map((s) => {
      const status = resolveStatus(s)
      return status === s.status ? s : { ...s, status }
    })
  }

  private hostVitals(services: Service[]): HostVitals {
    const live = services.filter((s) => s.status !== 'offline')
    const avg = (sel: (m: Service['metrics']) => number) =>
      live.length ? live.reduce((a, s) => a + sel(s.metrics), 0) / live.length : 0
    return {
      cpu: clamp(avg((m) => m.cpu) * 1.15, 0, 100),
      ram: clamp(avg((m) => m.ram) * 1.1, 0, 100),
      disk: clamp(
        services.reduce((a, s) => a + s.metrics.disk, 0) / services.length,
        0,
        100,
      ),
      uptimeSec: (Date.now() - this.startMs) / 1000 + 3600 * 24 * 21,
    }
  }

  private summarize(services: Service[]): InfraSummary {
    const online = services.filter((s) => s.status === 'healthy').length
    const degraded = services.filter((s) => s.status === 'degraded').length
    const offline = services.filter(
      (s) => s.status === 'offline' || s.status === 'restarting',
    ).length
    const total = services.length
    const health =
      services.reduce((a, s) => {
        const w =
          s.status === 'offline'
            ? 0
            : s.status === 'restarting'
              ? 20
              : s.status === 'degraded'
                ? 62
                : s.healthScore
        return a + w
      }, 0) / total
    const today = this.incidents.filter(
      (i) => Date.now() - new Date(i.startedAt).getTime() < 86400_000,
    )
    const resolved = today.filter((i) => i.resolved).length
    return {
      healthScore: Math.round(health),
      online,
      offline,
      degraded,
      total,
      uptimePct: clamp(99.98 - offline * 0.7 - degraded * 0.15, 90, 100),
      incidentsToday: today.length,
      recoveryRate: today.length ? Math.round((resolved / today.length) * 100) : 100,
      allHealthy: offline === 0 && degraded === 0,
    }
  }

  private recomputeHealth() {
    for (const s of this.services) {
      const load = (s.metrics.cpu + s.metrics.ram) / 2
      const penalty = s.restartCount * 4 + Math.max(0, load - 70) * 0.8
      s.healthScore = Math.round(clamp(100 - penalty, 20, 100))
      s.crashProbability = Math.round(clamp((load - 55) * 0.6 + s.restartCount * 3, 0, 96))
    }
  }

  // ── Simulation tick ────────────────────────────────────
  private step() {
    this.tick++
    // jitter metrics deterministically per tick/service
    this.services.forEach((s, idx) => {
      if (s.status === 'offline') return
      const r = seeded(this.tick * 13.37 + idx * 7.1)
      const r2 = seeded(this.tick * 4.2 + idx * 11.9)
      const drift = (r - 0.5) * 6
      const busy = s.status === 'restarting' ? 8 : 0
      s.metrics.cpu = clamp(s.metrics.cpu + drift + busy * (r2 - 0.4), 1, 99)
      s.metrics.ram = clamp(s.metrics.ram + (r2 - 0.5) * 3, 3, 97)
      s.metrics.ping = clamp(s.metrics.ping + (r - 0.5) * 4, 2, 260)
      s.metrics.network = clamp(s.metrics.network + (r2 - 0.5) * 10, 1, 940)
      if (s.status !== 'restarting') s.uptimeSec += 2
    })
    this.emitRoutineLogs()
    this.recomputeHealth()
    this.emit()
  }

  /** Append routine chatter to a couple of running services each tick so the
   *  live log terminal actually streams. Deterministic per tick. */
  private emitRoutineLogs() {
    const running = this.services.filter((s) => s.status === 'healthy' || s.status === 'degraded')
    if (running.length === 0) return
    const now = Date.now()
    const count = 1 + Math.floor(seeded(this.tick * 2.3) * 2) // 1–2 lines/tick
    for (let n = 0; n < count; n++) {
      const s = running[Math.floor(seeded(this.tick * 5.7 + n * 9.1) * running.length)]
      const [level, text] = routineLine(s, this.tick + n)
      s.recentLogs = [...s.recentLogs.slice(-11), { ts: new Date(now).toISOString(), level, text }]
    }
  }

  // ── Actions (optimistic control surface) ───────────────
  // TODO(backend): replace bodies with real SSH/systemd/docker calls.
  async dispatch(serviceId: string, action: ServiceAction): Promise<void> {
    const s = this.services.find((x) => x.id === serviceId)
    if (!s) return
    if (action === 'stop') {
      s.status = 'offline'
      s.metrics.cpu = 0
      s.metrics.ram = 0
      s.metrics.ping = 0
      this.pushNotification({
        kind: 'warning',
        title: `${s.name} stopped`,
        body: `Stopped by ${USER}`,
        serviceId: s.id,
      })
      this.emit()
      return
    }
    if (action === 'start' || action === 'restart') {
      const wasDown = s.status === 'offline'
      s.status = 'restarting'
      if (action === 'restart') s.restartCount++
      this.emit()
      // simulate boot latency, then heal
      await delay(1400)
      s.status = 'healthy'
      s.metrics.cpu = 6 + Math.round(seeded(this.tick + s.restartCount) * 20)
      s.metrics.ram = 15 + Math.round(seeded(this.tick + 3) * 20)
      s.metrics.ping = 8
      s.uptimeSec = 0
      this.resolveIncidentsFor(s.id)
      this.pushNotification({
        kind: 'recovery',
        title: `${s.name} ${wasDown ? 'started' : 'restarted'}`,
        body: `Recovered by ${USER} · back online`,
        serviceId: s.id,
      })
      this.recomputeHealth()
      this.emit()
    }
  }

  /** Force a service down + open an incident. Used by the sim button and
   *  the "simulate failure" affordance. */
  crash(serviceId: string, reason?: string): void {
    const s = this.services.find((x) => x.id === serviceId)
    if (!s || s.status === 'offline') return
    const now = Date.now()
    s.status = 'offline'
    const causes: Record<string, string> = {
      minecraft: 'OutOfMemoryError: Java heap space during chunk gen',
      api: 'ECONNREFUSED: upstream postgres pool exhausted',
      postgres: 'FATAL: could not write to WAL — disk pressure',
      redis: 'OOM command not allowed when maxmemory reached',
      nginx: 'worker process exited on signal 11 (SIGSEGV)',
      vpn: 'wireguard interface wg0 stopped responding to handshakes',
      storage: 'S3 backend unavailable: drive quorum lost',
      queue: 'NATS stream jobs exceeded consumer acknowledgement deadline',
      ci: 'runner executor stopped while provisioning build container',
      default: 'process exited unexpectedly (code 1)',
    }
    const rootCause = reason ?? causes[s.kind] ?? causes.default
    const inc: Incident = {
      id: `inc-${s.id}-${this.incidents.length + 1}`,
      serviceId: s.id,
      severity: s.kind === 'postgres' || s.kind === 'nginx' ? 'critical' : 'high',
      title: `${s.name} is offline`,
      rootCause,
      stackTrace: `${rootCause}\n    at ${s.container}.main (/app/index.js:142)\n    at process.tick (node:internal)`,
      startedAt: new Date(now).toISOString(),
      downtimeSec: 0,
      restartedBy: null,
      autoRecovery: false,
      resolved: false,
      attempts: [],
    }
    this.incidents.push(inc)
    s.recentLogs = [
      ...s.recentLogs.slice(-4),
      { ts: new Date(now).toISOString(), level: 'error', text: rootCause },
    ]
    this.pushNotification({
      kind: 'critical',
      title: `${s.name} crashed`,
      body: rootCause,
      serviceId: s.id,
    })
    this.recomputeHealth()
    this.emit()
  }

  private resolveIncidentsFor(serviceId: string) {
    for (const inc of this.incidents) {
      if (inc.serviceId === serviceId && !inc.resolved) {
        inc.resolved = true
        inc.resolvedAt = new Date().toISOString()
        inc.restartedBy = USER
        inc.downtimeSec = (Date.now() - new Date(inc.startedAt).getTime()) / 1000
        inc.attempts.push({
          ts: new Date().toISOString(),
          action: 'restart',
          by: USER,
          ok: true,
        })
      }
    }
  }

  resolveIncident(id: string): void {
    const inc = this.incidents.find((i) => i.id === id)
    const service = inc && this.services.find((s) => s.id === inc.serviceId)
    // An incident is only resolved after its own service is healthy again.
    if (inc && service?.status === 'healthy' && !inc.resolved) {
      inc.resolved = true
      inc.resolvedAt = new Date().toISOString()
      inc.downtimeSec = (Date.now() - new Date(inc.startedAt).getTime()) / 1000
      this.emit()
    }
  }

  /** Revert a service to a deployment's previous version. Flags the target
   *  deploy as rolled_back, records a new rollback deployment, and updates the
   *  live service version. */
  // TODO(backend): re-deploy the previous artifact via CI + swap the running image.
  rollback(deploymentId: string): void {
    const target = this.deployments.find((d) => d.id === deploymentId)
    if (!target || target.status !== 'success') return
    const svc = this.services.find((s) => s.id === target.serviceId)
    const now = Date.now()
    target.status = 'rolled_back'
    const entry: Deployment = {
      id: `dep-rb-${this.deployments.length + 1}`,
      serviceId: target.serviceId,
      version: target.previousVersion,
      previousVersion: target.version,
      status: 'success',
      env: target.env,
      triggeredBy: USER,
      commit: target.commit,
      branch: target.branch,
      message: `Rollback ${target.version} → ${target.previousVersion}`,
      startedAt: new Date(now).toISOString(),
      durationSec: 12 + Math.round(seeded(this.deployments.length * 7.3) * 26),
      rollbackOf: target.id,
    }
    this.deployments.push(entry)
    if (svc) {
      svc.version = target.previousVersion
      svc.lastDeploy = new Date(now).toISOString()
      svc.recentLogs = [
        ...svc.recentLogs.slice(-11),
        { ts: new Date(now).toISOString(), level: 'warn', text: `Rolled back to ${target.previousVersion} (${entry.commit})` },
      ]
    }
    this.pushNotification({
      kind: 'deployment',
      title: `${svc?.name ?? target.serviceId} rolled back`,
      body: `${target.version} → ${target.previousVersion} by ${USER}`,
      serviceId: target.serviceId,
    })
    this.emit()
  }

  markNotificationsRead(): void {
    this.notifications.forEach((n) => (n.read = true))
    this.emit()
  }

  /** Emergency recovery: restart everything that is down, flag related
   *  incidents as auto-recovered, fire external alerts. */
  // TODO(backend): fan out to systemctl/docker restart + real Telegram/Discord webhooks.
  async panic(): Promise<{ recovered: number }> {
    const offline = this.services.filter((s) => s.status === 'offline')
    if (offline.length === 0) return { recovered: 0 }

    this.pushNotification({
      kind: 'critical',
      title: 'PANIC engaged',
      body: `Emergency recovery of ${offline.length} service(s)`,
    })
    this.pushNotification({ kind: 'info', title: 'Telegram alert sent', body: '@danil notified' })
    this.pushNotification({ kind: 'info', title: 'Discord alert sent', body: '#alerts notified' })
    for (const inc of this.incidents) {
      if (!inc.resolved && offline.some((o) => o.id === inc.serviceId)) inc.autoRecovery = true
    }
    this.emit()

    await Promise.all(
      offline.map(async (s) => {
        s.status = 'restarting'
        this.emit()
        await delay(1200)
        s.status = 'healthy'
        s.metrics.cpu = 8 + Math.round(seeded(this.tick + s.restartCount) * 14)
        s.metrics.ram = 16 + Math.round(seeded(this.tick + 5) * 16)
        s.metrics.ping = 8
        s.uptimeSec = 0
        this.resolveIncidentsFor(s.id)
      }),
    )

    this.pushNotification({
      kind: 'recovery',
      title: 'Recovery complete',
      body: `${offline.length} service(s) back online · Nginx reloaded · Docker restarted`,
    })
    this.recomputeHealth()
    this.emit()
    return { recovered: offline.length }
  }

  /** Restore the deterministic demo baseline without reloading the page. */
  resetDemo(): void {
    const fresh = new MockInfraEngine()
    this.services = fresh.services
    this.incidents = fresh.incidents
    this.deployments = fresh.deployments
    this.notifications = fresh.notifications
    this.users = fresh.users
    this.auditLog = fresh.auditLog
    this.tick = 0
    this.startMs = fresh.startMs
    this.emit()
  }

  private pushNotification(n: Omit<AppNotification, 'id' | 'ts' | 'read'>) {
    this.notifications.push({
      ...n,
      id: `ntf-${this.notifications.length + 1}-${this.tick}`,
      ts: new Date().toISOString(),
      read: false,
    })
    if (this.notifications.length > 40) this.notifications.shift()
  }

  private seedNotifications(now: number) {
    this.notifications = [
      { id: 'n1', kind: 'success', title: 'Backup completed', body: 'pg-main snapshot 4.2 GB', ts: isoAgo(now, 1800), read: false },
      { id: 'n2', kind: 'deployment', title: 'Website deployed', body: 'v4.1.2 · 34s build', ts: isoAgo(now, 5400), read: false },
      { id: 'n3', kind: 'info', title: 'Weekly report ready', body: 'Uptime 99.97% this week', ts: isoAgo(now, 9200), read: true },
    ]
  }

  private seedDeployments(now: number) {
    this.deployments = DEPLOY_SEEDS.map((d, i) => ({
      id: `dep-${i + 1}`,
      serviceId: d.serviceId,
      version: d.version,
      previousVersion: d.previousVersion,
      status: d.status,
      env: d.env,
      triggeredBy: USER,
      commit: d.commit,
      branch: d.branch,
      message: d.message,
      startedAt: isoAgo(now, d.agoSec),
      durationSec: d.durationSec,
    }))
  }

  private seedTeam(now: number) {
    this.users = USER_SEEDS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      mfa: u.mfa,
      actionsCount: u.actionsCount,
      lastActive: isoAgo(now, u.status === 'invited' ? 0 : u.lastActiveSec),
      createdAt: isoAgo(now, u.createdDaysAgo * 86400),
    }))
    this.auditLog = AUDIT_SEEDS.map((a, i) => ({
      id: `aud-${i + 1}`,
      userId: a.userId,
      action: a.action,
      target: a.target,
      result: a.result,
      ip: a.ip,
      ts: isoAgo(now, a.agoSec),
    }))
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

// App-wide singleton.
export const engine = new MockInfraEngine()
