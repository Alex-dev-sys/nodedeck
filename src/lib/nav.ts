import {
  Activity,
  Bell,
  Boxes,
  LayoutDashboard,
  ScrollText,
  Settings,
  Server,
  ClipboardList,
  CreditCard,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  group: 'main' | 'services' | 'ops'
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'main' },
  { to: '/infrastructure', label: 'Services', icon: Boxes, group: 'main' },
  { to: '/monitoring', label: 'Monitoring', icon: Activity, group: 'main' },
  { to: '/alerts', label: 'Alerts', icon: Bell, group: 'ops' },
  { to: '/logs', label: 'Logs', icon: ScrollText, group: 'ops' },
  { to: '/commands', label: 'Commands', icon: ClipboardList, group: 'ops' },
  { to: '/agents', label: 'Servers', icon: Server, group: 'ops' },
  { to: '/settings', label: 'Notifications', icon: Settings, group: 'ops' },
  { to: '/billing', label: 'Plan & billing', icon: CreditCard, group: 'ops' },
]

export const GROUP_LABEL: Record<NavItem['group'], string> = {
  main: 'Overview',
  services: 'Services',
  ops: 'Tools',
}
