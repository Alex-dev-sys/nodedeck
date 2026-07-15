import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'

function colorFor(v: number): string {
  if (v >= 90) return '#6ee7b7'
  if (v >= 70) return '#fbbf24'
  if (v >= 45) return '#fb923c'
  return '#ff4d4f'
}

export function HealthRing({
  value,
  size = 168,
  stroke = 12,
}: {
  value: number
  size?: number
  stroke?: number
}) {
  const [display, setDisplay] = useState(0)
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const color = colorFor(value)

  useEffect(() => {
    const controls = animate(display, value, {
      duration: 1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    return controls.stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const offset = circ - (display / 100) * circ

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="health-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#health-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="text-[40px] font-bold leading-none tabular-nums"
          style={{ color }}
        >
          {Math.round(display)}
          <span className="text-xl">%</span>
        </span>
        <span className="mt-1 text-[11px] uppercase tracking-wider text-fg-faint">Health</span>
      </div>
    </div>
  )
}
