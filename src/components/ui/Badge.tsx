import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Badge({
  children,
  color = '#9aa1ad',
  soft = true,
  className,
}: {
  children: ReactNode
  color?: string
  soft?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none',
        className,
      )}
      style={{
        color,
        backgroundColor: soft ? `${color}18` : 'transparent',
        border: `1px solid ${color}2a`,
      }}
    >
      {children}
    </span>
  )
}
