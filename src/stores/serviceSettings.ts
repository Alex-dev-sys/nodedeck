import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Service, ServiceKind } from '@/types'

export type RestartPolicy = 'always' | 'on-failure' | 'manual'

export interface ServiceSettings {
  autostart: boolean
  restartPolicy: RestartPolicy
  healthInterval: 15 | 30 | 60
  cpuLimit: number
  memoryLimitMb: number
  custom: Record<string, boolean | number | string>
}

function defaultCustom(kind: ServiceKind): ServiceSettings['custom'] {
  switch (kind) {
    case 'nginx': return { rateLimit: 120, bodyLimitMb: 16, forceHttps: true }
    case 'docker': return { pruneAfterDays: 14, containerLimit: 24, autoUpdate: false }
    case 'postgres': return { connectionCap: 100, sharedBuffersMb: 1024, backupEveryHours: 6 }
    case 'redis': return { maxMemoryMb: 512, evictionPolicy: 'allkeys-lru', snapshotEveryMin: 30 }
    case 'api': return { rateLimit: 300, timeoutSec: 30, maintenanceMode: false }
    case 'website': return { cacheTtlMin: 30, imageOptimization: true, maintenanceMode: false }
    case 'minecraft': return { maxPlayers: 20, viewDistance: 10, whitelist: false }
    case 'openclaw': return { concurrentAgents: 8, tokenBudgetK: 250, requireApprovals: true }
    case 'backup': return { retentionDays: 30, snapshotEveryHours: 12, encryption: true }
    case 'monitoring': return { scrapeIntervalSec: 15, retentionDays: 30, alertGroupSec: 30 }
    case 'vpn': return { peerLimit: 24, keepaliveSec: 25, splitTunnel: true }
    case 'storage': return { capacityGb: 500, versioning: true, lifecycleDays: 30 }
    case 'queue': return { maxDeliveries: 5, ackTimeoutSec: 30, durableStreams: true }
    case 'ci': return { concurrency: 4, artifactRetentionDays: 14, requireProductionApproval: true }
  }
}

export function defaultServiceSettings(service: Service): ServiceSettings {
  return {
    autostart: true,
    restartPolicy: 'on-failure',
    healthInterval: 30,
    cpuLimit: Math.max(25, Math.min(100, Math.ceil(service.metrics.cpu / 10) * 10 + 20)),
    memoryLimitMb: Math.max(256, Math.ceil(service.ramMb / 256) * 256),
    custom: defaultCustom(service.kind),
  }
}

interface ServiceSettingsState {
  byService: Record<string, ServiceSettings>
  update: (service: Service, patch: Partial<ServiceSettings>) => void
  reset: (service: Service) => void
}

export const useServiceSettings = create<ServiceSettingsState>()(
  persist(
    (set) => ({
      byService: {},
      update: (service, patch) => set((state) => ({
        byService: {
          ...state.byService,
          [service.id]: { ...(state.byService[service.id] ?? defaultServiceSettings(service)), ...patch },
        },
      })),
      reset: (service) => set((state) => {
        const byService = { ...state.byService }
        delete byService[service.id]
        return { byService }
      }),
    }),
    { name: 'infra-service-settings' },
  ),
)
