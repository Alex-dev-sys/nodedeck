import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface IntegrationState {
  connected: boolean
}

export type IntegrationId = 'slack' | 'email' | 'pagerduty' | 'webhook'

export interface AutomationRule {
  id: string
  when: string
  then: string
  enabled: boolean
}

interface SettingsState {
  accent: string
  setAccent: (hex: string) => void

  density: 'comfortable' | 'compact'
  setDensity: (d: 'comfortable' | 'compact') => void

  integrations: Record<IntegrationId, boolean>
  toggleIntegration: (id: IntegrationId) => void

  rules: AutomationRule[]
  addRule: (rule: Omit<AutomationRule, 'id' | 'enabled'>) => void
  toggleRule: (id: string) => void
  removeRule: (id: string) => void
}

export const ACCENT_PRESETS = ['#6ee7b7', '#60a5fa', '#8b5cf6', '#fbbf24', '#ff4d4f', '#f472b6'] as const

// Deterministic id source — no Math.random (keeps store SSR-safe & predictable).
let ruleSeq = 0
const nextId = () => `rule-${Date.now().toString(36)}-${ruleSeq++}`

const DEFAULT_RULES: AutomationRule[] = [
  { id: 'rule-seed-1', when: 'crashProbability > 80%', then: 'restart the service', enabled: true },
  { id: 'rule-seed-2', when: 'any service offline > 60s', then: 'page on-call via PagerDuty', enabled: true },
  { id: 'rule-seed-3', when: 'disk usage > 90%', then: 'run backup prune', enabled: false },
]

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      accent: '#6ee7b7',
      setAccent: (hex) => set({ accent: hex }),

      density: 'comfortable',
      setDensity: (density) => set({ density }),

      integrations: { slack: true, email: true, pagerduty: false, webhook: false },
      toggleIntegration: (id) =>
        set((s) => ({ integrations: { ...s.integrations, [id]: !s.integrations[id] } })),

      rules: DEFAULT_RULES,
      addRule: (rule) =>
        set((s) => ({ rules: [{ id: nextId(), enabled: true, ...rule }, ...s.rules] })),
      toggleRule: (id) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        })),
      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
    }),
    { name: 'infra-settings' },
  ),
)

/** Push the chosen accent into the CSS custom property the whole theme reads. */
export function applyAccent(hex: string) {
  document.documentElement.style.setProperty('--color-accent', hex)
}
