import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Bot, CheckCircle2, KeyRound, Laptop, LogOut, Plus, Send, ShieldCheck, Trash2, Webhook } from 'lucide-react'
import { Section } from '@/components/ui/Section'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/stores/auth'
import { useToasts } from '@/stores/toasts'
import {
  createNotificationChannel,
  changePassword,
  deleteNotificationChannel,
  fetchSecuritySessions,
  fetchNotificationChannels,
  revokeOtherSecuritySessions,
  testNotificationChannel,
  type NotificationChannelInput,
} from '@/services/operations'

export function SettingsPage() {
  const accessToken = useAuth((state) => state.accessToken)
  const role = useAuth((state) => state.user?.role)
  const queryClient = useQueryClient()
  const pushToast = useToasts((state) => state.push)
  const [kind, setKind] = useState<'telegram' | 'webhook'>('telegram')
  const [name, setName] = useState('')
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [url, setUrl] = useState('')
  const canEdit = role === 'owner' || role === 'admin'

  const channels = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => fetchNotificationChannels(accessToken!),
    enabled: Boolean(accessToken),
  })
  const create = useMutation({
    mutationFn: (input: NotificationChannelInput) => createNotificationChannel(accessToken!, input),
    onSuccess: () => {
      setName(''); setBotToken(''); setChatId(''); setUrl('')
      void queryClient.invalidateQueries({ queryKey: ['notification-channels'] })
      pushToast({ title: 'Notifications connected', message: 'The test arrived, and new alerts will be delivered automatically.', tone: 'success' })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteNotificationChannel(accessToken!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notification-channels'] }),
  })
  const test = useMutation({
    mutationFn: (id: string) => testNotificationChannel(accessToken!, id),
    onSuccess: () => pushToast({ title: 'Test sent', message: 'Check the selected notification channel.', tone: 'success' }),
    onError: (error) => pushToast({ title: 'Test failed', message: error instanceof Error ? error.message : 'Could not deliver the test.', tone: 'error' }),
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (kind === 'telegram') create.mutate({ kind, name: name.trim(), botToken: botToken.trim(), chatId: chatId.trim() })
    else create.mutate({ kind, name: name.trim(), url: url.trim() })
  }

  return <div className="space-y-6">
    <SecurityPanel />
    <Section title="Notifications" subtitle="Get a message when a server or service needs attention">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card className="overflow-hidden">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent"><BellRing className="h-5 w-5" /></span><div><h2 className="font-semibold text-fg">Connected channels</h2><p className="text-[12px] text-fg-muted">Delivery retries automatically up to five times.</p></div></div>
          </div>
          {channels.isLoading && <p className="p-5 text-sm text-fg-muted">Loading…</p>}
          {channels.isError && <p className="p-5 text-sm text-danger">Could not load notification channels.</p>}
          {channels.data?.channels.length === 0 && <div className="p-8 text-center text-sm text-fg-muted">No channel connected yet. Add Telegram or a webhook.</div>}
          <div className="divide-y divide-border-soft">
            {channels.data?.channels.map((channel) => {
              const Icon = channel.kind === 'telegram' ? Bot : Webhook
              return <div key={channel.id} className="flex items-center gap-3 p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-fg-muted"><Icon className="h-4.5 w-4.5" /></span>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-fg">{channel.name}</span><Badge color="#6ee7b7"><CheckCircle2 className="h-3 w-3" /> active</Badge></div><p className="truncate text-[12px] text-fg-faint">{channel.target}</p></div>
                {canEdit && <><Button size="sm" variant="surface" onClick={() => test.mutate(channel.id)} disabled={test.isPending}><Send className="h-3.5 w-3.5" /> Test</Button><Button size="icon" variant="ghost" aria-label="Delete channel" onClick={() => { if (window.confirm(`Delete ${channel.name}?`)) remove.mutate(channel.id) }}><Trash2 className="h-4 w-4" /></Button></>}
              </div>
            })}
          </div>
        </Card>

        {canEdit && <Card className="p-5">
          <h2 className="font-semibold text-fg">Add channel</h2>
          <p className="mt-1 text-[12px] text-fg-muted">Secrets are encrypted before they are stored.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setKind('telegram'); create.reset() }} className={`rounded-xl border p-3 text-left ${kind === 'telegram' ? 'border-accent/50 bg-accent/10 text-fg' : 'border-border text-fg-muted'}`}><Bot className="mb-2 h-4 w-4" /><span className="text-sm font-medium">Telegram</span></button>
              <button type="button" onClick={() => { setKind('webhook'); create.reset() }} className={`rounded-xl border p-3 text-left ${kind === 'webhook' ? 'border-accent/50 bg-accent/10 text-fg' : 'border-border text-fg-muted'}`}><Webhook className="mb-2 h-4 w-4" /><span className="text-sm font-medium">Webhook</span></button>
            </div>
            <Field label="Name"><input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'telegram' ? 'Ops Telegram' : 'Discord / Slack'} className="field" /></Field>
            {kind === 'telegram' ? <>
              <Field label="Bot token"><input required type="password" autoComplete="off" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder="123456:ABC…" className="field" /></Field>
              <Field label="Chat ID"><input required value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="-1001234567890" className="field" /></Field>
              <p className="text-[12px] leading-5 text-fg-muted">Open your bot in Telegram and press <span className="font-medium text-fg">Start</span> before connecting. For a group, add the bot to that group first.</p>
            </> : <>
              <Field label="HTTPS webhook URL"><input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="field" /></Field>
              <p className="text-[12px] leading-5 text-fg-muted">Works with Slack, Discord, and custom public HTTPS endpoints. NodeDeck sends a test before saving.</p>
            </>}
            {create.isError && <p className="text-[12px] text-danger">{create.error.message}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={create.isPending}><Plus className="h-4 w-4" />{create.isPending ? 'Sending test…' : 'Connect & test'}</Button>
          </form>
        </Card>}
      </div>
    </Section>
  </div>
}

