import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import type { Service } from '@/types'
import { kindIcon, statusMeta } from '@/lib/serviceMeta'
import { StatusDot } from '@/components/ui/StatusDot'
import { Badge } from '@/components/ui/Badge'
import { ServiceActions } from '@/components/infrastructure/ServiceActions'

/** Shared header for the per-service deep panels. */
export function PanelHeader({ service, tagline }: { service: Service; tagline: string }) {
  const Icon = kindIcon[service.kind]
  const meta = statusMeta[service.status]
  return (
    <div className="space-y-4">
      <Link
        to="/infrastructure"
        className="inline-flex items-center gap-1 text-[12px] text-fg-faint transition-colors hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Services
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
          style={{ backgroundColor: `${meta.hex}18`, color: meta.hex }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-xl font-semibold text-fg">{service.name}</h1>
            <StatusDot status={service.status} />
            <Badge color={meta.hex}>{meta.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-faint">
            <span>{tagline}</span>
            <span>·</span>
            <span className="max-w-md truncate font-mono" title={service.version}>{service.version}</span>
            <span>·</span>
            <span className="font-mono">{service.hostname}</span>
          </div>
        </div>
        <ServiceActions service={service} size="md" />
      </div>
    </div>
  )
}
