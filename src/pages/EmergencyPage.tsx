import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CircleCheck,
  MessageCircle,
  OctagonAlert,
  Send,
  ShieldAlert,
  Siren,
  X,
} from 'lucide-react'
import { useInfra, usePanic, useSimulateCrash } from '@/hooks/useInfra'
import { kindIcon, statusMeta } from '@/lib/serviceMeta'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatusDot } from '@/components/ui/StatusDot'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export function EmergencyPage() {
  const { data, isLoading } = useInfra()
  const panic = usePanic()
  const crash = useSimulateCrash()
  const [armed, setArmed] = useState(false)

  if (isLoading || !data) return <PageSkeleton />

  const affected = data.services.filter(
    (s) => s.status === 'offline' || s.status === 'restarting' || s.status === 'degraded',
  )
  const down = data.services.filter((s) => s.status === 'offline')
  const healthy = data.services.filter((s) => s.status === 'healthy')
  const canPanic = down.length > 0
  const critical = down.length > 0
  const glow = critical ? '#ff4d4f' : '#fbbf24'

  const fire = () => {
    if (!canPanic) return
    setArmed(false)
    panic.mutate()
  }

  return (
    <div className="space-y-6">
      {/* PANIC console */}
      <Card className="overflow-hidden">
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(48rem 22rem at 50% 0%, ${glow}18, transparent 65%)` }}
          animate={critical ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.5 }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        <div className="relative flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[12px] text-fg-muted">
            <Siren className="h-3.5 w-3.5" style={{ color: glow }} />
            {critical
              ? `${down.length} service${down.length > 1 ? 's' : ''} offline`
              : affected.length
                ? `${affected.length} service${affected.length > 1 ? 's' : ''} degraded`
                : 'All systems nominal'}
          </div>

          <h1 className="text-[26px] font-bold tracking-tight text-fg lg:text-[30px]">
            Emergency Recovery
          </h1>
          <p className="mt-2 max-w-md text-[13.5px] text-fg-muted">
            Restarts every offline service in parallel and flags related incidents as
            auto-recovered. Notification delivery is simulated in this preview.
          </p>

          <div className="mt-7 min-h-[3rem]">
            <AnimatePresence mode="wait">
              {panic.isPending ? (
                <motion.div
                  key="firing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-[14px] font-medium text-danger"
                >
                  <Siren className="h-5 w-5 animate-pulse" />
                  Recovering the fleet…
                </motion.div>
              ) : armed && canPanic ? (
                <motion.div
                  key="armed"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5"
                >
                  <Button variant="danger" size="md" onClick={fire}>
                    <OctagonAlert className="h-4 w-4" />
                    Confirm — recover {down.length} now
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => setArmed(false)}>
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </motion.div>
              ) : canPanic ? (
                <motion.button
                  key="idle"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setArmed(true)}
                  className="inline-flex items-center gap-2.5 rounded-2xl bg-danger px-8 py-4 text-lg font-bold text-white shadow-[0_10px_40px_-10px_rgba(255,77,79,0.7)] outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-danger/60"
                >
                  <Siren className="h-6 w-6" />
                  PANIC
                </motion.button>
              ) : (
                <div className="text-[13px] text-fg-faint">No offline services to recover.</div>
              )}
            </AnimatePresence>
          </div>

          {/* Result */}
          <AnimatePresence>
            {panic.isSuccess && !panic.isPending && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 w-full max-w-md rounded-[var(--radius-md)] border border-accent/30 bg-accent/8 p-4 text-left"
              >
                <div className="flex items-center gap-2 text-[14px] font-semibold text-accent">
                  <CircleCheck className="h-4.5 w-4.5" />
                  Recovery complete — {panic.data?.recovered ?? 0} service
                  {(panic.data?.recovered ?? 0) === 1 ? '' : 's'} back online
                </div>
                <div className="mt-3 space-y-1.5 text-[12px] text-fg-muted">
                  <AlertLog icon={<Send className="h-3.5 w-3.5" />} text="Telegram alert sent · @danil notified" />
                  <AlertLog icon={<MessageCircle className="h-3.5 w-3.5" />} text="Discord alert sent · #alerts notified" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* Fleet status */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(280px,340px)]">
        {/* Affected services */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-fg">
              <ShieldAlert className="h-4 w-4 text-fg-faint" />
              Affected services
            </div>
            {affected.length ? (
              <Badge color="#ff4d4f">{affected.length} affected</Badge>
            ) : (
              <Badge color="#6ee7b7">all healthy</Badge>
            )}
          </div>

          {affected.length === 0 ? (
            <div className="grid place-items-center rounded-[var(--radius-md)] border border-border-soft bg-surface-2/50 py-10 text-center">
              <CircleCheck className="mb-2 h-7 w-7 text-accent" />
              <p className="text-[13px] font-medium text-fg">Nothing to recover</p>
              <p className="mt-0.5 max-w-xs text-[12px] text-fg-faint">
                Every service is healthy. Simulate an outage to try emergency recovery.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {affected.map((s) => {
                const Icon = kindIcon[s.kind]
                const meta = statusMeta[s.status]
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border-soft bg-surface-2/50 px-3.5 py-2.5"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                      style={{ backgroundColor: `${meta.hex}16`, color: meta.hex }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-[13px] font-medium text-fg">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-[12px]" style={{ color: meta.hex }}>
                      <StatusDot status={s.status} size={7} />
                      {meta.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Readiness + simulate */}
        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold text-fg">Fleet readiness</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Tally value={healthy.length} label="Healthy" tone="#6ee7b7" />
            <Tally value={affected.length - down.length} label="Degraded" tone="#fbbf24" />
            <Tally value={down.length} label="Offline" tone="#ff4d4f" />
          </div>

          <div className="mt-5 border-t border-border-soft pt-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">
              Simulate outage
            </div>
            <p className="mt-1 text-[12px] text-fg-faint">
              Crash a healthy service to test the recovery flow.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {healthy.slice(0, 5).map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="outline"
                  disabled={crash.isPending}
                  onClick={() => crash.mutate(s.id)}
                >
                  {s.name}
                </Button>
              ))}
              {healthy.length === 0 && (
                <span className="text-[12px] text-fg-faint">No healthy services to crash.</span>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function AlertLog({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-faint">{icon}</span>
      {text}
    </div>
  )
}

function Tally({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border-soft bg-surface-2/50 py-3">
      <div className="text-2xl font-semibold tabular-nums" style={{ color: value ? tone : undefined }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-fg-faint">{label}</div>
    </div>
  )
}
