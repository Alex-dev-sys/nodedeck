import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Color ramps green→amber→red as value rises, unless a color is forced. */
function ramp(v: number): string {
  if (v >= 88) return '#ff4d4f'
  if (v >= 72) return '#fbbf24'
  return '#6ee7b7'
}

export function ProgressBar({
  value,
  color,
  height = 6,
  className,
  track = true,
}: {
  value: number
  color?: string
  height?: number
  className?: string
  track?: boolean
}) {
  const c = color ?? ramp(value)
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full', className)}
      style={{ height, background: track ? 'rgba(255,255,255,0.05)' : 'transparent' }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${c}bb, ${c})`, boxShadow: `0 0 10px ${c}66` }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 26 }}
      />
    </div>
  )
}
