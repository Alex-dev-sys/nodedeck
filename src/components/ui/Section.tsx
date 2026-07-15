import type { ReactNode } from 'react'

export function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          {subtitle && <p className="text-[12px] text-fg-faint">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
