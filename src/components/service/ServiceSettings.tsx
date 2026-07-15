import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, Settings2, SlidersHorizontal, X } from 'lucide-react'
import type { Service } from '@/types'
import { defaultServiceSettings, useServiceSettings, type RestartPolicy } from '@/stores/serviceSettings'
import { cn } from '@/lib/utils'

const POLICY: { value: RestartPolicy; label: string }[] = [
  { value: 'on-failure', label: 'On failure' },
  { value: 'always', label: 'Always' },
  { value: 'manual', label: 'Manual' },
]

export function ServiceSettings({ service, mode = 'icon' }: { service: Service; mode?: 'icon' | 'tool' }) {
  const [open, setOpen] = useState(false)
  const stored = useServiceSettings((state) => state.byService[service.id])
  const update = useServiceSettings((state) => state.update)
  const reset = useServiceSettings((state) => state.reset)
  const defaults = defaultServiceSettings(service)
  const settings = stored
    ? { ...defaults, ...stored, custom: { ...defaults.custom, ...stored.custom } }
    : defaults
  const updateCustom = (key: string, value: boolean | number | string) => update(service, { custom: { ...settings.custom, [key]: value } })

  return (
    <>
      {mode === 'icon' ? (
        <button type="button" onClick={() => setOpen(true)} title="Service settings" aria-label="Service settings" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface-2 text-fg-muted transition-colors hover:text-fg">
          <Settings2 className="h-4 w-4" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} title="Service settings" className="flex flex-col items-center gap-1.5 rounded-xl border border-border-soft bg-surface-2 py-2.5 text-fg-muted transition-colors hover:border-fg-faint hover:text-fg">
          <Settings2 className="h-4 w-4" />
          <span className="text-[10px]">Config</span>
        </button>
      )}

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[75] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 40 }} className="relative flex h-full w-full max-w-[440px] flex-col border-l border-border bg-surface shadow-[var(--shadow-pop)]">
              <header className="flex items-start gap-3 border-b border-border p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/12 text-accent"><SlidersHorizontal className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-semibold text-fg">Service settings</h2>
                  <p className="mt-0.5 truncate text-[12px] text-fg-faint">{service.name} · local preview</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close settings" className="text-fg-faint transition-colors hover:text-fg"><X className="h-5 w-5" /></button>
              </header>

              <div className="flex-1 space-y-6 overflow-y-auto p-5">
                <p className="text-[12px] leading-relaxed text-fg-faint">Settings are saved in this browser. The local agent will apply the same contract when connected.</p>
                <SettingRow label="Autostart" hint="Start this service when the host boots">
                  <Switch on={settings.autostart} onClick={() => update(service, { autostart: !settings.autostart })} />
                </SettingRow>
                <SettingRow label="Restart policy" hint="Behaviour after an unexpected exit">
                  <select value={settings.restartPolicy} onChange={(event) => update(service, { restartPolicy: event.target.value as RestartPolicy })} className="h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-[12px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                    {POLICY.map((policy) => <option key={policy.value} value={policy.value}>{policy.label}</option>)}
                  </select>
                </SettingRow>
                <SettingRow label="Health check" hint="How frequently service health is sampled">
                  <div className="flex gap-1">
                    {([15, 30, 60] as const).map((interval) => <button key={interval} type="button" onClick={() => update(service, { healthInterval: interval })} className={cn('rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors', settings.healthInterval === interval ? 'border-accent/50 bg-accent/12 text-accent' : 'border-border text-fg-muted hover:text-fg')}>{interval}s</button>)}
                  </div>
                </SettingRow>
                <RangeSetting label="CPU limit" value={settings.cpuLimit} min={10} max={100} suffix="%" onChange={(cpuLimit) => update(service, { cpuLimit })} />
                <RangeSetting label="Memory limit" value={settings.memoryLimitMb} min={128} max={Math.max(1024, service.ramMb * 2)} step={128} suffix="MB" onChange={(memoryLimitMb) => update(service, { memoryLimitMb })} />
                <div className="border-t border-border-soft pt-5">
                  <div className="mb-1 text-[13px] font-semibold text-fg">{service.name} settings</div>
                  <div className="mb-4 text-[11px] text-fg-faint">Parameters specific to this service type</div>
                  <UniqueSettings service={service} values={settings.custom} onChange={updateCustom} />
                </div>
              </div>
              <footer className="flex justify-between border-t border-border p-4">
                <button type="button" onClick={() => reset(service)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[#04150e]">Done</button>
              </footer>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button type="button" role="switch" aria-checked={on} onClick={onClick} className={cn('relative h-6 w-11 rounded-full border transition-colors', on ? 'border-accent/40 bg-accent/25' : 'border-border bg-surface-3')}><span className={cn('absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all', on ? 'left-[22px] bg-accent' : 'left-0.5 bg-fg-faint')} /></button>
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><div><div className="text-[13px] font-medium text-fg">{label}</div><div className="mt-0.5 text-[11px] text-fg-faint">{hint}</div></div>{children}</div>
}

function RangeSetting({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  return <div><div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-medium text-fg">{label}</span><span className="font-mono text-[12px] text-accent">{value} {suffix}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-[var(--color-accent)]" /></div>
}

function UniqueSettings({ service, values, onChange }: { service: Service; values: Record<string, boolean | number | string>; onChange: (key: string, value: boolean | number | string) => void }) {
  const number = (key: string) => Number(values[key])
  const bool = (key: string) => Boolean(values[key])
  const range = (label: string, key: string, min: number, max: number, suffix: string, step = 1) => <RangeSetting label={label} value={number(key)} min={min} max={max} step={step} suffix={suffix} onChange={(value) => onChange(key, value)} />
  const toggle = (label: string, hint: string, key: string) => <SettingRow label={label} hint={hint}><Switch on={bool(key)} onClick={() => onChange(key, !bool(key))} /></SettingRow>
  const select = (label: string, hint: string, key: string, options: { value: string; label: string }[]) => <SettingRow label={label} hint={hint}><select value={String(values[key])} onChange={(event) => onChange(key, event.target.value)} className="h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-[12px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></SettingRow>

  return <div className="space-y-5">
    {(() => {
      switch (service.kind) {
        case 'nginx': return <>{range('Rate limit', 'rateLimit', 20, 1000, 'req/min', 10)}{range('Request body limit', 'bodyLimitMb', 1, 128, 'MB')}{toggle('Force HTTPS', 'Redirect all HTTP traffic to TLS', 'forceHttps')}</>
        case 'docker': return <>{range('Image prune after', 'pruneAfterDays', 1, 90, 'days')}{range('Container cap', 'containerLimit', 1, 100, 'containers')}{toggle('Auto-update', 'Apply approved image updates automatically', 'autoUpdate')}</>
        case 'postgres': return <>{range('Connection cap', 'connectionCap', 10, 500, 'connections')}{range('Shared buffers', 'sharedBuffersMb', 128, 8192, 'MB', 128)}{range('Backup interval', 'backupEveryHours', 1, 24, 'hours')}</>
        case 'redis': return <>{range('Max memory', 'maxMemoryMb', 64, 8192, 'MB', 64)}{select('Eviction policy', 'Behaviour when memory limit is reached', 'evictionPolicy', [{ value: 'allkeys-lru', label: 'allkeys-lru' }, { value: 'volatile-lru', label: 'volatile-lru' }, { value: 'noeviction', label: 'noeviction' }])}{range('Snapshot interval', 'snapshotEveryMin', 5, 120, 'min', 5)}</>
        case 'api': return <>{range('Rate limit', 'rateLimit', 10, 5000, 'req/min', 10)}{range('Request timeout', 'timeoutSec', 5, 120, 'sec', 5)}{toggle('Maintenance mode', 'Return the maintenance response to public traffic', 'maintenanceMode')}</>
        case 'website': return <>{range('Cache TTL', 'cacheTtlMin', 0, 240, 'min', 5)}{toggle('Image optimization', 'Serve responsive optimized images', 'imageOptimization')}{toggle('Maintenance mode', 'Show the maintenance page to visitors', 'maintenanceMode')}</>
        case 'minecraft': return <>{range('Player limit', 'maxPlayers', 1, 200, 'players')}{range('View distance', 'viewDistance', 2, 32, 'chunks')}{toggle('Whitelist', 'Allow only approved player accounts', 'whitelist')}</>
        case 'openclaw': return <>{range('Concurrent agents', 'concurrentAgents', 1, 32, 'agents')}{range('Token budget', 'tokenBudgetK', 10, 1000, 'K tokens', 10)}{toggle('Require approvals', 'Ask before protected agent actions', 'requireApprovals')}</>
        case 'backup': return <>{range('Retention', 'retentionDays', 1, 365, 'days')}{range('Snapshot interval', 'snapshotEveryHours', 1, 48, 'hours')}{toggle('Encryption', 'Encrypt backups before storage', 'encryption')}</>
        case 'monitoring': return <>{range('Scrape interval', 'scrapeIntervalSec', 5, 120, 'sec', 5)}{range('Metric retention', 'retentionDays', 1, 365, 'days')}{range('Alert grouping', 'alertGroupSec', 5, 300, 'sec', 5)}</>
        case 'vpn': return <>{range('Peer limit', 'peerLimit', 1, 200, 'peers')}{range('Persistent keepalive', 'keepaliveSec', 0, 120, 'sec', 5)}{toggle('Split tunnel', 'Route only private traffic through the VPN', 'splitTunnel')}</>
        case 'storage': return <>{range('Capacity budget', 'capacityGb', 50, 5000, 'GB', 50)}{toggle('Bucket versioning', 'Keep prior object versions for recovery', 'versioning')}{range('Lifecycle expiry', 'lifecycleDays', 1, 365, 'days')}</>
        case 'queue': return <>{range('Max deliveries', 'maxDeliveries', 1, 20, 'attempts')}{range('Ack timeout', 'ackTimeoutSec', 5, 300, 'sec', 5)}{toggle('Durable streams', 'Persist queued jobs across restarts', 'durableStreams')}</>
        case 'ci': return <>{range('Runner concurrency', 'concurrency', 1, 20, 'jobs')}{range('Artifact retention', 'artifactRetentionDays', 1, 180, 'days')}{toggle('Require production approval', 'Hold production deploys for operator review', 'requireProductionApproval')}</>
      }
    })()}
  </div>
}
