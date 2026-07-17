import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Cpu, MemoryStick } from 'lucide-react'
import { useInfra } from '@/hooks/useInfra'
import { PanelHeader } from '@/components/service/PanelHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { LogStream } from '@/components/logs/LogStream'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { formatUptime, pct } from '@/lib/utils'
import { fetchLogs } from '@/services/operations'
import { useAuth } from '@/stores/auth'

export function ManagedServicePage() {
  const { serviceId = '' } = useParams()
  const { data, isLoading } = useInfra()
  const accessToken = useAuth((state) => state.accessToken)
  const service = data?.services.find((item) => item.id === serviceId)
  const logs = useQuery({
    queryKey: ['service-logs', serviceId],
    queryFn: () => fetchLogs(accessToken!, serviceId),
    enabled: Boolean(accessToken && serviceId),
    refetchInterval: 10_000,
  })

  if (isLoading || !data) return <PageSkeleton />
  if (!service) return <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-fg-muted">This service is no longer reported by a connected server.</div>

  return <div className="space-y-6">
    <PanelHeader service={service} tagline={service.composeProject ? `Docker Compose · ${service.composeProject}` : service.kind === 'systemd' ? 'systemd service' : service.kind === 'launchd' ? 'macOS LaunchAgent' : service.kind === 'pm2' ? 'PM2 process' : 'Docker container'} />

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="mb-4 text-[13px] font-semibold text-fg">Live usage</h2>
          <div className="space-y-4"><Meter label="CPU" value={service.metrics.cpu} icon={<Cpu className="h-4 w-4" />} /><Meter label="RAM" value={service.metrics.ram} icon={<MemoryStick className="h-4 w-4" />} /></div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Details" subtitle="reported by the agent" />
          <div className="text-[13px]">
            <Row label="Uptime" value={formatUptime(service.uptimeSec)} />
            <Row label="Restarts" value={String(service.restartCount)} />
            <Row label="Runtime" value={service.runtimeState || 'unknown'} />
            <Row label="Healthcheck" value={service.healthStatus || 'not configured'} />
            <Row label="Source" value={service.kind} />
            {service.kind === 'docker' && !service.composeProject && <Row label="Container" value={service.container ? service.container.slice(0, 12) : '—'} mono />}
            {service.composeService && <Row label="Compose service" value={service.composeService} />}
            {(service.ports?.length ?? 0) > 0 && <Row label="Ports" value={service.ports!.join(', ')} mono />}
            {service.protected && <Row label="Control" value="Protected" />}
            {!service.managed && !service.protected && <Row label="Control" value="Monitoring only" />}
          </div>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader title="Recent logs" subtitle="refreshes every 10 seconds" />
        <div className="p-4 pt-3">{logs.isError ? <p className="text-sm text-danger">Logs are temporarily unavailable.</p> : <LogStream lines={logs.data?.logs ?? []} />}</div>
      </Card>
    </div>
  </div>
}

function Meter({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div><div className="mb-2 flex items-center justify-between text-[12px]"><span className="flex items-center gap-2 text-fg-muted">{icon}{label}</span><span className="font-mono text-fg">{pct(value)}</span></div><ProgressBar value={value} height={6} /></div>
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-t border-border-soft px-5 py-3 first:border-t-0"><span className="text-fg-faint">{label}</span><span className={`min-w-0 truncate text-right text-fg-muted ${mono ? 'font-mono' : ''}`} title={value}>{value}</span></div>
}