function SecurityPanel() {
  const accessToken = useAuth((state) => state.accessToken)
  const queryClient = useQueryClient()
  const pushToast = useToasts((state) => state.push)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const sessions = useQuery({
    queryKey: ['security-sessions'],
    queryFn: () => fetchSecuritySessions(accessToken!),
    enabled: Boolean(accessToken),
  })
  const revoke = useMutation({
    mutationFn: () => revokeOtherSecuritySessions(accessToken!),
    onSuccess: ({ revoked }) => {
      void queryClient.invalidateQueries({ queryKey: ['security-sessions'] })
      pushToast({ title: 'Other sessions closed', message: `${revoked} session${revoked === 1 ? '' : 's'} revoked.`, tone: 'success' })
    },
  })
  const password = useMutation({
    mutationFn: () => changePassword(accessToken!, currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword(''); setNewPassword('')
      void queryClient.invalidateQueries({ queryKey: ['security-sessions'] })
      pushToast({ title: 'Password changed', message: 'Other devices were signed out.', tone: 'success' })
    },
  })

  return <Section title="Account security" subtitle="Password and signed-in devices">
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-semibold text-fg">Signed-in devices</h2><p className="text-[12px] text-fg-muted">Rotating sessions detect reuse of a stolen cookie.</p></div></div>
          <Button size="sm" variant="surface" onClick={() => revoke.mutate()} disabled={revoke.isPending || (sessions.data?.sessions.length ?? 0) <= 1}><LogOut className="h-3.5 w-3.5" />Sign out others</Button>
        </div>
        {sessions.isLoading && <p className="p-5 text-sm text-fg-muted">Loading sessions…</p>}
        <div className="divide-y divide-border-soft">
          {sessions.data?.sessions.slice(0, 5).map((session) => <div key={session.id} className="flex items-center gap-3 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-fg-muted"><Laptop className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-fg">{deviceName(session.userAgent)}</span>{session.current && <Badge color="#6ee7b7">This device</Badge>}</div><p className="mt-0.5 text-[11px] text-fg-faint">Signed in {new Date(session.createdAt).toLocaleString()}</p></div>
          </div>)}
          {(sessions.data?.sessions.length ?? 0) > 5 && <p className="p-4 text-center text-[12px] text-fg-faint">+ {sessions.data!.sessions.length - 5} older sessions · use “Sign out others” to close them</p>}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-purple/15 text-purple"><KeyRound className="h-5 w-5" /></span><div><h2 className="font-semibold text-fg">Change password</h2><p className="text-[12px] text-fg-muted">At least 12 characters.</p></div></div>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); password.mutate() }}>
          <Field label="Current password"><input required type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="field" /></Field>
          <Field label="New password"><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="field" /></Field>
          {password.isError && <p className="text-[12px] text-danger">{password.error.message}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={password.isPending || newPassword.length < 12}><KeyRound className="h-4 w-4" />{password.isPending ? 'Changing…' : 'Change password'}</Button>
        </form>
      </Card>
    </div>
  </Section>
}

function deviceName(userAgent: string | null) {
  if (!userAgent) return 'Unknown device'
  const browser = userAgent.includes('Firefox/') ? 'Firefox' : userAgent.includes('Edg/') ? 'Edge' : userAgent.includes('Chrome/') ? 'Chrome' : userAgent.includes('Safari/') ? 'Safari' : 'Browser'
  const os = userAgent.includes('Mac OS X') ? 'macOS' : userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Android') ? 'Android' : userAgent.includes('iPhone') ? 'iPhone' : userAgent.includes('Linux') ? 'Linux' : 'device'
  return `${browser} on ${os}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[12px] font-medium text-fg-muted">{label}<div className="mt-1.5 [&_.field]:h-10 [&_.field]:w-full [&_.field]:rounded-lg [&_.field]:border [&_.field]:border-border [&_.field]:bg-surface-2 [&_.field]:px-3 [&_.field]:text-sm [&_.field]:text-fg [&_.field]:outline-none [&_.field]:focus:border-accent">{children}</div></label>
}
