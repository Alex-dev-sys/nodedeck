import { Bot, Check, Clock, Play, RotateCw, ShieldCheck, Terminal } from 'lucide-react'
import type { Incident, Service } from '@/types'
import { kindIcon, severityMeta } from '@/lib/serviceMeta'
import { formatDuration, relativeTime } from '@/lib/utils'
import { useResolveIncident, useServiceAction } from '@/hooks/useInfra'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatusDot } from '@/components/ui/StatusDot'

export function IncidentDetail({
  incident,
  services,
  now,
}: {
  incident: Incident
  services: Service[]
  now: number
}) {
  const service = services.find((s) => s.id === incident.serviceId)
  const sev = severityMeta[incident.severity]
  const Icon = service ? kindIcon[service.kind] : Terminal

  const action = useServiceAction()
  const resolve = useResolveIncident()
  const serviceDown = service?.status === 'offline'
  const restarting = service?.status === 'restarting'
  const canResolve = service?.status === 'healthy'
  const busy = action.isPending || resolve.isPending || restarting

  // Downtime: frozen once resolved, ticks live while the incident is open.
  const downtimeSec = incident.resolved
    ? incident.downtimeSec
    : (now - new Date(incident.startedAt).getTime()) / 1000

  return (
    <Card className="overflow-hidden">
      {/* severity wash */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${sev.hex}, transparent)` }}
      />

      {/* Header */}
      <div className="flex items-start gap-3.5 px-5 pt-5">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
          style={{ backgroundColor: `${sev.hex}16`, color: sev.hex }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-fg">{incident.title}</h2>
            <Badge color={sev.hex}>{sev.label}</Badge>
            {incident.resolved ? (
              <Badge color="#6ee7b7">
                <Check className="h-3 w-3" /> Resolved
              </Badge>
            ) : (
              <Badge color="#ff4d4f">Active</Badge>
            )}
            {incident.autoRecovery && (
              <Badge color="#60a5fa">
                <Bot className="h-3 w-3" /> Auto-recovery
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-fg-faint">
            {service && <StatusDot status={service.status} size={7} />}
            <span>{service?.name ?? incident.serviceId}</span>
            {service && (
              <span className="text-fg-faint">
                · {service.hostname} · {service.container}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border-y border-border-soft bg-border-soft sm:grid-cols-4">
        <Meta label="Started" value={relativeTime(incident.startedAt, now)} icon={<Clock className="h-3.5 w-3.5" />} />
        <Meta
          label={incident.resolved ? 'Downtime' : 'Ongoing'}
          value={formatDuration(downtimeSec)}
          tone={incident.resolved ? undefined : sev.hex}
        />
        <Meta
          label="Resolved"
          value={incident.resolvedAt ? relativeTime(incident.resolvedAt, now) : '—'}
        />
        <Meta label="Recovered by" value={incident.restartedBy ?? (incident.autoRecovery ? 'auto' : '—')} />
      </div>

      <div className="space-y-5 px-5 py-5">
        {/* Root cause */}
        <div>
          <SectionLabel>Root cause</SectionLabel>
          <p className="mt-2 rounded-[var(--radius-md)] border-l-2 bg-surface-2 px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed text-fg-muted" style={{ borderColor: sev.hex }}>
            {incident.rootCause}
          </p>
        </div>

        {/* Stack trace */}
        {incident.stackTrace && (
          <div>
            <SectionLabel>Stack trace</SectionLabel>
            <pre className="mt-2 overflow-x-auto rounded-[var(--radius-md)] bg-surface-2 p-3.5 font-mono text-[11.5px] leading-relaxed text-fg-muted">
              {incident.stackTrace}
            </pre>
          </div>
        )}

        {/* Recovery timeline */}
        <div>
          <SectionLabel>Recovery timeline</SectionLabel>
          {incident.attempts.length === 0 ? (
            <p className="mt-2 text-[12px] text-fg-faint">
              No recovery attempts yet.
            </p>
          ) : (
            <ol className="mt-2.5 space-y-2.5">
              {incident.attempts.map((a, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[12.5px]">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                    style={{
                      backgroundColor: a.ok ? '#6ee7b718' : '#ff4d4f18',
                      color: a.ok ? '#6ee7b7' : '#ff4d4f',
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-fg-muted">
                    <span className="font-medium text-fg">{a.action}</span> by {a.by}
                  </span>
                  <span className="text-fg-faint">· {relativeTime(a.ts, now)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Actions */}
        {!incident.resolved && (
          <div className="flex items-center gap-2 border-t border-border-soft pt-4">
            {service && (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => action.mutate({ id: service.id, action: serviceDown ? 'start' : 'restart' })}
              >
                {restarting ? (
                  <RotateCw className="h-4 w-4 animate-spin" />
                ) : serviceDown ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
                {restarting ? 'Recovering…' : serviceDown ? 'Restart & resolve' : 'Restart service'}
              </Button>
            )}
            {canResolve && (
              <Button variant="surface" disabled={busy} onClick={() => resolve.mutate(incident.id)}>
                <ShieldCheck className="h-4 w-4" /> Mark resolved
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">{children}</div>
  )
}

function Meta({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  tone?: string
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-fg-faint">
        {icon}
        {label}
      </div>
      <div
        className="mt-1 truncate font-mono text-[14px] font-semibold tabular-nums text-fg"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
    </div>
  )
}
