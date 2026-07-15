import { NavLink, useNavigate } from 'react-router-dom'
import { Bell, Search, Wifi } from 'lucide-react'
import { useUI } from '@/stores/ui'
import { useInfra } from '@/hooks/useInfra'
import { useAuth } from '@/stores/auth'
import { logout } from '@/services/auth'

export function Topbar() {
  const setCommandOpen = useUI((s) => s.setCommandOpen)
  const { data } = useInfra()
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)
  const clearSession = useAuth((state) => state.clearSession)

  const online = data ? data.summary.offline === 0 : true

  function signOut() {
    clearSession()
    void logout().finally(() => navigate('/login'))
  }

  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/50 px-5 backdrop-blur-xl">
      {/* Search */}
      <button
        onClick={() => setCommandOpen(true)}
        title="Search services and pages"
        className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2.5 rounded-xl border border-border bg-surface-2/70 px-0 text-left text-fg-faint transition-colors hover:border-fg-faint sm:w-72 sm:justify-start sm:px-3"
      >
        <Search className="h-4 w-4" />
        <span className="hidden text-[13px] sm:inline">Search services and pages…</span>
        <kbd className="ml-auto hidden rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* Connection */}
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-2/70 px-2.5 py-1.5 md:flex">
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ backgroundColor: online ? '#6ee7b7' : '#ff4d4f' }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: online ? '#6ee7b7' : '#ff4d4f' }}
            />
          </span>
          <Wifi className="h-3.5 w-3.5 text-fg-faint" />
          <span className="text-[12px] text-fg-muted">{online ? 'Connected' : 'Degraded'}</span>
        </div>

        <NavLink to="/alerts" title="Alerts" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface-2/70 text-fg-muted transition-colors hover:text-fg"><Bell className="h-[18px] w-[18px]" /></NavLink>

        {/* User */}
        <button onClick={signOut} title="Sign out" className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/70 py-1 pl-1 pr-3 transition-colors hover:border-fg-faint">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-purple/40 to-accent/30 text-[12px] font-bold text-fg">
            {user?.email.slice(0, 1).toUpperCase() ?? 'D'}
          </span>
          <span className="hidden text-[13px] font-medium text-fg-muted sm:block">{user?.email.split('@')[0] ?? 'danil'}</span>
        </button>
      </div>
    </header>
  )
}
