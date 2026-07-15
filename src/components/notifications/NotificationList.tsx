import {
  CircleCheck,
  Info,
  Rocket,
  ShieldAlert,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import type { AppNotification, NotificationKind } from '@/types'
import { relativeTime } from '@/lib/utils'

const META: Record<NotificationKind, { icon: LucideIcon; color: string }> = {
  critical: { icon: ShieldAlert, color: '#ff4d4f' },
  warning: { icon: TriangleAlert, color: '#fbbf24' },
  success: { icon: CircleCheck, color: '#6ee7b7' },
  deployment: { icon: Rocket, color: '#8b5cf6' },
  recovery: { icon: Undo2, color: '#60a5fa' },
  info: { icon: Info, color: '#9aa1ad' },
}

export function NotificationList({
  items,
  now,
}: {
  items: AppNotification[]
  now: number
}) {
  return (
    <div className="glass overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-pop)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-fg">Notifications</span>
        <span className="text-[11px] text-fg-faint">{items.length} recent</span>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-fg-faint">All caught up.</div>
        )}
        {items.map((n) => {
          const m = META[n.kind]
          return (
            <div
              key={n.id}
              className="flex gap-3 border-b border-border-soft px-4 py-3 last:border-0 hover:bg-surface-2/60"
            >
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: `${m.color}1a`, color: m.color }}
              >
                <m.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-fg">{n.title}</span>
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                </div>
                <div className="truncate text-[12px] text-fg-muted">{n.body}</div>
                <div className="mt-0.5 text-[11px] text-fg-faint">{relativeTime(n.ts, now)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
