import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import type { Service } from '@/types'
import { fetchServiceSettings, updateServiceSettings, type RemoteServiceSettings, type ServiceSettingsInput } from '@/services/operations'
import { infraKey } from '@/app/queryClient'
import { useAuth } from '@/stores/auth'
import { useToasts } from '@/stores/toasts'
import { cn } from '@/lib/utils'

const DEFAULTS: ServiceSettingsInput = {
  displayName: null,
  controlEnabled: true,
  autoRecovery: false,
  recoveryDelaySec: 120,
  cpuAlertThreshold: 90,
  ramAlertThreshold: 90,
}

export function ServiceSettings({ service, mode = 'icon' }: { service: Service; mode?: 'icon' | 'tool' }) {
  const [open, setOpen] = useState(false)
  const accessToken = useAuth((state) => state.accessToken)
  const role = useAuth((state) => state.user?.role)
  const canEdit = role === 'owner' || role === 'admin'
  const queryClient = useQueryClient()
  const pushToast = useToasts((state) => state.push)
  const settings = useQuery({
    queryKey: ['service-settings', service.id],
    queryFn: () => fetchServiceSettings(accessToken!, service.id),
    enabled: open && Boolean(accessToken),
  })
  const save = useMutation({
    mutationFn: (input: ServiceSettingsInput) => updateServiceSettings(accessToken!, service.id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(['service-settings', service.id], data)
      void queryClient.invalidateQueries({ queryKey: infraKey })
      pushToast({ title: `${service.name} settings saved`, message: 'The control plane and agent will use the new policy.', tone: 'success' })
    },
  })

  return <>
    {mode === 'icon' ? <button type="button" onClick={() => setOpen(true)} title="Service settings" aria-label="Service settings" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface-2 text-fg-muted transition-colors hover:text-fg"><Settings2 className="h-4 w-4" /></button>
      : <button type="button" onClick={() => setOpen(true)} title="Service settings" className="flex flex-col items-center gap-1.5 rounded-xl border border-border-soft bg-surface-2 py-2.5 text-fg-muted transition-colors hover:border-fg-faint hover:text-fg"><Settings2 className="h-4 w-4" /><span className="text-[10px]">Config</span></button>}

    <AnimatePresence>
      {open && <div className="fixed inset-0 z-[75] flex justify-end">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!save.isPending) setOpen(false) }} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
        <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 40 }} className="relative flex h-full w-full max-w-[440px] flex-col border-l border-border bg-surface shadow-[var(--shadow-pop)]">
          <header className="flex items-start gap-3 border-b border-border p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/12 text-accent"><SlidersHorizontal className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="text-[16px] font-semibold text-fg">Project settings</h2><p className="mt-0.5 truncate text-[12px] text-fg-faint">{service.name} · saved for this workspace</p></div>
            <button type="button" onClick={() => setOpen(false)} disabled={save.isPending} aria-label="Close settings" className="text-fg-faint transition-colors hover:text-fg disabled:opacity-50"><X className="h-5 w-5" /></button>
          </header>

          {settings.isLoading && <div className="p-5 text-sm text-fg-muted">Loading settings…</div>}
          {settings.isError && <div className="p-5 text-sm text-danger">Could not load project settings.</div>}
          {settings.data && <SettingsForm key={`${service.id}:${settings.data.settings.updatedAt ?? 'default'}`} service={service} initial={settings.data.settings} canEdit={canEdit} pending={save.isPending} error={save.error} onSave={(input) => save.mutate(input)} />}
        </motion.aside>
      </div>}
    </AnimatePresence>
  </>
}

