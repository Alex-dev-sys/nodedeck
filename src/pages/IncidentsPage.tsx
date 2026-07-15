import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useInfra } from '@/hooks/useInfra'
import { severityMeta, kindIcon } from '@/lib/serviceMeta'
import { Section } from '@/components/ui/Section'
import { Badge } from '@/components/ui/Badge'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'
import { cn, formatDuration, relativeTime } from '@/lib/utils'

export function IncidentsPage() {
  const { data, isLoading } = useInfra()
  const [selected, setSelected] = useState<string | null>(null)

  const incidents = data?.incidents ?? []
  const active = incidents.find((i) => i.id === selected) ?? incidents[0] ?? null

  if (isLoading || !data) return <PageSkeleton />

  const open = incidents.filter((i) => !i.resolved).length

  if (incidents.length === 0) {
    return (
      <Section title="Incident Center" subtitle="Failures, root cause and recovery">
        <div className="grid place-items-center rounded-[var(--radius-card)] border border-border bg-surface py-24 text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-fg">No incidents</h3>
          <p className="mt-1 max-w-xs text-[13px] text-fg-muted">
            All clear. Open a service and hit “simulate failure” to see the incident flow.
          </p>
        </div>
      </Section>
    )
  }

  return (
    <Section
      title="Incident Center"
      subtitle={`${incidents.length} total · ${open} open`}
      action={open > 0 ? <Badge color="#ff4d4f">{open} active</Badge> : <Badge color="#6ee7b7">all resolved</Badge>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        {/* List */}
        <div className="space-y-2.5">
          {incidents.map((inc) => {
            const svc = data.services.find((s) => s.id === inc.serviceId)
            const Icon = svc ? kindIcon[svc.kind] : ShieldAlert
            const sev = severityMeta[inc.severity]
            const isActive = active?.id === inc.id
            return (
              <button
                key={inc.id}
                onClick={() => setSelected(inc.id)}
                className={cn(
                  'w-full overflow-hidden rounded-[var(--radius-lg)] border bg-surface p-3.5 text-left transition-colors',
                  isActive ? 'border-fg-faint' : 'border-border hover:border-fg-faint/60',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${sev.hex}18`, color: sev.hex }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-fg">{inc.title}</div>
                    <div className="text-[11px] text-fg-faint">{relativeTime(inc.startedAt, data.serverTimeMs)}</div>
                  </div>
                  {inc.resolved ? (
                    <Badge color="#6ee7b7">resolved</Badge>
                  ) : (
                    <Badge color={sev.hex}>{sev.label}</Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-fg-faint">
                  <span>downtime {formatDuration(inc.downtimeSec || (data.serverTimeMs - new Date(inc.startedAt).getTime()) / 1000)}</span>
                  {inc.autoRecovery && <span className="text-info">auto-recovery</span>}
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail */}
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <IncidentDetail incident={active} services={data.services} now={data.serverTimeMs} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Section>
  )
}
