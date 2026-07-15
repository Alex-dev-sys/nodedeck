import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Rocket,
  RotateCcw,
  Undo2,
  XCircle,
} from 'lucide-react'
import type { Deployment, DeployStatus, Service } from '@/types'
import { useInfra, useRollbackDeployment } from '@/hooks/useInfra'
import { kindIcon } from '@/lib/serviceMeta'
import { Section } from '@/components/ui/Section'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { cn, formatDuration, relativeTime } from '@/lib/utils'

const statusMeta: Record<DeployStatus, { label: string; hex: string; Icon: typeof CheckCircle2 }> = {
  success: { label: 'Success', hex: '#6ee7b7', Icon: CheckCircle2 },
  failed: { label: 'Failed', hex: '#ff4d4f', Icon: XCircle },
  in_progress: { label: 'Deploying', hex: '#60a5fa', Icon: Loader2 },
  rolled_back: { label: 'Rolled back', hex: '#fbbf24', Icon: Undo2 },
}

export function DeploymentsPage() {
  const { data, isLoading } = useInfra()
  const rollback = useRollbackDeployment()
  const [selected, setSelected] = useState<string | null>(null)

  const deployments = data?.deployments ?? []
  const active = deployments.find((d) => d.id === selected) ?? deployments[0] ?? null

  if (isLoading || !data) return <PageSkeleton />

  const finished = deployments.filter((d) => d.status !== 'in_progress')
  const shipped = finished.filter((d) => d.status === 'success').length
  const successRate = finished.length ? Math.round((shipped / finished.length) * 100) : 100
  const live = deployments.filter((d) => d.status === 'in_progress').length

  return (
    <Section
      title="Deployments"
      subtitle={`${deployments.length} releases · ${successRate}% success${live ? ` · ${live} in progress` : ''}`}
      action={live > 0 ? <Badge color="#60a5fa">{live} deploying</Badge> : <Badge color="#6ee7b7">all green</Badge>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* Timeline list */}
        <div className="space-y-2.5">
          {deployments.map((dep) => {
            const svc = data.services.find((s) => s.id === dep.serviceId)
            const Icon = svc ? kindIcon[svc.kind] : Rocket
            const meta = statusMeta[dep.status]
            const isActive = active?.id === dep.id
            return (
              <button
                key={dep.id}
                onClick={() => setSelected(dep.id)}
                className={cn(
                  'w-full overflow-hidden rounded-[var(--radius-lg)] border bg-surface p-3.5 text-left transition-colors',
                  isActive ? 'border-fg-faint' : 'border-border hover:border-fg-faint/60',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${meta.hex}18`, color: meta.hex }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                      <span className="truncate">{svc?.name ?? dep.serviceId}</span>
                      <span className="font-mono text-[11px] text-fg-faint">{dep.version}</span>
                    </div>
                    <div className="text-[11px] text-fg-faint">{relativeTime(dep.startedAt, data.serverTimeMs)}</div>
                  </div>
                  <Badge color={meta.hex}>
                    {dep.status === 'in_progress' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {meta.label}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-fg-faint">
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {dep.branch}
                  </span>
                  <span className={cn('rounded px-1.5 py-0.5', dep.env === 'production' ? 'bg-danger/10 text-danger' : 'bg-info/10 text-info')}>
                    {dep.env}
                  </span>
                  {dep.rollbackOf && <span className="text-warning">rollback</span>}
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
              <DeploymentDetail
                deployment={active}
                service={data.services.find((s) => s.id === active.serviceId)}
                now={data.serverTimeMs}
                pending={rollback.isPending}
                onRollback={() => rollback.mutate(active.id)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Section>
  )
}

function DeploymentDetail({
  deployment: dep,
  service,
  now,
  pending,
  onRollback,
}: {
  deployment: Deployment
  service?: Service
  now: number
  pending: boolean
  onRollback: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const meta = statusMeta[dep.status]
  const Icon = service ? kindIcon[service.kind] : Rocket
  const canRollback = dep.status === 'success'

  // Reset confirm state whenever the viewed deployment changes.
  useEffect(() => setConfirming(false), [dep.id])

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: `${meta.hex}18`, color: meta.hex }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              {service?.name ?? dep.serviceId}
              <Badge color={meta.hex}>
                <meta.Icon className={cn('h-3 w-3', dep.status === 'in_progress' && 'animate-spin')} />
                {meta.label}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-muted">
              <span className="font-mono text-fg-faint">{dep.previousVersion}</span>
              <ArrowRight className="h-3.5 w-3.5 text-fg-faint" />
              <span className="font-mono font-semibold text-fg">{dep.version}</span>
            </div>
          </div>
        </div>
        {canRollback &&
          (confirming ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={onRollback} disabled={pending}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Confirm → {dep.previousVersion}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Rollback
            </Button>
          ))}
      </div>

      {/* Release message */}
      <div className="px-5 py-4">
        <p className="text-sm text-fg">{dep.message}</p>
      </div>

      {/* Facts grid */}
      <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
        <Fact label="Environment" value={dep.env} />
        <Fact label="Branch" value={dep.branch} icon={<GitBranch className="h-3.5 w-3.5" />} />
        <Fact label="Commit" value={dep.commit} mono icon={<GitCommitHorizontal className="h-3.5 w-3.5" />} />
        <Fact
          label={dep.status === 'in_progress' ? 'Elapsed' : 'Build time'}
          value={dep.durationSec ? formatDuration(dep.durationSec) : '—'}
          icon={<Clock className="h-3.5 w-3.5" />}
        />
        <Fact label="Triggered by" value={dep.triggeredBy} />
        <Fact label="When" value={relativeTime(dep.startedAt, now)} />
        <Fact label="From version" value={dep.previousVersion} mono />
        <Fact label="To version" value={dep.version} mono />
      </div>

      {dep.status === 'rolled_back' && (
        <div className="border-t border-border bg-warning/5 px-5 py-3 text-[13px] text-warning">
          This release was rolled back. The service is no longer running this version.
        </div>
      )}
      {dep.status === 'failed' && (
        <div className="border-t border-border bg-danger/5 px-5 py-3 text-[13px] text-danger">
          Deploy failed and did not go live. Previous version stayed active.
        </div>
      )}
    </Card>
  )
}

function Fact({
  label,
  value,
  icon,
  mono,
}: {
  label: string
  value: string
  icon?: ReactNode
  mono?: boolean
}) {
  return (
    <div className="bg-surface px-5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</div>
      <div className={cn('mt-1 flex items-center gap-1.5 text-[13px] text-fg', mono && 'font-mono')}>
        {icon && <span className="text-fg-faint">{icon}</span>}
        {value}
      </div>
    </div>
  )
}
