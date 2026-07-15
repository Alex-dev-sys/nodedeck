import { motion } from 'framer-motion'
import { Activity, CircleCheck, ServerCog, TriangleAlert } from 'lucide-react'
import type { InfraSummary } from '@/types'
import { Card } from '@/components/ui/Card'
import { HealthRing } from './HealthRing'

export function HeroPanel({ summary }: { summary: InfraSummary }) {
  const calm = summary.offline === 0 && summary.degraded === 0
  const headline = calm
    ? 'Everything is running smoothly.'
    : summary.offline > 0
      ? 'Immediate attention required.'
      : 'Minor degradation detected.'
  const accent = calm ? '#6ee7b7' : summary.offline > 0 ? '#ff4d4f' : '#fbbf24'

  return <Card className="overflow-hidden">
    <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `radial-gradient(40rem 20rem at 0% 0%, ${accent}14, transparent 60%)` }} />
    <div className="relative flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[12px] text-fg-muted">
          {calm ? <CircleCheck className="h-3.5 w-3.5 text-accent" /> : <TriangleAlert className="h-3.5 w-3.5" style={{ color: accent }} />}
          {summary.online}/{summary.total} services online
        </div>
        <motion.h1 key={headline} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl text-[28px] font-bold leading-tight tracking-tight text-fg lg:text-[32px]">{headline}</motion.h1>
        <p className="mt-2 max-w-lg text-[14px] text-fg-muted">{calm ? 'Every connected agent currently reports its projects as available.' : 'Review the affected projects below and choose a safe recovery action.'}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Activity className="h-4 w-4" />} label="Online" value={summary.online} />
          <Stat icon={<TriangleAlert className="h-4 w-4" />} label="Degraded" value={summary.degraded} tone={summary.degraded ? '#fbbf24' : undefined} />
          <Stat icon={<ServerCog className="h-4 w-4" />} label="Total" value={summary.total} />
          <Stat icon={<TriangleAlert className="h-4 w-4" />} label="Offline" value={summary.offline} tone={summary.offline ? '#ff4d4f' : undefined} />
        </div>
      </div>
      <div className="shrink-0 self-center"><HealthRing value={summary.healthScore} /></div>
    </div>
  </Card>
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return <div className="rounded-[var(--radius-md)] border border-border-soft bg-surface-2/70 px-3.5 py-3">
    <div className="flex items-center gap-1.5 text-fg-faint"><span style={tone ? { color: tone } : undefined}>{icon}</span><span className="text-[11px] uppercase tracking-wide">{label}</span></div>
    <div className="mt-1.5 text-2xl font-semibold tabular-nums text-fg" style={tone ? { color: tone } : undefined}>{value}</div>
  </div>
}
