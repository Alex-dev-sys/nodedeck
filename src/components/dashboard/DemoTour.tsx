import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CircleCheck, X } from 'lucide-react'
import { useUI } from '@/stores/ui'

const STEPS = [
  { title: 'Database outage', body: 'PostgreSQL is offline. The dashboard has already opened an incident and recorded the event.', to: '/' },
  { title: 'Dependency impact', body: 'Select PostgreSQL on the topology map to highlight the API, Website, OpenClaw and Backup cascade.', to: '/' },
  { title: 'Incident context', body: 'Review root cause, downtime and recovery history before taking action.', to: '/incidents' },
  { title: 'Recover the service', body: 'Use Emergency Recovery or start PostgreSQL from its service drawer. The dependency chain returns to healthy.', to: '/emergency' },
] as const

export function DemoTour() {
  const open = useUI((state) => state.demoTourOpen)
  const index = useUI((state) => state.demoTourStep)
  const setIndex = useUI((state) => state.setDemoTourStep)
  const onClose = useUI((state) => state.closeDemoTour)
  const navigate = useNavigate()
  if (!open) return null
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const move = (next: number) => {
    setIndex(next)
    navigate(STEPS[next].to)
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[70] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface/95 shadow-[var(--shadow-pop)] backdrop-blur-xl">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-fg-faint">Guided demo · {index + 1}/{STEPS.length}</div>
          <h2 className="mt-0.5 text-[14px] font-semibold text-fg">{step.title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close guided demo" className="text-fg-faint transition-colors hover:text-fg"><X className="h-4 w-4" /></button>
      </div>
      <p className="px-4 py-3 text-[13px] leading-relaxed text-fg-muted">{step.body}</p>
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <button type="button" disabled={index === 0} onClick={() => move(index - 1)} className="inline-flex items-center gap-1 text-[12px] text-fg-faint transition-colors hover:text-fg disabled:opacity-35">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        {last ? (
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-[#04150e]">
            <CircleCheck className="h-3.5 w-3.5" /> Done
          </button>
        ) : (
          <button type="button" onClick={() => move(index + 1)} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </aside>
  )
}
