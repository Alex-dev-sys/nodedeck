import { Play, RotateCw, Square } from 'lucide-react'
import type { Service, ServiceAction } from '@/types'
import { useServiceAction } from '@/hooks/useInfra'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useToasts } from '@/stores/toasts'

export function ServiceActions({
  service,
  size = 'sm',
  className,
}: {
  service: Service
  size?: 'sm' | 'md'
  className?: string
}) {
  const action = useServiceAction()
  const pushToast = useToasts((state) => state.push)
  const busy = service.status === 'restarting'
  const down = service.status === 'offline'

  if (service.protected) {
    return <span className={cn('rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning', className)}>Protected</span>
  }

  if (!service.managed) {
    return <span className={cn('rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] text-fg-faint', className)}>Monitor only</span>
  }

  if (service.controlEnabled === false) {
    return <span className={cn('rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] text-fg-faint', className)}>Control locked</span>
  }

  const run = (a: ServiceAction) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (a === 'stop' && !window.confirm(`Stop ${service.name}? The service will remain unavailable until it is started again.`)) return
    action.mutate(
      { id: service.id, action: a },
      {
        onSuccess: () => pushToast({ title: `${service.name}: ${a} queued`, message: 'The agent will execute it and report the real result.', tone: 'success' }),
        onError: (error) => pushToast({ title: `${service.name}: ${a} unavailable`, message: error instanceof Error ? error.message : 'The requested action could not be completed.', tone: 'error' }),
      },
    )
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {down ? (
        <Button size={size} variant="primary" onClick={run('start')} disabled={busy}>
          <Play className="h-4 w-4" /> Start
        </Button>
      ) : (
        <Button size={size} variant="surface" onClick={run('restart')} disabled={busy}>
          <RotateCw className={cn('h-4 w-4', busy && 'animate-spin')} />
          {busy ? 'Restarting' : 'Restart'}
        </Button>
      )}
      <Button
        size={size === 'md' ? 'md' : 'icon'}
        variant="ghost"
        onClick={run('stop')}
        disabled={down || busy}
        aria-label="Stop"
        title="Stop"
      >
        <Square className="h-4 w-4" />
        {size === 'md' && 'Stop'}
      </Button>
    </div>
  )
}
