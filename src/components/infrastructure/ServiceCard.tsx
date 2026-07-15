import { motion } from 'framer-motion'
import { Cpu, MemoryStick, Radio } from 'lucide-react'
import type { Service } from '@/types'
import { kindIcon, statusMeta } from '@/lib/serviceMeta'
import { useUI } from '@/stores/ui'
import { formatUptime, pct } from '@/lib/utils'
import { StatusDot } from '@/components/ui/StatusDot'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Sparkline } from '@/components/ui/Sparkline'
import { ServiceActions } from './ServiceActions'
import { apiMode } from '@/services/api'

export function ServiceCard({ service, index = 0 }: { service: Service; index?: number }) {
  const Icon = kindIcon[service.kind]
  const meta = statusMeta[service.status]
  const openDrawer = useUI((s) => s.openDrawer)
  const down = service.status === 'offline'
  const seedNum = service.id.charCodeAt(0) + service.id.length

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 260, damping: 26 }}
      whileHover={{ y: -3 }}
      onClick={() => openDrawer(service.id)}
      className="group relative cursor-pointer overflow-hidden rounded-[var(--radius-card)] border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors"
      style={{ borderColor: down ? 'rgba(255,77,79,0.35)' : undefined }}
    >
      {/* status wash */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${meta.hex}, transparent)` }}
      />
      {down && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(20rem 10rem at 50% 0%, rgba(255,77,79,0.12), transparent 70%)' }}
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors"
            style={{ backgroundColor: `${meta.hex}16`, color: meta.hex }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-fg">{service.name}</div>
            <div className="flex items-center gap-1.5 text-[12px] text-fg-faint">
              <StatusDot status={service.status} size={7} />
              <span style={{ color: meta.hex }}>{meta.label}</span>
              {!down && <span>· {formatUptime(service.uptimeSec)}</span>}
            </div>
          </div>
        </div>
        {apiMode !== 'production' && <div className="opacity-70">
          <Sparkline seed={seedNum} value={service.metrics.cpu} color={meta.hex} width={72} height={26} />
        </div>}
      </div>

      {/* 5 key signals: CPU, RAM, Ping (+ status/uptime above) */}
      <div className="relative mt-4 space-y-2.5">
        <Signal icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={service.metrics.cpu} display={pct(down ? 0 : service.metrics.cpu)} />
        <Signal icon={<MemoryStick className="h-3.5 w-3.5" />} label="RAM" value={service.metrics.ram} display={pct(down ? 0 : service.metrics.ram)} />
        {apiMode === 'production' ? <div className="flex min-w-0 items-center gap-2 text-[12px]">
          <span className="w-14 shrink-0 text-fg-faint">{service.kind === 'docker' ? 'Image' : 'Runtime'}</span>
          <span className="truncate font-mono text-fg-muted" title={service.version}>{service.version || '—'}</span>
        </div> : <div className="flex items-center gap-2 text-[12px]">
          <span className="flex w-14 items-center gap-1.5 text-fg-faint">
            <Radio className="h-3.5 w-3.5" /> Ping
          </span>
          <span className="font-mono tabular-nums text-fg-muted">
            {down ? '—' : `${Math.round(service.metrics.ping)}ms`}
          </span>
        </div>}
      </div>

      <div className="relative mt-4 flex items-center justify-between border-t border-border-soft pt-3">
        <span className="text-[11px] text-fg-faint">
          {service.kind}{service.composeProject ? ` · ${service.composeProject}` : ''}{service.protected ? ' · protected' : ''}
        </span>
        <ServiceActions service={service} size="sm" />
      </div>
    </motion.div>
  )
}

function Signal({
  icon,
  label,
  value,
  display,
}: {
  icon: React.ReactNode
  label: string
  value: number
  display: string
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="flex w-14 items-center gap-1.5 text-fg-faint">
        {icon} {label}
      </span>
      <ProgressBar value={value} height={5} className="flex-1" />
      <span className="w-10 text-right font-mono tabular-nums text-fg-muted">{display}</span>
    </div>
  )
}
