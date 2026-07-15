import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToasts, type ToastTone } from '@/stores/toasts'

const META: Record<ToastTone, { Icon: typeof Info; color: string }> = {
  success: { Icon: CheckCircle2, color: '#6ee7b7' },
  error: { Icon: XCircle, color: '#ff4d4f' },
  info: { Icon: Info, color: '#60a5fa' },
}

export function ToastViewport() {
  const items = useToasts((state) => state.items)
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((item) => <ToastItem key={item.id} id={item.id} title={item.title} message={item.message} tone={item.tone} />)}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ id, title, message, tone }: { id: string; title: string; message?: string; tone: ToastTone }) {
  const dismiss = useToasts((state) => state.dismiss)
  const { Icon, color } = META[tone]

  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), 4200)
    return () => clearTimeout(timer)
  }, [dismiss, id])

  return (
    <motion.div
      initial={{ opacity: 0, x: 18, y: -6 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 18, scale: 0.96 }}
      className="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface/95 p-3 shadow-[var(--shadow-pop)] backdrop-blur-xl"
    >
      <span className="mt-0.5" style={{ color }}><Icon className="h-4.5 w-4.5" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-fg">{title}</div>
        {message && <div className="mt-0.5 text-[12px] text-fg-muted">{message}</div>}
      </div>
      <button type="button" onClick={() => dismiss(id)} aria-label="Dismiss notification" className="text-fg-faint transition-colors hover:text-fg">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}
