import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section'
  inset?: boolean
}

export function Card({ className, inset, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-[var(--radius-card)] border border-border bg-surface',
        'shadow-[var(--shadow-card)]',
        inset && 'bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg truncate">{title}</div>
          {subtitle && (
            <div className="text-xs text-fg-faint mt-0.5 truncate">{subtitle}</div>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}
