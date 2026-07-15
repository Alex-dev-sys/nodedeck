import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Cpu, MemoryStick, ScrollText, X } from 'lucide-react'
import type { Service } from '@/types'
import { useInfra } from '@/hooks/useInfra'
import { useUI } from '@/stores/ui'
import { kindIcon, statusMeta } from '@/lib/serviceMeta'
import { formatUptime, pct } from '@/lib/utils'
import { StatusDot } from '@/components/ui/StatusDot'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Metric } from '@/components/ui/Metric'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ServiceActions } from './ServiceActions'
import { LogStream } from '@/components/logs/LogStream'
import { fetchLogs } from '@/services/operations'
import { useAuth } from '@/stores/auth'
import { ServiceSettings } from '@/components/service/ServiceSettings'

export function ServiceDrawer() {
  const id = useUI((state) => state.drawerServiceId)
  const close = useUI((state) => state.closeDrawer)
  const { data } = useInfra()
  const service = data?.services.find((item) => item.id === id) ?? null

  return (
    <AnimatePresence>
      {service && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[460px] flex-col border-l border-border bg-surface shadow-[var(--shadow-pop)]"
          >
            <DrawerBody service={service} onClose={close} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function DrawerBody({ service, onClose }: { service: Service; onClose: () => void }) {
  const Icon = kindIcon[service.kind]
  const meta = statusMeta[service.status]
  const accessToken = useAuth((state) => state.accessToken)
  const logs = useQuery({
    queryKey: ['service-logs', service.id],
    queryFn: () => fetchLogs(accessToken!, service.id),
    enabled: Boolean(accessToken),
    refetchInterval: 10_000,
  })

  return (
    <>
      <div className="flex items-start gap-3 border-b border-border p-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${meta.hex}18`, color: meta.hex }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-fg">{service.name}</h2>
            <StatusDot status={service.status} />
          </div>
          <div className="mt-0.5 truncate font-mono text-[12px] text-fg-faint" title={service.version}>{service.version || 'Runtime not reported'}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-[18px] w-[18px]" /></Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge color={meta.hex}><StatusDot status={service.status} size={6} pulse={false} /> {meta.label}</Badge>
          <div className="flex items-center gap-2">
            <ServiceSettings service={service} />
            <ServiceActions service={service} size="sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Meter label="CPU" value={service.metrics.cpu} icon={<Cpu className="h-3.5 w-3.5" />} />
          <Meter label="RAM" value={service.metrics.ram} icon={<MemoryStick className="h-3.5 w-3.5" />} />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Uptime" value={formatUptime(service.uptimeSec)} />
          <Metric label="Restarts" value={service.restartCount} />
        </div>

        <div className="rounded-[var(--radius-md)] border border-border-soft bg-surface-2 text-[13px]">
          <Row label="Host" value={service.hostname || '—'} />
          <Row label="Source" value={service.kind} />
          {service.kind === 'docker' && !service.composeProject && <Row label="Container" value={service.container ? service.container.slice(0, 12) : '—'} mono />}
          <Row label="Runtime" value={service.runtimeState || 'unknown'} />
          <Row label="Healthcheck" value={service.healthStatus || 'not configured'} />
          {service.composeProject && <Row label="Compose stack" value={service.composeProject} />}
          {service.composeService && <Row label="Compose service" value={service.composeService} />}
          {(service.ports?.length ?? 0) > 0 && <Row label="Ports" value={service.ports!.join(', ')} mono />}
          {service.protected && <Row label="Control" value="Protected" />}
          {!service.managed && !service.protected && <Row label="Control" value="Monitoring only" />}
          {service.managed && !service.protected && service.controlEnabled === false && <Row label="Control" value="Locked in settings" />}
          {service.managed && !service.protected && <Row label="Auto recovery" value={service.autoRecovery ? 'On' : 'Off'} />}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-fg">Recent logs</span>
            <Link to={`/logs?service=${encodeURIComponent(service.id)}`} onClick={onClose} className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
              <ScrollText className="h-3.5 w-3.5" /> All logs
            </Link>
          </div>
          {logs.isError ? <p className="text-[12px] text-danger">Logs are temporarily unavailable.</p> : <LogStream lines={logs.data?.logs ?? []} compact />}
        </div>
      </div>
    </>
  )
}

function Meter({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-[var(--radius-md)] border border-border-soft bg-surface-2 p-3">
    <div className="mb-2 flex items-center justify-between text-[11px] text-fg-faint"><span className="flex items-center gap-1.5">{icon}{label}</span><span className="font-mono tabular-nums text-fg-muted">{pct(value)}</span></div>
    <ProgressBar value={value} height={5} />
  </div>
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-b border-border-soft px-3.5 py-2.5 last:border-0">
    <span className="shrink-0 text-fg-faint">{label}</span>
    <span className={`min-w-0 truncate text-right text-fg-muted ${mono ? 'font-mono' : ''}`} title={value}>{value}</span>
  </div>
}
