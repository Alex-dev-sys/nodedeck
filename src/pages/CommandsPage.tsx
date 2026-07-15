import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Clock3 } from 'lucide-react'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { Section } from '@/components/ui/Section'
import { apiMode } from '@/services/api'
import { fetchCommands } from '@/services/operations'
import { useAuth } from '@/stores/auth'
import { relativeTime } from '@/lib/utils'

const statusColor: Record<string, string> = {
  queued: '#60a5fa', running: '#fbbf24', succeeded: '#6ee7b7', failed: '#ff4d4f', cancelled: '#9aa1ad', expired: '#9aa1ad',
}

export function CommandsPage() {
  const accessToken = useAuth((state) => state.accessToken)
  const query = useQuery({
    queryKey: ['commands'],
    enabled: apiMode === 'production' && Boolean(accessToken),
    queryFn: () => fetchCommands(accessToken!),
    refetchInterval: 5_000,
  })

  if (apiMode !== 'production') return <Section title="Commands" subtitle="Command history is available when connected to the production API."><Empty /></Section>
  if (query.isLoading) return <PageSkeleton />
  if (query.isError) return <p className="text-danger">Could not load command history.</p>
  const commands = query.data?.commands ?? []
  const now = Date.now()

  return <Section title="Commands" subtitle="Real lifecycle reported by connected agents.">
    {commands.length === 0 ? <Empty /> : <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      {commands.map((command) => <article key={command.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-soft px-5 py-4 last:border-0">
        <span className="min-w-24 font-medium text-fg">{command.serviceName}</span>
        <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-fg-muted">{command.action}</span>
        <span className="rounded-full border px-2.5 py-1 text-xs" style={{ color: statusColor[command.status], borderColor: `${statusColor[command.status]}55` }}>{command.status}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-faint"><Clock3 className="h-3.5 w-3.5" />{relativeTime(command.createdAt, now)}</span>
        {command.result?.message && <p className="basis-full font-mono text-xs text-fg-muted">{command.result.message}</p>}
      </article>)}
    </div>}
  </Section>
}

function Empty() {
  return <div className="grid place-items-center rounded-[var(--radius-card)] border border-border bg-surface px-4 py-16 text-center text-fg-faint"><div><ClipboardList className="mx-auto mb-2 h-6 w-6 opacity-50" /><p className="text-sm">No commands yet.</p></div></div>
}
