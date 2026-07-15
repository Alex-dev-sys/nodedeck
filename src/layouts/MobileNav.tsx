import { NavLink } from 'react-router-dom'
import { Bell, Boxes, LayoutDashboard, ScrollText, Server } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/infrastructure', label: 'Services', icon: Boxes },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/agents', label: 'Servers', icon: Server },
]

export function MobileNav() {
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 grid h-[68px] grid-cols-5 border-t border-border bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cn(
            'flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-fg-faint transition-colors',
            isActive ? 'text-accent' : 'active:bg-surface-2 active:text-fg',
          )}
        >
          <Icon className="h-[19px] w-[19px]" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
