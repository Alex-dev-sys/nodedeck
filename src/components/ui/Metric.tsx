import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Metric({
  label,
  value,
  sub,
  icon,
  accent,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  accent?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border border-border-soft bg-surface-2 px-3.5 py-3',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
        {icon}
        {label}
      </div>
      <div
        className="mt-1.5 text-lg font-semibold tabular-nums text-fg"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-fg-faint mt-0.5">{sub}</div>}
    </div>
  )
}
