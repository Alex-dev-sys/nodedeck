import type { LogLine } from '@/types'
import { cn } from '@/lib/utils'

const LEVEL: Record<LogLine['level'], { color: string; label: string }> = {
  error: { color: '#ff4d4f', label: 'ERR' },
  warn: { color: '#fbbf24', label: 'WRN' },
  info: { color: '#6ee7b7', label: 'INF' },
  debug: { color: '#60a5fa', label: 'DBG' },
}

export function LogStream({ lines, compact }: { lines: LogLine[]; compact?: boolean }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-md)] border border-border bg-[#0b0c10] font-mono',
        compact ? 'text-[11.5px]' : 'text-[12.5px]',
      )}
    >
      <div className="max-h-64 overflow-y-auto p-3">
        {lines.length === 0 && <div className="text-fg-faint">no output</div>}
        {lines.map((l, i) => {
          const m = LEVEL[l.level]
          const time = new Date(l.ts).toLocaleTimeString('en-GB', { hour12: false })
          return (
            <div key={i} className="flex gap-2.5 py-0.5 leading-relaxed">
              <span className="shrink-0 text-fg-faint/70">{time}</span>
              <span className="shrink-0 font-semibold" style={{ color: m.color }}>
                {m.label}
              </span>
              <span
                className={cn(
                  'min-w-0 break-words',
                  l.level === 'error' ? 'text-danger/90' : l.level === 'warn' ? 'text-warning/90' : 'text-fg-muted',
                )}
              >
                {l.text}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
