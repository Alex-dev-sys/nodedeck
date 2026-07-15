import { ArrowUpRight, CircleCheck, TriangleAlert } from 'lucide-react'
import type { AppNotification, Service } from '@/types'
import { kindIcon, statusMeta } from '@/lib/serviceMeta'
import { relativeTime } from '@/lib/utils'
import { useUI } from '@/stores/ui'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StatusDot } from '@/components/ui/StatusDot'

export function AttentionPanel({ services }: { services: Service[] }) {
  const openDrawer = useUI((state) => state.openDrawer)
  const affected = services.filter((service) => service.status !== 'healthy')

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Requires attention"
        subtitle={affected.length ? `${affected.length} affected service${affected.length === 1 ? '' : 's'}` : 'No active service issues'}
        icon={
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-warning/12 text-warning">
            <TriangleAlert className="h-[18px] w-[18px]" />
          </span>
        }
        action={affected.length ? <Badge color="#ff4d4f">live</Badge> : <Badge color="#6ee7b7">clear</Badge>}
      />
      {affected.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-7 text-[13px] text-fg-muted">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent"><CircleCheck className="h-4.5 w-4.5" /></span>
          Nothing needs your attention right now.
        </div>
      ) : (
        <div className="divide-y divide-border-soft">
          {affected.map((service) => {
            const Icon = kindIcon[service.kind]
            const meta = statusMeta[service.status]
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => openDrawer(service.id)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2/60"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${meta.hex}18`, color: meta.hex }}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                    <span className="truncate">{service.name}</span>
                    <StatusDot status={service.status} size={6} />
                  </span>
                  <span className="block text-[11px] text-fg-faint">Open details to inspect logs and controls</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-faint" />
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function ActivityPanel({ items, now }: { items: AppNotification[]; now: number }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Recent activity"
        subtitle="Recovery, deploy and infrastructure events"
        action={<span className="text-[11px] text-fg-faint">live feed</span>}
      />
      <div className="divide-y divide-border-soft">
        {items.slice(0, 5).map((item) => (
          <div key={item.id} className="flex gap-3 px-5 py-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.kind === 'critical' ? '#ff4d4f' : item.kind === 'warning' ? '#fbbf24' : '#6ee7b7' }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-fg">{item.title}</div>
              <div className="truncate text-[11px] text-fg-muted">{item.body}</div>
            </div>
            <div className="shrink-0 text-[11px] text-fg-faint">{relativeTime(item.ts, now)}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}
