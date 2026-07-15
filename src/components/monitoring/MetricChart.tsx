import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SeriesRow } from '@/services/metricHistory'

interface TipPayload {
  dataKey?: string | number
  name?: string
  value?: number
  color?: string
}
interface TipProps {
  active?: boolean
  label?: string | number
  payload?: TipPayload[]
  rangeMs: number
  unit: string
}

export interface ChartLine {
  key: keyof SeriesRow
  label: string
  color: string
}

function fmtTime(t: number, rangeMs: number): string {
  const d = new Date(t)
  if (rangeMs <= 6 * 3600_000) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (rangeMs <= 24 * 3600_000) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function CustomTooltip({ active, payload, label, unit }: TipProps) {
  if (!active || !payload?.length) return null
  const t = typeof label === 'number' ? label : Number(label)
  return (
    <div className="glass rounded-[var(--radius-md)] border border-border px-3 py-2 shadow-[var(--shadow-pop)]">
      <div className="mb-1 text-[11px] font-medium text-fg-faint">
        {new Date(t).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}
      </div>
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-fg-muted">{p.name}</span>
            <span className="ml-auto font-mono font-semibold text-fg">
              {Math.round(Number(p.value))}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MetricChart({
  data,
  lines,
  rangeMs,
  unit = '%',
  domain,
  height = 220,
}: {
  data: SeriesRow[]
  lines: ChartLine[]
  rangeMs: number
  unit?: string
  domain?: [number, number]
  height?: number
}) {
  const gid = useId()
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <defs>
            {lines.map((l) => (
              <linearGradient key={l.key} id={`grad-${gid}-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={l.color} stopOpacity={lines.length > 1 ? 0.12 : 0.22} />
                <stop offset="100%" stopColor={l.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#232733" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t) => fmtTime(t, rangeMs)}
            minTickGap={44}
            tick={{ fill: '#61697a', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#232733' }}
          />
          <YAxis
            domain={domain ?? [0, 'auto']}
            width={44}
            tickFormatter={(v) => `${Math.round(v)}${unit}`}
            tick={{ fill: '#61697a', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip rangeMs={rangeMs} unit={unit} />}
            cursor={{ stroke: '#61697a', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          {lines.map((l) => (
            <Area
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label}
              stroke={l.color}
              strokeWidth={2}
              fill={`url(#grad-${gid}-${l.key})`}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