function SettingsForm({ service, initial, canEdit, pending, error, onSave }: { service: Service; initial: RemoteServiceSettings; canEdit: boolean; pending: boolean; error: Error | null; onSave: (input: ServiceSettingsInput) => void }) {
  const [draft, setDraft] = useState<ServiceSettingsInput>(() => ({
    displayName: initial.displayName,
    controlEnabled: initial.controlEnabled,
    autoRecovery: initial.autoRecovery,
    recoveryDelaySec: initial.recoveryDelaySec,
    cpuAlertThreshold: initial.cpuAlertThreshold,
    ramAlertThreshold: initial.ramAlertThreshold,
  }))
  const recoveryAvailable = service.managed && !service.protected
  const disabled = !canEdit || pending
  const reset = () => setDraft(DEFAULTS)

  return <>
    <div className="flex-1 space-y-6 overflow-y-auto p-5">
      {!canEdit && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-[12px] text-warning">Only workspace owners and admins can change these settings.</p>}
      {service.protected && <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[12px] text-warning"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />NodeDeck protects its own control plane from remote actions and automatic recovery.</p>}

      <label className="block"><span className="text-[13px] font-medium text-fg">Display name</span><span className="mt-0.5 block text-[11px] text-fg-faint">Use a clear name without changing anything on the server</span><input value={draft.displayName ?? ''} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value || null }))} disabled={disabled} maxLength={80} placeholder={service.name} className="mt-2 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent disabled:opacity-50" /></label>

      <SettingRow label="Remote control" hint="Allow start, restart and stop from NodeDeck"><Switch label="Remote control" on={draft.controlEnabled} disabled={disabled || service.protected || !service.managed} onClick={() => setDraft((current) => ({ ...current, controlEnabled: !current.controlEnabled, autoRecovery: current.controlEnabled ? false : current.autoRecovery }))} /></SettingRow>
      <SettingRow label="Automatic recovery" hint="Restart this project after an unexpected stop"><Switch label="Automatic recovery" on={draft.autoRecovery} disabled={disabled || !recoveryAvailable || !draft.controlEnabled} onClick={() => setDraft((current) => ({ ...current, autoRecovery: !current.autoRecovery }))} /></SettingRow>
      <SettingRow label="Recovery delay" hint="Wait before another automatic restart"><select value={draft.recoveryDelaySec} onChange={(event) => setDraft((current) => ({ ...current, recoveryDelaySec: Number(event.target.value) }))} disabled={disabled || !draft.autoRecovery} className="h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-[12px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={300}>5 minutes</option><option value={900}>15 minutes</option></select></SettingRow>

      <div className="border-t border-border-soft pt-5"><div className="mb-1 text-[13px] font-semibold text-fg">Resource alerts</div><div className="mb-5 text-[11px] text-fg-faint">Create an alert when this project crosses its own limit</div><div className="space-y-5"><RangeSetting label="CPU warning" value={draft.cpuAlertThreshold} min={50} max={100} suffix="%" disabled={disabled} onChange={(cpuAlertThreshold) => setDraft((current) => ({ ...current, cpuAlertThreshold }))} /><RangeSetting label="RAM warning" value={draft.ramAlertThreshold} min={50} max={100} suffix="%" disabled={disabled} onChange={(ramAlertThreshold) => setDraft((current) => ({ ...current, ramAlertThreshold }))} /></div></div>
      {error && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger">{error.message}</p>}
    </div>
    <footer className="flex justify-between border-t border-border p-4"><button type="button" onClick={reset} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Defaults</button><button type="button" onClick={() => onSave(draft)} disabled={disabled} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[#04150e] disabled:opacity-50">{pending ? 'Saving…' : 'Save changes'}</button></footer>
  </>
}

function Switch({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={on} disabled={disabled} onClick={onClick} className={cn('relative h-6 w-11 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40', on ? 'border-accent/40 bg-accent/25' : 'border-border bg-surface-3')}><span className={cn('absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all', on ? 'left-[22px] bg-accent' : 'left-0.5 bg-fg-faint')} /></button>
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><div><div className="text-[13px] font-medium text-fg">{label}</div><div className="mt-0.5 text-[11px] text-fg-faint">{hint}</div></div>{children}</div>
}

function RangeSetting({ label, value, min, max, suffix, disabled, onChange }: { label: string; value: number; min: number; max: number; suffix: string; disabled?: boolean; onChange: (value: number) => void }) {
  return <div><div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-medium text-fg">{label}</span><span className="font-mono text-[12px] text-accent">{value} {suffix}</span></div><input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40" /></div>
}
