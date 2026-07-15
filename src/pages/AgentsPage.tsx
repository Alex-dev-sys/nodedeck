import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Plus, Server, Trash2, Wifi, X } from 'lucide-react'
import { useState } from 'react'
import { buildAgentInstallCommand } from '@/services/agentInstall'
import { useAuth } from '@/stores/auth'

interface Agent {
  id: string
  name: string
  hostname: string
  lastSeenAt: string | null
  createdAt: string
  hostCpu: number | null
  hostRam: number | null
  hostDisk: number | null
  hostUptimeSec: number | null
}

interface Enrollment {
  id: string
  token: string
  expiresAt: string
}

export function AgentsPage() {
  const token = useAuth((state) => state.accessToken)
  const role = useAuth((state) => state.user?.role)
  const queryClient = useQueryClient()
  const [enrollmentName, setEnrollmentName] = useState('')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [copied, setCopied] = useState(false)
  const [showEnrollment, setShowEnrollment] = useState(false)
  const query = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await fetch('/api/v1/agents', { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Could not load agents.')
      return response.json() as Promise<{ agents: Agent[]; serverTimeMs: number }>
    },
    refetchInterval: 10_000,
  })
  const revoke = useMutation({
    mutationFn: async (agentId: string) => {
      const response = await fetch(`/api/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Could not revoke agent access.')
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })
  const enroll = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch('/api/v1/agent-enrollments', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error('Could not create an enrollment token.')
      return response.json() as Promise<{ enrollment: Enrollment }>
    },
    onSuccess: (data) => { setEnrollment(data.enrollment); setCopied(false) },
  })

  if (query.isLoading) return <p className="text-fg-muted">Loading agents…</p>
  if (query.isError) return <p className="text-danger">{query.error.message}</p>
  if (!query.data) return null
  const { agents, serverTimeMs: now } = query.data
  const canRevoke = role === 'owner' || role === 'admin'

  const controlUrl = typeof window === 'undefined' ? '' : window.location.origin
  const command = enrollment ? buildAgentInstallCommand(enrollment.token, controlUrl) : ''

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-fg">Servers</h1><p className="mt-1 text-sm text-fg-muted">One lightweight agent finds Docker, systemd and PM2 projects automatically.</p></div>
      {canRevoke && <button onClick={() => { setEnrollment(null); setEnrollmentName(''); setShowEnrollment(true) }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-[#04150e]"><Plus className="h-4 w-4" />Add server</button>}
    </div>
    {revoke.isError && <p className="mt-4 text-sm text-danger">{revoke.error.message}</p>}
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {agents.map((agent) => {
        const online = agent.lastSeenAt && now - Date.parse(agent.lastSeenAt) < 60_000
        return <article key={agent.id} className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent"><Server className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-fg">{agent.name}</h2><p className="truncate text-sm text-fg-muted">{agent.hostname}</p></div>
            {canRevoke && <button
              disabled={revoke.isPending}
              onClick={() => { if (window.confirm(`Revoke ${agent.name}? The host will no longer be able to report or execute commands.`)) revoke.mutate(agent.id) }}
              title="Revoke agent access"
              className="rounded-lg border border-danger/30 p-2 text-danger hover:bg-danger/10 disabled:opacity-50"
            ><Trash2 className="h-4 w-4" /></button>}
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm"><Wifi className="h-4 w-4" style={{ color: online ? '#6ee7b7' : '#ff4d4f' }} /><span className={online ? 'text-accent' : 'text-danger'}>{online ? 'Online' : 'Offline'}</span><span className="text-fg-faint">· {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleTimeString() : 'Never seen'}</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs text-fg-muted"><span>CPU <b className="text-fg">{agent.hostCpu ?? 0}%</b></span><span>RAM <b className="text-fg">{agent.hostRam ?? 0}%</b></span><span>Disk <b className="text-fg">{agent.hostDisk ?? 0}%</b></span></div>
        </article>
      })}
    </div>
    {canRevoke && showEnrollment && !enrollment && <EnrollmentDialog name={enrollmentName} setName={setEnrollmentName} submit={() => enroll.mutate(enrollmentName)} pending={enroll.isPending} error={enroll.error?.message} close={() => setShowEnrollment(false)} />}
    {canRevoke && enrollment && <EnrollmentResult enrollment={enrollment} command={command} copied={copied} copy={async () => { await navigator.clipboard.writeText(command); setCopied(true) }} close={() => { setEnrollment(null); setShowEnrollment(false) }} />}
  </div>
}

function EnrollmentDialog({ name, setName, submit, pending, error, close }: { name: string; setName: (value: string) => void; submit: () => void; pending: boolean; error?: string; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><form onSubmit={(event) => { event.preventDefault(); submit() }} className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-fg">Enroll agent</h2><button type="button" onClick={close} aria-label="Close" className="text-fg-faint hover:text-fg"><X className="h-5 w-5" /></button></div><p className="mt-2 text-sm text-fg-muted">Create a one-time token that expires in one hour.</p><label className="mt-5 block text-sm text-fg-muted">Agent name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="macbook-prod" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-fg outline-none focus:border-accent" /></label>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<button disabled={pending || !name.trim()} className="mt-5 h-10 w-full rounded-lg bg-accent font-semibold text-[#04150e] disabled:opacity-50">{pending ? 'Creating…' : 'Create token'}</button></form></div>
}

function EnrollmentResult({ enrollment, command, copied, copy, close }: { enrollment: Enrollment; command: string; copied: boolean; copy: () => Promise<void>; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-fg">Connect this server with one command</h2><button onClick={close} aria-label="Close" className="text-fg-faint hover:text-fg"><X className="h-5 w-5" /></button></div><p className="mt-2 text-sm text-warning">Copy this one line into Terminal. NodeDeck installs in the background and discovers projects automatically.</p><p className="mt-1 text-sm text-fg-muted">The one-time command expires at {new Date(enrollment.expiresAt).toLocaleString()}.</p><pre className="mt-4 overflow-x-auto whitespace-pre rounded-lg border border-border bg-[#0b0c10] p-3 text-xs text-fg-muted"><code>{command}</code></pre><button onClick={() => void copy()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg hover:border-fg-faint">{copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy one-line command'}</button></div></div>
}
