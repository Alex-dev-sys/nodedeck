// ── Domain model ─────────────────────────────────────────
// Single source of truth for the whole dashboard. The mock engine
// produces these shapes; a real backend must return the same ones.

export type ServiceStatus =
  | 'healthy'
  | 'degraded'
  | 'restarting'
  | 'updating'
  | 'offline'

export type ServiceKind =
  | 'minecraft'
  | 'openclaw'
  | 'website'
  | 'api'
  | 'postgres'
  | 'redis'
  | 'nginx'
  | 'docker'
  | 'backup'
  | 'monitoring'
  | 'vpn'
  | 'storage'
  | 'queue'
  | 'ci'

export interface Metrics {
  cpu: number // %
  ram: number // %
  disk: number // %
  network: number // Mbps
  ping: number // ms
}

export interface LogLine {
  ts: string
  level: 'info' | 'warn' | 'error' | 'debug'
  text: string
}

export interface Service {
  id: string
  name: string
  kind: ServiceKind
  status: ServiceStatus
  metrics: Metrics
  ramMb: number
  version: string
  hostname: string
  ip: string
  container: string
  restartCount: number
  healthScore: number // 0-100
  crashProbability: number // 0-100
  lastBackup: string // ISO
  lastDeploy: string // ISO
  uptimeSec: number
  dependsOn: string[] // service ids upstream of this one
  recentLogs: LogLine[]
  runtimeState?: string
  healthStatus?: string
  composeProject?: string
  composeService?: string
  ports?: string[]
  protected?: boolean
}

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface RecoveryAttempt {
  ts: string
  action: string
  by: string
  ok: boolean
}

export interface Incident {
  id: string
  serviceId: string
  severity: Severity
  title: string
  rootCause: string
  stackTrace?: string
  startedAt: string
  resolvedAt?: string
  downtimeSec: number
  restartedBy: string | null
  autoRecovery: boolean
  resolved: boolean
  attempts: RecoveryAttempt[]
}

export type DeployStatus = 'success' | 'failed' | 'in_progress' | 'rolled_back'

export interface Deployment {
  id: string
  serviceId: string
  version: string // version this deploy shipped
  previousVersion: string // version it replaced (rollback target)
  status: DeployStatus
  env: 'production' | 'staging'
  triggeredBy: string
  commit: string // short sha
  branch: string
  message: string // release / commit message
  startedAt: string // ISO
  durationSec: number // build + deploy time
  rollbackOf?: string // id of the deployment this one reverted
}

export type NotificationKind =
  | 'critical'
  | 'warning'
  | 'success'
  | 'deployment'
  | 'recovery'
  | 'info'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  ts: string
  read: boolean
  serviceId?: string
}

// ── Access control & audit ───────────────────────────────

export type Role = 'owner' | 'admin' | 'operator' | 'viewer'

export type UserStatus = 'active' | 'invited' | 'suspended'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  lastActive: string // ISO
  createdAt: string // ISO
  mfa: boolean
  actionsCount: number // lifetime audit entries
}

export type AuditResult = 'ok' | 'denied' | 'failed'

export interface AuditEntry {
  id: string
  userId: string
  action: string // verb-ish, e.g. "service.restart"
  target: string // what it touched, e.g. "minecraft"
  result: AuditResult
  ip: string
  ts: string // ISO
}

// ── Derived / aggregate views ────────────────────────────

export interface HostVitals {
  cpu: number
  ram: number
  disk: number
  uptimeSec: number
}

export interface InfraSummary {
  healthScore: number
  online: number
  offline: number
  degraded: number
  total: number
  uptimePct: number
  incidentsToday: number
  recoveryRate: number
  allHealthy: boolean
}

export interface InfraSnapshot {
  services: Service[]
  incidents: Incident[]
  deployments: Deployment[]
  notifications: AppNotification[]
  users: User[]
  auditLog: AuditEntry[]
  host: HostVitals
  summary: InfraSummary
  serverTimeMs: number
}

// Action verbs supported by the service-control layer.
export type ServiceAction = 'start' | 'restart' | 'stop'

// Action verbs supported by the deployment-control layer.
export type DeployAction = 'deploy' | 'rollback'
