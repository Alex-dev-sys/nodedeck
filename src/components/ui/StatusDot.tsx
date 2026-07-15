import { motion } from 'framer-motion'
import type { ServiceStatus } from '@/types'
import { statusMeta } from '@/lib/serviceMeta'
import { cn } from '@/lib/utils'

export function StatusDot({
  status,
  size = 8,
  pulse = true,
}: {
  status: ServiceStatus
  size?: number
  pulse?: boolean
}) {
  const { hex } = statusMeta[status]
  const active = status !== 'offline'
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      {pulse && active && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: hex }}
          animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        className={cn('relative rounded-full', status === 'offline' && 'opacity-70')}
        style={{
          width: size,
          height: size,
          backgroundColor: hex,
          boxShadow: active ? `0 0 8px ${hex}` : 'none',
        }}
      />
    </span>
  )
}
