import type {
  Incident,
  InfraSnapshot,
  Service,
  ServiceAction,
  ServiceKind,
  ServiceStatus,
} from '@/types'
import { engine } from './mock/engine'
import { useAuth } from '@/stores/auth'

export type ApiMode = 'demo' | 'production'

export interface InfraApiClient {
  getSnapshot(): Promise<InfraSnapshot>
  subscribe(callback: (snapshot: InfraSnapshot) => void): () => void
  dispatchAction(serviceId: string, action: ServiceAction): Promise<void>
  simulateCrash(serviceId: string): Promise<void>
  resolveIncident(id: string): Promise<void>
  rollbackDeployment(id: string): Promise<void>
  panic(): Promise<{ recovered: number }>
  markNotificationsRead(): Promise<void>
  resetDemo(): Promise<void>
}

interface BackendService {
  id: string
  name: string
  kind: string
  status: string
  hostname: string
  version: string
  cpu?: number | null
  ram?: number | null
  containerId?: string | null
  runtimeState?: string | null
  healthStatus?: string | null
  restartCount?: number | null
  uptimeSec?: number | null
  composeProject?: string | null
  composeService?: string | null
  ports?: string[] | null
  protected?: boolean | null
  managed?: boolean | null
  updatedAt: string
}

interface BackendIncident {
  id: string
  serviceId: string
  severity: Incident['severity']
  title: string
  rootCause: string
  startedAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

interface BackendSnapshot {
  services: BackendService[]
  incidents: BackendIncident[]
  host?: { cpu: number; ram: number; disk: number; uptimeSec: number }
  serverTimeMs: number
}

interface HttpApiClientOptions {
  baseUrl?: string
  getAccessToken?: () => string | null
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
}

export class ApiError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(
    message: string,
    status?: number,
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export class UnsupportedApiCapabilityError extends Error {
  constructor(capability: string) {
    super(`${capability} is not available in the production API yet.`)
    this.name = 'UnsupportedApiCapabilityError'
  }
}

const NET = () => 120 + Math.round(Math.abs(Math.sin(Date.now())) * 260)

function withLatency<T>(value: () => T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value()), NET()))
}

const serviceKinds: readonly ServiceKind[] = [
  'minecraft',
  'openclaw',
  'website',
  'api',
  'postgres',
  'redis',
  'nginx',
  'docker',
  'systemd',
  'pm2',
  'backup',
  'monitoring',
  'vpn',
  'storage',
  'queue',
  'ci',
]

function isServiceKind(value: string): value is ServiceKind {
  return serviceKinds.includes(value as ServiceKind)
}

function isServiceStatus(value: string): value is ServiceStatus {
  return ['healthy', 'degraded', 'restarting', 'updating', 'offline'].includes(value)
}

function toService(row: BackendService): Service {
  const status = isServiceStatus(row.status) ? row.status : 'offline'
  const kind = isServiceKind(row.kind) ? row.kind : 'api'

  return {
    id: row.id,
    name: row.name,
    kind,
    status,
    metrics: { cpu: row.cpu ?? 0, ram: row.ram ?? 0, disk: 0, network: 0, ping: 0 },
    ramMb: 0,
    version: row.version,
    hostname: row.hostname,
    ip: '',
    container: row.containerId ?? '',
    restartCount: row.restartCount ?? 0,
    healthScore: status === 'healthy' ? 100 : status === 'degraded' ? 50 : 0,
    crashProbability: 0,
    lastBackup: '',
    lastDeploy: row.updatedAt,
    uptimeSec: row.uptimeSec ?? 0,
    dependsOn: [],
    recentLogs: [],
    runtimeState: row.runtimeState ?? undefined,
    healthStatus: row.healthStatus ?? undefined,
    composeProject: row.composeProject ?? undefined,
    composeService: row.composeService ?? undefined,
    ports: row.ports ?? [],
    protected: row.protected ?? false,
    managed: row.managed ?? false,
  }
}

function toIncident(row: BackendIncident, nowMs: number): Incident {
  const startedAtMs = Date.parse(row.startedAt)
  const resolvedAtMs = row.resolvedAt ? Date.parse(row.resolvedAt) : nowMs
  const downtimeSec = Number.isFinite(startedAtMs) && Number.isFinite(resolvedAtMs)
    ? Math.max(0, Math.round((resolvedAtMs - startedAtMs) / 1000))
    : 0

  return {
    id: row.id,
    serviceId: row.serviceId,
    severity: row.severity,
    title: row.title,
    rootCause: row.rootCause,
    startedAt: row.startedAt,
    resolvedAt: row.resolvedAt ?? undefined,
    downtimeSec,
    restartedBy: row.resolvedBy,
    autoRecovery: false,
    resolved: Boolean(row.resolvedAt),
    attempts: [],
  }
}

export function toInfraSnapshot(data: BackendSnapshot): InfraSnapshot {
  const services = data.services.map(toService)
  const online = services.filter((service) => service.status === 'healthy').length
  const offline = services.filter((service) => service.status === 'offline').length
  const degraded = services.filter((service) => service.status === 'degraded').length
  const total = services.length
  const healthScore = total === 0
    ? 100
    : Math.round(((online + degraded * 0.5) / total) * 100)

  return {
    services,
    incidents: data.incidents.map((incident) => toIncident(incident, data.serverTimeMs)),
    deployments: [],
    notifications: [],
    users: [],
    auditLog: [],
    host: data.host ?? { cpu: 0, ram: 0, disk: 0, uptimeSec: 0 },
    summary: {
      healthScore,
      online,
      offline,
      degraded,
      total,
      uptimePct: total === 0 ? 100 : Math.round((online / total) * 10000) / 100,
      incidentsToday: 0,
      recoveryRate: 0,
      allHealthy: total > 0 && online === total,
    },
    serverTimeMs: data.serverTimeMs,
  }
}

