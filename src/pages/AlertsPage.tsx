import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BellRing,
  CheckCheck,
  CircleCheck,
  Info,
  MonitorSmartphone,
  Rocket,
  ShieldAlert,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { useInfra, useMarkNotificationsRead } from '@/hooks/useInfra'
import { useClock } from '@/hooks/useClock'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { cn, relativeTime } from '@/lib/utils'
import type { AppNotification, NotificationKind } from '@/types'
import { apiMode } from '@/services/api'
import { fetchAlerts } from '@/services/operations'
import { useAuth } from '@/stores/auth'

const META: Record<NotificationKind, { icon: LucideIcon; color: string; label: string }> = {
  critical: { icon: ShieldAlert, color: '#ff4d4f', label: 'Critical' },
  warning: { icon: TriangleAlert, color: '#fbbf24', label: 'Warning' },
  success: { icon: CircleCheck, color: '#6ee7b7', label: 'Success' },
  deployment: { icon: Rocket, color: '#8b5cf6', label: 'Deploy' },
  recovery: { icon: Undo2, color: '#60a5fa', label: 'Recovery' },
  info: { icon: Info, color: '#9aa1ad', label: 'Info' },
}

const KINDS = Object.keys(META) as NotificationKind[]

type Filter = 'all' | NotificationKind

type Perm = 'default' | 'granted' | 'denied' | 'unsupported'

export function AlertsPage() {
  const { data, isLoading } = useInfra()
  const accessToken = useAuth((state) => state.accessToken)
  const remoteAlerts = useQuery({
    queryKey: ['alerts'],
    enabled: apiMode === 'production' && Boolean(accessToken),
    queryFn: () => fetchAlerts(accessToken!),
    refetchInterval: 10_000,
  })
  const markRead = useMarkNotificationsRead()
  const now = useClock().getTime()

  const [filter, setFilter] = useState<Filter>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [perm, setPerm] = useState<Perm>('default')

  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof Notification === 'undefined') setPerm('unsupported')
    else setPerm(Notification.permission as Perm)
  }, [])

  const items = useMemo<AppNotification[]>(() => {
    if (apiMode !== 'production') return data?.notifications ?? []
    return (remoteAlerts.data?.alerts ?? []).map((alert) => ({
      id: alert.id,
      kind: alert.kind === 'command_failed' ? 'critical' : 'warning',
      title: alert.title,
      body: alert.details.message
        ?? (alert.kind === 'service_offline' ? `${alert.details.name ?? 'Service'} is not running.`
          : alert.kind === 'host_resource_high' ? `CPU ${alert.details.cpu ?? 0}% · RAM ${alert.details.ram ?? 0}% · Disk ${alert.details.disk ?? 0}%`
            : alert.details.lastSeenAt ? `Last seen: ${new Date(alert.details.lastSeenAt).toLocaleString()}` : 'The agent has not sent a recent heartbeat.'),
      ts: alert.openedAt,
      read: alert.status === 'resolved',
      serviceId: alert.serviceId ?? undefined,
    }))
  }, [data, remoteAlerts.data])

  // Fire a desktop notification for freshly-arrived critical/warning alerts.
  useEffect(() => {
    if (perm !== 'granted') {
      items.forEach((n) => seenIds.current.add(n.id)) // don't backfire once granted
      return
    }
    for (const n of items) {
      if (seenIds.current.has(n.id)) continue
      seenIds.current.add(n.id)
      if (n.kind === 'critical' || n.kind === 'warning') {
        new Notification(`${META[n.kind].label}: ${n.title}`, { body: n.body, tag: n.id })
      }
    }
  }, [items, perm])

  if (isLoading || (apiMode === 'production' && remoteAlerts.isLoading) || !data) return <PageSkeleton />
  if (remoteAlerts.isError) return <p className="text-danger">Could not load alerts.</p>

  const requestPerm = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPerm(p as Perm)
  }

  const counts = KINDS.reduce<Record<string, number>>(
    (a, k) => ({ ...a, [k]: items.filter((n) => n.kind === k).length }),
    {},
  )
  const unreadCount = items.filter((n) => !n.read).length

  const visible = items.filter((n) => {
    if (filter !== 'all' && n.kind !== filter) return false
    if (unreadOnly && n.read) return false
    return true
  })

  const serviceName = (id?: string) => data.services.find((s) => s.id === id)?.name

  return (
    <Section
      title="Alerts"
      subtitle={`${items.length} notifications · ${unreadCount} unread`}
      action={
        <div className="flex items-center gap-2">
          {perm !== 'granted' && (
            <Button
              size="sm"
              variant="outline"
              onClick={requestPerm}
              disabled={perm === 'unsupported' || perm === 'denied'}
              title={
                perm === 'denied'
                  ? 'Desktop notifications blocked in browser settings'
                  : perm === 'unsupported'
                    ? 'Not supported in this browser'
                    : 'Enable desktop notifications'
              }
            >
              <MonitorSmartphone className="h-3.5 w-3.5" />
              {perm === 'denied' ? 'Blocked' : 'Desktop alerts'}
            </Button>
          )}
          {apiMode === 'demo' && <Button
            size="sm"
            variant="surface"
            onClick={() => markRead.mutate()}
            disabled={unreadCount === 0 || markRead.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>}
        </div>
      }
    >
      {/* Category filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} color="#9aa1ad">
          All {items.length}
        </FilterChip>
        {KINDS.filter((k) => counts[k] > 0).map((k) => (
          <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)} color={META[k].color}>
            {META[k].label} {counts[k]}
          </FilterChip>
        ))}
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            'ml-auto rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
            unreadOnly
              ? 'border-accent/40 bg-accent/12 text-accent'
              : 'border-border bg-surface-2 text-fg-muted hover:text-fg',
          )}
        >
          Unread only
        </button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
        {visible.length === 0 ? (
          <div className="grid place-items-center px-4 py-16 text-center text-[13px] text-fg-faint">
            <BellRing className="mb-2 h-6 w-6 opacity-50" />
            {unreadOnly ? 'No unread notifications.' : 'No notifications in this category.'}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map((n) => (
              <AlertRow key={n.id} n={n} now={now} service={serviceName(n.serviceId)} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </Section>
  )
}

function FilterChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[12px] font-medium transition-all',
        active ? 'text-fg' : 'text-fg-muted hover:text-fg',
      )}
      style={{
        borderColor: active ? `${color}66` : 'var(--color-border)',
        backgroundColor: active ? `${color}1f` : 'var(--color-surface-2)',
      }}
    >
      {children}
    </button>
  )
}

function AlertRow({ n, now, service }: { n: AppNotification; now: number; service?: string }) {
  const m = META[n.kind]
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn(
        'flex gap-3 border-b border-border-soft px-5 py-3.5 last:border-0 hover:bg-surface-2/50',
        !n.read && 'bg-surface-2/25',
      )}
    >
      <span
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `${m.color}1a`, color: m.color }}
      >
        <m.icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-fg">{n.title}</span>
          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
        </div>
        <div className="mt-0.5 text-[12.5px] text-fg-muted">{n.body}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-faint">
          <span style={{ color: m.color }}>{m.label}</span>
          {service && (
            <>
              <span>·</span>
              <span>{service}</span>
            </>
          )}
          <span>·</span>
          <span>{relativeTime(n.ts, now)}</span>
        </div>
      </div>
    </motion.div>
  )
}
