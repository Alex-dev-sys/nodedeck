import { useMemo, useState } from 'react'
import {
  Activity,
  Boxes,
  Gauge,
  Heart,
  MessageSquare,
  Send,
  Timer,
  TriangleAlert,
  Users,
} from 'lucide-react'
import type { Service } from '@/types'
import { useInfra } from '@/hooks/useInfra'
import { useClock } from '@/hooks/useClock'
import { minecraftDetail } from '@/services/serviceDetail'
import { PanelHeader } from '@/components/service/PanelHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { Badge } from '@/components/ui/Badge'
import { LogStream } from '@/components/logs/LogStream'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { severityMeta } from '@/lib/serviceMeta'
import { formatDuration, relativeTime } from '@/lib/utils'

function tpsColor(tps: number) {
  if (tps >= 19.5) return '#6ee7b7'
  if (tps >= 15) return '#fbbf24'
  return '#ff4d4f'
}

export function MinecraftPage() {
  const { data, isLoading } = useInfra()
  const now = useClock().getTime()
  const service = data?.services.find((s) => s.id === 'minecraft')
  const detail = useMemo(() => (service ? minecraftDetail(service) : null), [service])

  if (isLoading || !data || !service || !detail) return <PageSkeleton />

  const incidents = data.incidents.filter((i) => i.serviceId === 'minecraft')

  return (
    <div className="space-y-6">
      <PanelHeader service={service} tagline="Paper survival server" />

      {/* Vitals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Players"
          value={`${detail.playersOnline}/${detail.playersMax}`}
          icon={<Users className="h-3.5 w-3.5" />}
        />
        <Metric
          label="TPS"
          value={detail.tps.toFixed(1)}
          accent={tpsColor(detail.tps)}
          icon={<Gauge className="h-3.5 w-3.5" />}
          sub="target 20.0"
        />
        <Metric
          label="MSPT"
          value={`${detail.mspt}ms`}
          accent={detail.mspt > 50 ? '#fbbf24' : undefined}
          icon={<Timer className="h-3.5 w-3.5" />}
        />
        <Metric label="Entities" value={detail.entities.toLocaleString()} icon={<Boxes className="h-3.5 w-3.5" />} />
        <Metric label="Chunks" value={detail.loadedChunks.toLocaleString()} icon={<Activity className="h-3.5 w-3.5" />} />
        <Metric label="World" value={`${detail.worldSizeGb} GB`} sub={detail.difficulty} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Players */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Players online"
            subtitle={`${detail.playersOnline} connected`}
            icon={
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/12 text-accent">
                <Users className="h-[18px] w-[18px]" />
              </span>
            }
          />
          <div className="mt-2 overflow-x-auto">
            {detail.players.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-fg-faint">No players online.</div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-border-soft text-left text-[11px] uppercase tracking-wide text-fg-faint">
                    <th className="px-5 py-2 font-medium">Player</th>
                    <th className="px-2 py-2 font-medium">Mode</th>
                    <th className="px-2 py-2 font-medium">Dimension</th>
                    <th className="px-2 py-2 font-medium">Health</th>
                    <th className="px-2 py-2 font-medium">Playtime</th>
                    <th className="px-5 py-2 text-right font-medium">Ping</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.players.map((p) => (
                    <tr key={p.name} className="border-b border-border-soft last:border-0 hover:bg-surface-2/50">
                      <td className="px-5 py-2.5 font-medium text-fg">{p.name}</td>
                      <td className="px-2 py-2.5 text-fg-muted">{p.gamemode}</td>
                      <td className="px-2 py-2.5 text-fg-muted">{p.dimension}</td>
                      <td className="px-2 py-2.5">
                        <span className="inline-flex items-center gap-1 text-fg-muted">
                          <Heart className="h-3 w-3 text-danger" /> {p.health}/20
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-fg-muted">{formatDuration(p.playtimeMin * 60)}</td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums text-fg-muted">{p.ping}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Chat + world */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Server chat"
              icon={
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple/12 text-purple">
                  <MessageSquare className="h-[18px] w-[18px]" />
                </span>
              }
            />
            <div className="space-y-2 p-5 pt-3 text-[13px]">
              {detail.chat.map((c, i) => (
                <div key={i}>
                  <span className={c.name === 'Server' ? 'text-fg-faint italic' : 'font-medium text-accent'}>
                    {c.name === 'Server' ? '' : `<${c.name}> `}
                  </span>
                  <span className={c.name === 'Server' ? 'text-fg-faint italic' : 'text-fg-muted'}>{c.text}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-[13px] font-semibold text-fg">World</div>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-fg-faint">Seed</span>
                <span className="font-mono text-fg-muted">{detail.seed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-faint">Difficulty</span>
                <span className="text-fg-muted">{detail.difficulty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-faint">Size on disk</span>
                <span className="text-fg-muted">{detail.worldSizeGb} GB</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Console */}
      <ConsoleCard service={service} />

      {/* Crash history */}
      <Card>
        <CardHeader
          title="Crash history"
          subtitle={incidents.length ? `${incidents.length} incidents` : 'no incidents on record'}
          icon={
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-danger/12 text-danger">
              <TriangleAlert className="h-[18px] w-[18px]" />
            </span>
          }
        />
        <div className="mt-2">
          {incidents.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-fg-faint">
              No crashes recorded. Trigger one from the topology map to see it here.
            </div>
          ) : (
            incidents.map((inc) => {
              const sev = severityMeta[inc.severity]
              return (
                <div
                  key={inc.id}
                  className="flex items-center gap-3 border-b border-border-soft px-5 py-3 last:border-0"
                >
                  <Badge color={sev.hex}>{sev.label}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{inc.title}</div>
                    <div className="truncate text-[12px] text-fg-faint">{inc.rootCause}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-fg-faint">
                    <div>{relativeTime(inc.startedAt, now)}</div>
                    <div>{inc.resolved ? 'resolved' : 'open'}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}

function ConsoleCard({ service }: { service: Service }) {
  const [cmd, setCmd] = useState('')
  return (
    <Card>
      <CardHeader
        title="Live console"
        subtitle="RCON · read-only demo"
        icon={
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-info/12 text-info">
            <Activity className="h-[18px] w-[18px]" />
          </span>
        }
      />
      <div className="p-4 pt-3">
        <LogStream lines={service.recentLogs} />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setCmd('')
          }}
          className="mt-3 flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-[10px] border border-border bg-[#0b0c10] px-3">
            <span className="font-mono text-[13px] text-accent">/</span>
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="say Hello, or restart… (demo — not sent)"
              className="h-9 w-full bg-transparent font-mono text-[13px] text-fg outline-none placeholder:text-fg-faint"
            />
          </div>
          <button
            type="submit"
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-surface-2 text-fg-muted transition-colors hover:text-fg"
            aria-label="Send command"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Card>
  )
}