class DemoApiClient implements InfraApiClient {
  getSnapshot(): Promise<InfraSnapshot> {
    return withLatency(() => engine.getSnapshot())
  }

  /** Live stream. Returns an unsubscribe fn. Maps to a WebSocket later. */
  subscribe(cb: (snap: InfraSnapshot) => void): () => void {
    return engine.subscribe(cb)
  }

  dispatchAction(serviceId: string, action: ServiceAction): Promise<void> {
    return engine.dispatch(serviceId, action)
  }

  simulateCrash(serviceId: string): Promise<void> {
    return withLatency(() => engine.crash(serviceId))
  }

  resolveIncident(id: string): Promise<void> {
    return withLatency(() => engine.resolveIncident(id))
  }

  rollbackDeployment(id: string): Promise<void> {
    return withLatency(() => engine.rollback(id))
  }

  panic(): Promise<{ recovered: number }> {
    return engine.panic()
  }

  markNotificationsRead(): Promise<void> {
    return withLatency(() => engine.markNotificationsRead())
  }

  resetDemo(): Promise<void> {
    return withLatency(() => engine.resetDemo())
  }
}

export class HttpApiClient implements InfraApiClient {
  private readonly baseUrl: string
  private readonly getAccessToken: () => string | null
  private readonly fetchImpl: typeof fetch
  private readonly pollIntervalMs: number

  constructor({
    baseUrl = '',
    getAccessToken = () => null,
    fetchImpl = (...args) => fetch(...args),
    pollIntervalMs = 5_000,
  }: HttpApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.getAccessToken = getAccessToken
    this.fetchImpl = fetchImpl
    this.pollIntervalMs = pollIntervalMs
  }

  async getSnapshot(): Promise<InfraSnapshot> {
    const snapshot = await this.request<BackendSnapshot>('/api/v1/services')
    return toInfraSnapshot(snapshot)
  }

  subscribe(callback: (snapshot: InfraSnapshot) => void): () => void {
    if (import.meta.env.VITE_REALTIME_MODE !== 'polling' && typeof EventSource !== 'undefined') {
      const source = new EventSource(`${this.baseUrl}/api/v1/events`, { withCredentials: true })
      source.addEventListener('snapshot', (event) => {
        try {
          callback(toInfraSnapshot(JSON.parse((event as MessageEvent<string>).data) as BackendSnapshot))
        } catch {
          // A malformed event must not break the existing connection; EventSource will reconnect when needed.
        }
      })
      return () => source.close()
    }
    const poll = () => {
      void this.getSnapshot()
        .then(callback)
        // The query layer keeps the last known good snapshot during transient failures.
        .catch(() => undefined)
    }
    const intervalId = globalThis.setInterval(poll, this.pollIntervalMs)
    return () => globalThis.clearInterval(intervalId)
  }

  async dispatchAction(serviceId: string, action: ServiceAction): Promise<void> {
    await this.request(`/api/v1/services/${encodeURIComponent(serviceId)}/commands`, {
      method: 'POST',
      headers: { 'Idempotency-Key': globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Date.now()}${Math.random().toString(36).slice(2)}` },
      body: JSON.stringify({ action }),
    })
  }

  simulateCrash(_serviceId: string): Promise<void> {
    return Promise.reject(new UnsupportedApiCapabilityError('Simulating crashes'))
  }

  async resolveIncident(id: string): Promise<void> {
    await this.request(`/api/v1/incidents/${encodeURIComponent(id)}/resolve`, { method: 'POST' })
  }

  rollbackDeployment(_id: string): Promise<void> {
    return Promise.reject(new UnsupportedApiCapabilityError('Deployment rollback'))
  }

  panic(): Promise<{ recovered: number }> {
    return Promise.reject(new UnsupportedApiCapabilityError('Emergency recovery'))
  }

  markNotificationsRead(): Promise<void> {
    return Promise.reject(new UnsupportedApiCapabilityError('Notifications'))
  }

  resetDemo(): Promise<void> {
    return Promise.reject(new UnsupportedApiCapabilityError('Resetting demo data'))
  }

  private async request<T = undefined>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')

    const accessToken = this.getAccessToken()
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

    let response: Response
    try {
      response = await this.fetchImpl.call(globalThis, `${this.baseUrl}${path}`, {
        ...init,
        headers,
        credentials: 'include',
      })
    } catch {
      throw new ApiError('Unable to reach the NodeDeck API.')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => null) as { error?: string; message?: string } | null
      throw new ApiError(
        error?.message ?? error?.error ?? `API request failed with status ${response.status}.`,
        response.status,
        error?.error,
      )
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}

function configuredMode(): ApiMode {
  return import.meta.env.VITE_APP_MODE === 'production' ? 'production' : 'demo'
}

export const apiMode = configuredMode()

export function createApiClient(mode = apiMode): InfraApiClient {
  if (mode === 'demo') return new DemoApiClient()
  return new HttpApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getAccessToken: () => useAuth.getState().accessToken,
  })
}

export const api = createApiClient()
