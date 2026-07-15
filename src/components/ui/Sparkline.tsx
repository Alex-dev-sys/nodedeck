import { useId } from 'react'
import { seeded } from '@/lib/utils'

/** Lightweight deterministic sparkline. `seed` keeps the curve stable across
 *  renders; `value` nudges the tail so it tracks the live metric. */
export function Sparkline({
  seed,
  value,
  color = '#6ee7b7',
  width = 96,
  height = 30,
  points = 24,
}: {
  seed: number
  value: number
  color?: string
  width?: number
  height?: number
  points?: number
}) {
  const gid = useId()
  const data: number[] = []
  for (let i = 0; i < points; i++) {
    const base = seeded(seed * 3.1 + i * 1.7)
    const t = i / (points - 1)
    data.push(base * 40 + value * 0.5 * t + 20)
  }
  data[points - 1] = value
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const step = width / (points - 1)
  const coords = data.map((d, i) => {
    const x = i * step
    const y = height - ((d - min) / range) * (height - 4) - 2
    return [x, y] as const
  })
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[points - 1][0]} cy={coords[points - 1][1]} r="2.2" fill={color} />
    </svg>
  )
}
