import { useState } from 'react'
import { Activity, Cpu, HardDrive, MemoryStick } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Section } from '@/components/ui/Section'
import { MetricChart, type ChartLine } from '@/components/monitoring/MetricChart'
import { useMetricHistory } from '@/hooks/useMetricHistory'
import { RANGES, type RangeKey } from '@/services/metricHistory'
import { cn } from '@/lib/utils'

const COLORS = {
  cpu: '#16a34a',
  ram: '#6366f1',
  disk: '#d97706',
} as const

const LOAD_LINES: ChartLine[] = [
  { key: 'cpu', label: 'CPU', color: COLORS.cpu },
  { key: 'ram', label: 'Memory', color: COLORS.ram },
  { key: 'disk', label: 'Disk', color: COLORS.disk },
]

function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  color,
}: {
  icon: LucideIcon
  label: string
  value: number
  unit: string
  color: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-fg-faint">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-fg">
        {Math.round(value)}
        <span className="ml-0.5 text-sm font-medium text-fg-faint">{unit}</span>
      </div>
    </Card>
  )
}

/** Legend + current value chips shown above a multi-series chart (direct
 *  labels — identity never rests on color alone). */
function SeriesLegend({ lines, latest }: { lines: ChartLine[]; latest: Record<string, number> }) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 pb-1 pt-3">
      {lines.map((l) => (
        <div key={l.key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
          <span className="text-[12px] text-fg-muted">{l.label}</span>
          <span className="font-mono text-[12px] font-semibold text-fg">{Math.round(latest[l.key] ?? 0)}%</span>
        </div>
      ))}
    </div>
  )
}

export function MonitoringPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('1h')
  const range = RANGES.find((r) => r.key === rangeKey)!
  const data = useMetricHistory(range.ms)
  const latest = data[data.length - 1] ?? { cpu: 0, ram: 0, disk: 0, net: 0, ping: 0, t: 0 }

  return (
    <Section
      title="Monitoring"
      subtitle="Host and fleet metrics over time"
      action={
        <div className="flex items-center gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={cn(
                'rounded-[8px] px-2.5 py-1 text-[12px] font-medium transition-colors',
                r.key === rangeKey ? 'bg-surface-3 text-fg shadow-[var(--shadow-card)]' : 'text-fg-faint hover:text-fg',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Current-value tiles */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile icon={Cpu} label="CPU" value={latest.cpu} unit="%" color={COLORS.cpu} />
          <StatTile icon={MemoryStick} label="Memory" value={latest.ram} unit="%" color={COLORS.ram} />
          <StatTile icon={HardDrive} label="Disk" value={latest.disk} unit="%" color={COLORS.disk} />
        </div>

        {/* System load — 3 series, one % axis */}
        <Card>
          <CardHeader
            title="System Load"
            subtitle={`CPU · Memory · Disk · last ${range.label}`}
            icon={
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/12 text-accent">
                <Activity className="h-[18px] w-[18px]" />
              </span>
            }
          />
          <SeriesLegend lines={LOAD_LINES} latest={latest as unknown as Record<string, number>} />
          <div className="px-2 pb-3">
            <MetricChart data={data} lines={LOAD_LINES} rangeMs={range.ms} unit="%" domain={[0, 100]} height={260} />
          </div>
        </Card>

        {data.length === 0 && <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-fg-faint">Waiting for the first real host metric sample from an online agent.</div>}
      </div>
    </Section>
  )
}
