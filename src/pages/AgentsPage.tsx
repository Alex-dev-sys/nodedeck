import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Plus, Server, Settings2, ShieldCheck, Trash2, Wifi, X } from 'lucide-react'
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
  agentVersion: string | null
  trackHostMetrics: boolean
  trackDocker: boolean
  trackNative: boolean
  collectLogs: boolean
  remoteControl: boolean
  automaticUpdates: boolean
  settingsUpdatedAt: string
}

type AgentCapabilities = Pick<Agent, 'trackHostMetrics' | 'trackDocker' | 'trackNative' | 'collectLogs' | 'remoteControl' | 'automaticUpdates'>

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
  const [agentToRevoke, setAgentToRevoke] = useState<Agent | null>(null)
  const [agentToConfigure, setAgentToConfigure] = useState<Agent | null>(null)
  const query = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await fetch('/api/v1/agents', { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Could not load agents.')
      return response.json() as Promise<{ agents: Agent[]; latestAgentVersion: string; serverTimeMs: number }>
    },
    refetchInterval: 10_000,
  })
  const revoke = useMutation({
    mutationFn: async (agentId: string) => {
      const response = await fetch(`/api/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Could not revoke agent access.')
    },
    onSuccess: () => {
      setAgentToRevoke(null)
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
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
  const saveSettings = useMutation({
    mutationFn: async ({ agentId, settings }: { agentId: string; settings: AgentCapabilities }) => {
      const response = await fetch(`/api/v1/agents/${encodeURIComponent(agentId)}/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!response.ok) throw new Error('Could not save agent settings.')
      return response.json() as Promise<{ settings: AgentCapabilities }>
    },
    onSuccess: (_data, variables) => {
      setAgentToConfigure((current) => current?.id === variables.agentId ? { ...current, ...variables.settings } : current)
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
      void queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  if (query.isLoading) return <p className="text-fg-muted">Loading agents…</p>
  if (query.isError) return <p className="text-danger">{query.error.message}</p>
  if (!query.data) return null
  const { agents, latestAgentVersion, serverTimeMs: now } = query.data
  const canRevoke = role === 'owner' || role === 'admin'

  const controlUrl = typeof window === 'undefined' ? '' : window.location.origin
  const command = enrollment ? buildAgentInstallCommand(enrollment.token, controlUrl) : ''

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-fg">Servers</h1><p className="mt-1 text-sm text-fg-muted">One lightweight agent finds Docker, Compose, systemd, PM2 and macOS services automatically.</p></div>
      {canRevoke && <button onClick={() => { setEnrollment(null); setEnrollmentName(''); setShowEnrollment(true) }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-[#04150e]"><Plus className="h-4 w-4" />Add server</button>}
    </div>
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {agents.map((agent) => {
        const online = agent.lastSeenAt && now - Date.parse(agent.lastSeenAt) < 60_000
        const enabledCapabilities = [agent.trackHostMetrics, agent.trackDocker, agent.trackNative, agent.collectLogs, agent.remoteControl, agent.automaticUpdates].filter(Boolean).length
        const updateAvailable = agent.agentVersion !== latestAgentVersion
        return <article
          key={agent.id}
          role="button"
          tabIndex={0}
          onClick={() => { saveSettings.reset(); setAgentToConfigure(agent) }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); saveSettings.reset(); setAgentToConfigure(agent) } }}
          className="cursor-pointer rounded-2xl border border-border bg-surface p-5 transition hover:border-accent/50 hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent"><Server className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-fg">{agent.name}</h2><p className="truncate text-sm text-fg-muted">{agent.hostname}</p></div>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 text-[11px] text-fg-muted"><Settings2 className="h-3 w-3" />{enabledCapabilities}/6</span>
            {canRevoke && <button
              disabled={revoke.isPending}
              onClick={(event) => { event.stopPropagation(); revoke.reset(); setAgentToRevoke(agent) }}
              title="Revoke agent access"
              className="rounded-lg border border-danger/30 p-2 text-danger hover:bg-danger/10 disabled:opacity-50"
            ><Trash2 className="h-4 w-4" /></button>}
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm"><Wifi className="h-4 w-4" style={{ color: online ? '#6ee7b7' : '#ff4d4f' }} /><span className={online ? 'text-accent' : 'text-danger'}>{online ? 'Online' : 'Offline'}</span><span className="text-fg-faint">· {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleTimeString() : 'Never seen'}</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs text-fg-muted"><span>CPU <b className="text-fg">{agent.trackHostMetrics ? `${agent.hostCpu ?? 0}%` : 'Off'}</b></span><span>RAM <b className="text-fg">{agent.trackHostMetrics ? `${agent.hostRam ?? 0}%` : 'Off'}</b></span><span>Disk <b className="text-fg">{agent.trackHostMetrics ? `${agent.hostDisk ?? 0}%` : 'Off'}</b></span></div>
          {updateAvailable && <p className="mt-3 text-xs text-warning">Agent update available</p>}
        </article>
      })}
    </div>
    {canRevoke && showEnrollment && !enrollment && <EnrollmentDialog name={enrollmentName} setName={setEnrollmentName} submit={() => enroll.mutate(enrollmentName)} pending={enroll.isPending} error={enroll.error?.message} close={() => setShowEnrollment(false)} />}
    {canRevoke && enrollment && <EnrollmentResult enrollment={enrollment} command={command} copied={copied} copy={async () => { await navigator.clipboard.writeText(command); setCopied(true) }} close={() => { setEnrollment(null); setShowEnrollment(false) }} />}
    {canRevoke && agentToRevoke && <RevokeAgentDialog agent={agentToRevoke} pending={revoke.isPending} error={revoke.error?.message} confirm={() => revoke.mutate(agentToRevoke.id)} close={() => { if (!revoke.isPending) setAgentToRevoke(null) }} />}
    {agentToConfigure && <AgentSettingsDialog
      agent={agentToConfigure}
      latestVersion={latestAgentVersion}
      canEdit={canRevoke}
      pending={saveSettings.isPending}
      error={saveSettings.error?.message}
      save={(settings) => saveSettings.mutate({ agentId: agentToConfigure.id, settings })}
      close={() => { if (!saveSettings.isPending) setAgentToConfigure(null) }}
    />}
  </div>
}

const capabilityOptions: Array<{ key: keyof AgentCapabilities; title: string; description: string; group: 'Monitoring' | 'Control' | 'Maintenance' }> = [
  { key: 'trackHostMetrics', title: 'Server metrics', description: 'CPU, RAM, disk and uptime.', group: 'Monitoring' },
  { key: 'trackDocker', title: 'Docker projects', description: 'Containers and Docker Compose projects.', group: 'Monitoring' },
  { key: 'trackNative', title: 'Native applications', description: 'systemd, PM2 and macOS LaunchAgents.', group: 'Monitoring' },
  { key: 'collectLogs', title: 'Container logs', description: 'Recent redacted Docker logs for diagnostics.', group: 'Monitoring' },
  { key: 'remoteControl', title: 'Remote control', description: 'Allow start, stop, restart and auto-recovery.', group: 'Control' },
  { key: 'automaticUpdates', title: 'Automatic updates', description: 'Install verified agent releases without another command.', group: 'Maintenance' },
]

function AgentSettingsDialog({ agent, latestVersion, canEdit, pending, error, save, close }: { agent: Agent; latestVersion: string; canEdit: boolean; pending: boolean; error?: string; save: (settings: AgentCapabilities) => void; close: () => void }) {
  const [settings, setSettings] = useState<AgentCapabilities>({
    trackHostMetrics: agent.trackHostMetrics,
    trackDocker: agent.trackDocker,
    trackNative: agent.trackNative,
    collectLogs: agent.collectLogs,
    remoteControl: agent.remoteControl,
    automaticUpdates: agent.automaticUpdates,
  })
  const [copiedUpdate, setCopiedUpdate] = useState(false)
  const updateCommand = "curl --proto '=https' --tlsv1.2 -fsSL 'https://nodedeck-zeta.vercel.app/update-agent.sh' | sh"
  const updateAvailable = agent.agentVersion !== latestVersion
  const supportsAutomaticUpdates = Boolean(agent.agentVersion && agent.agentVersion >= '2026.07.18.2')

  const toggle = (key: keyof AgentCapabilities) => {
    if (!canEdit) return
    setSettings((current) => {
      const next = { ...current, [key]: !current[key] }
      if (key === 'trackDocker' && !next.trackDocker) next.collectLogs = false
      if (key === 'collectLogs' && next.collectLogs) next.trackDocker = true
      return next
    })
  }

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="agent-settings-title" className="my-4 w-full max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-2xl">
    <div className="flex items-start justify-between gap-3"><div><h2 id="agent-settings-title" className="text-lg font-semibold text-fg">{agent.name} capabilities</h2><p className="mt-1 text-sm text-fg-muted">Choose what this agent may observe and control.</p></div><button type="button" onClick={close} disabled={pending} aria-label="Close" className="text-fg-faint hover:text-fg disabled:opacity-50"><X className="h-5 w-5" /></button></div>
    {(['Monitoring', 'Control', 'Maintenance'] as const).map((group) => <section key={group} className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-wider text-fg-faint">{group}</h3><div className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface-2">{capabilityOptions.filter((option) => option.group === group).map((option) => <div key={option.key} className="flex items-center gap-4 p-3.5"><div className="min-w-0 flex-1"><p className="text-sm font-medium text-fg">{option.title}</p><p className="mt-0.5 text-xs text-fg-muted">{option.description}</p></div><button type="button" role="switch" aria-checked={settings[option.key]} disabled={!canEdit || pending} onClick={() => toggle(option.key)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings[option.key] ? 'bg-accent' : 'bg-border'} disabled:opacity-50`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings[option.key] ? 'left-[22px]' : 'left-0.5'}`} /></button></div>)}</div></section>)}
    <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3.5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /><p className="text-sm font-medium text-fg">Agent version</p></div><p className="mt-1 text-xs text-fg-muted">Installed: {agent.agentVersion ?? 'unknown'} · Latest: {latestVersion}</p>{updateAvailable && <p className="mt-2 text-xs text-warning">{supportsAutomaticUpdates && settings.automaticUpdates ? 'Verified automatic update is pending.' : 'One manual update is required to enable automatic updates.'}</p>}{updateAvailable && <><pre className="mt-3 overflow-x-auto whitespace-pre rounded-lg border border-border bg-[#0b0c10] p-2.5 text-[11px] text-fg-muted"><code>{updateCommand}</code></pre><button type="button" onClick={async () => { await navigator.clipboard.writeText(updateCommand); setCopiedUpdate(true) }} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-fg">{copiedUpdate ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}{copiedUpdate ? 'Copied' : 'Copy update command'}</button></>}</div>
    {error && <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={pending} className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg disabled:opacity-50">{canEdit ? 'Cancel' : 'Close'}</button>{canEdit && <button type="button" onClick={() => save(settings)} disabled={pending} className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-[#04150e] disabled:opacity-50">{pending ? 'Saving…' : 'Save capabilities'}</button>}</div>
  </div></div>
}

function RevokeAgentDialog({ agent, pending, error, confirm, close }: { agent: Agent; pending: boolean; error?: string; confirm: () => void; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="revoke-agent-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="revoke-agent-title" className="text-lg font-semibold text-fg">Remove {agent.name}?</h2><button type="button" onClick={close} disabled={pending} aria-label="Close" className="text-fg-faint hover:text-fg disabled:opacity-50"><X className="h-5 w-5" /></button></div><p className="mt-2 text-sm text-fg-muted">This server will stop reporting data and executing commands. Projects on the server will not be stopped or deleted.</p>{error && <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={pending} className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg disabled:opacity-50">Cancel</button><button type="button" onClick={confirm} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-sm font-semibold text-white disabled:opacity-50"><Trash2 className="h-4 w-4" />{pending ? 'Removing…' : 'Remove server'}</button></div></div></div>
}

function EnrollmentDialog({ name, setName, submit, pending, error, close }: { name: string; setName: (value: string) => void; submit: () => void; pending: boolean; error?: string; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><form onSubmit={(event) => { event.preventDefault(); submit() }} className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-fg">Enroll agent</h2><button type="button" onClick={close} aria-label="Close" className="text-fg-faint hover:text-fg"><X className="h-5 w-5" /></button></div><p className="mt-2 text-sm text-fg-muted">Create a one-time token that expires in 15 minutes.</p><label className="mt-5 block text-sm text-fg-muted">Agent name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="macbook-prod" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-fg outline-none focus:border-accent" /></label>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<button disabled={pending || !name.trim()} className="mt-5 h-10 w-full rounded-lg bg-accent font-semibold text-[#04150e] disabled:opacity-50">{pending ? 'Creating…' : 'Create token'}</button></form></div>
}

function EnrollmentResult({ enrollment, command, copied, copy, close }: { enrollment: Enrollment; command: string; copied: boolean; copy: () => Promise<void>; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-fg">Connect this server with one command</h2><button onClick={close} aria-label="Close" className="text-fg-faint hover:text-fg"><X className="h-5 w-5" /></button></div><p className="mt-2 text-sm text-warning">Copy this one line into Terminal. NodeDeck installs in the background and discovers projects automatically.</p><p className="mt-1 text-sm text-fg-muted">The one-time command expires at {new Date(enrollment.expiresAt).toLocaleString()}.</p><pre className="mt-4 overflow-x-auto whitespace-pre rounded-lg border border-border bg-[#0b0c10] p-3 text-xs text-fg-muted"><code>{command}</code></pre><button onClick={() => void copy()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg hover:border-fg-faint">{copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy one-line command'}</button></div></div>
}
