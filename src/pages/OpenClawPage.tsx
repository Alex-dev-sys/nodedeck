import { useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  Coins,
  Cpu,
  Gauge,
  OctagonX,
  ShieldCheck,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react'
import type { AgentSession } from '@/services/serviceDetail'
import { useInfra, useServiceAction } from '@/hooks/useInfra'
import { openclawDetail } from '@/services/serviceDetail'
import { PanelHeader } from '@/components/service/PanelHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Sparkline } from '@/components/ui/Sparkline'
import { LogStream } from '@/components/logs/LogStream'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { cn, formatDuration } from '@/lib/utils'

const STATUS_META: Record<AgentSession['status'], { color: string; label: string }> = {
  running: { color: '#60a5fa', label: 'Running' },
  queued: { color: '#9aa1ad', label: 'Queued' },
  done: { color: '#6ee7b7', label: 'Done' },
  failed: { color: '#ff4d4f', label: 'Failed' },
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

export function OpenClawPage() {
  const { data, isLoading } = useInfra()
  const service = data?.services.find((s) => s.id === 'openclaw')
  const detail = useMemo(() => (service ? openclawDetail(service) : null), [service])

  if (isLoading || !data || !service || !detail) return <PageSkeleton />

  const maxTool = Math.max(...detail.toolBreakdown.map((t) => t.count), 1)

  return (
    <div className="space-y-6">
      <PanelHeader service={service} tagline="Autonomous AI agent runtime" />

      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Metric label="Active" value={detail.activeSessions} accent="#60a5fa" icon={<Bot className="h-3.5 w-3.5" />} />
        <Metric label="Queued" value={detail.queued} icon={<Activity className="h-3.5 w-3.5" />} />
        <Metric label="Runs today" value={detail.runsToday.toLocaleString()} icon={<Zap className="h-3.5 w-3.5" />} />
        <Metric label="Total runs" value={compact(detail.runsTotal)} accent="#6ee7b7" sub="since launch '25" />
        <Metric
          label="Success"
          value={`${detail.successRate}%`}
          accent={detail.successRate < 92 ? '#fbbf24' : undefined}
        />
        <Metric label="Latency" value={`${detail.avgLatencyMs}ms`} icon={<Gauge className="h-3.5 w-3.5" />} />
        <Metric label="Tools/min" value={detail.toolCallsPerMin} icon={<Wrench className="h-3.5 w-3.5" />} />
        <Metric label="Model" value={<span className="text-[13px]">{detail.model}</span>} icon={<Cpu className="h-3.5 w-3.5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sessions */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Agent sessions"
            subtitle={`${detail.activeSessions} running · ${detail.queued} queued`}
            icon={
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-info/12 text-info">
                <Bot className="h-[18px] w-[18px]" />
              </span>
            }
          />
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-border-soft text-left text-[11px] uppercase tracking-wide text-fg-faint">
                  <th className="px-5 py-2 font-medium">Run</th>
                  <th className="px-2 py-2 font-medium">Task</th>
                  <th className="px-2 py-2 font-medium">Model</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Tokens</th>
                  <th className="px-2 py-2 text-right font-medium">Tools</th>
                  <th className="px-5 py-2 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {detail.sessions.map((s) => {
                  const m = STATUS_META[s.status]
                  return (
                    <tr key={s.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/50">
                      <td className="px-5 py-2.5 font-mono text-fg-muted">{s.id}</td>
                      <td className="px-2 py-2.5 text-fg">{s.task}</td>
                      <td className="px-2 py-2.5 font-mono text-[12px] text-fg-faint">{s.model}</td>
                      <td className="px-2 py-2.5">
                        <span className="inline-flex items-center gap-1.5" style={{ color: m.color }}>
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', s.status === 'running' && 'animate-pulse')}
                            style={{ backgroundColor: m.color }}
                          />
                          {m.label}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-fg-muted">{compact(s.tokens)}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-fg-muted">{s.toolCalls}</td>
                      <td className="px-5 py-2.5 text-right text-fg-muted">{formatDuration(s.durSec)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Token economy + tools */}
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg">
              <Coins className="h-4 w-4 text-warning" /> Token economy · today
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-fg-faint">Input</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-fg">{compact(detail.tokensInToday)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-fg-faint">Output</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-accent">{compact(detail.tokensOutToday)}</div>
              </div>
            </div>
            <div className="mt-3">
              <Sparkline seed={7} value={72} color="#fbbf24" width={260} height={44} points={40} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg">
              <Wrench className="h-4 w-4 text-info" /> Tool calls
            </div>
            <div className="space-y-2.5">
              {detail.toolBreakdown.map((t) => (
                <div key={t.name}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-mono text-fg-muted">{t.name}</span>
                    <span className="font-mono tabular-nums text-fg-faint">{t.count}</span>
                  </div>
                  <ProgressBar value={(t.count / maxTool) * 100} color="#60a5fa" height={5} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Guardrails + activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GuardrailsCard service={service} detail={detail} />

        <Card className="lg:col-span-2">
          <CardHeader
            title="Agent activity"
            subtitle="live reasoning & tool trace"
            icon={
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple/12 text-purple">
                <Terminal className="h-[18px] w-[18px]" />
              </span>
            }
          />
          <div className="p-4 pt-3">
            <LogStream lines={service.recentLogs} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function GuardrailsCard({
  service,
  detail,
}: {
  service: Parameters<typeof openclawDetail>[0]
  detail: ReturnType<typeof openclawDetail>
}) {
  const action = useServiceAction()
  const [confirming, setConfirming] = useState(false)
  const halted = service.status === 'offline' || service.status === 'restarting'
  const g = detail.guardrails

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-fg">
        <ShieldCheck className="h-4 w-4 text-accent" /> Guardrails
      </div>

      <div className="space-y-2.5 text-[13px]">
        <Row label="Sandboxed" value={<Badge color="#6ee7b7">{g.sandboxed ? 'yes' : 'no'}</Badge>} />
        <Row
          label="Kill-switch"
          value={<Badge color={g.killSwitchArmed ? '#6ee7b7' : '#ff4d4f'}>{g.killSwitchArmed ? 'armed' : 'off'}</Badge>}
        />
        <Row label="Blocked actions" value={<span className="font-mono text-fg-muted">{g.blockedActions}</span>} />
        <Row
          label="Approvals pending"
          value={
            <span className="font-mono" style={{ color: g.approvalsPending ? '#fbbf24' : '#9aa1ad' }}>
              {g.approvalsPending}
            </span>
          }
        />
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-danger/25 bg-danger/[0.06] p-3">
        <div className="flex items-center gap-2 text-[12px] font-medium text-danger">
          <OctagonX className="h-4 w-4" /> Emergency stop
        </div>
        <p className="mt-1 text-[11.5px] text-fg-faint">
          Halts every running agent and drains the queue. Use if the fleet misbehaves.
        </p>
        {halted ? (
          <Button
            size="sm"
            variant="primary"
            className="mt-3 w-full"
            onClick={() => action.mutate({ id: service.id, action: 'start' })}
          >
            Resume agents
          </Button>
        ) : confirming ? (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              className="flex-1"
              onClick={() => {
                action.mutate({ id: service.id, action: 'stop' })
                setConfirming(false)
              }}
            >
              Confirm halt
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="danger" className="mt-3 w-full" onClick={() => setConfirming(true)}>
            <OctagonX className="h-4 w-4" /> Halt all agents
          </Button>
        )}
      </div>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-faint">{label}</span>
      {value}
    </div>
  )
}
