import {
  Activity,
  Archive,
  Box,
  Container,
  Database,
  Globe,
  Grab,
  Network,
  Shield,
  ListTree,
  GitBranch,
  ServerCog,
  Workflow,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ServiceKind, ServiceStatus, Severity } from '@/types'

export const kindIcon: Record<ServiceKind, LucideIcon> = {
  minecraft: Box,
  openclaw: Grab,
  website: Globe,
  api: Webhook,
  postgres: Database,
  redis: Zap,
  nginx: Network,
  docker: Container,
  systemd: ServerCog,
  launchd: ServerCog,
  pm2: Workflow,
  backup: Archive,
  monitoring: Activity,
  vpn: Shield,
  storage: Archive,
  queue: ListTree,
  ci: GitBranch,
}

export interface StatusMeta {
  label: string
  /** css color token name (maps to --color-*) */
  token: 'accent' | 'warning' | 'danger' | 'info' | 'fg-faint'
  hex: string
}

export const statusMeta: Record<ServiceStatus, StatusMeta> = {
  healthy: { label: 'Healthy', token: 'accent', hex: '#6ee7b7' },
  degraded: { label: 'Degraded', token: 'warning', hex: '#fbbf24' },
  restarting: { label: 'Restarting', token: 'warning', hex: '#fbbf24' },
  updating: { label: 'Updating', token: 'info', hex: '#60a5fa' },
  offline: { label: 'Offline', token: 'danger', hex: '#ff4d4f' },
}

export const severityMeta: Record<Severity, { label: string; hex: string }> = {
  critical: { label: 'Critical', hex: '#ff4d4f' },
  high: { label: 'High', hex: '#fb923c' },
  medium: { label: 'Medium', hex: '#fbbf24' },
  low: { label: 'Low', hex: '#60a5fa' },
}
