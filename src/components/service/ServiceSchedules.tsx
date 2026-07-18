import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createServiceSchedule,
  deleteServiceSchedule,
  fetchServiceSchedules,
  updateServiceSchedule,
  type ServiceSchedule,
  type ServiceScheduleInput,
} from '@/services/operations'
import { useAuth } from '@/stores/auth'
import { useToasts } from '@/stores/toasts'
import { cn } from '@/lib/utils'

const DAYS = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 0, short: 'Sun' },
] as const
const ALL_DAYS = DAYS.map((day) => day.value)
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function emptySchedule(): ServiceScheduleInput {
  return { action: 'restart', localTime: '04:00', daysOfWeek: [...ALL_DAYS], timezone: DEFAULT_TIMEZONE, enabled: true }
}

function scheduleInput(schedule: ServiceSchedule): ServiceScheduleInput {
  return {
    action: schedule.action,
    localTime: schedule.localTime,
    daysOfWeek: schedule.daysOfWeek,
    timezone: schedule.timezone,
    enabled: schedule.enabled,
  }
}

function daysLabel(days: number[]) {
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Weekdays'
  return DAYS.filter((day) => days.includes(day.value)).map((day) => day.short).join(', ')
}

function nextRunLabel(schedule: ServiceSchedule) {
  if (!schedule.enabled) return 'Paused'
  if (!schedule.nextRunAt) return 'Waiting for next run'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: schedule.timezone,
  }).format(new Date(schedule.nextRunAt))
}

interface ServiceSchedulesProps {
  serviceId: string
  canEdit: boolean
  available: boolean
}

export function ServiceSchedules({ serviceId, canEdit, available }: ServiceSchedulesProps) {
  const accessToken = useAuth((state) => state.accessToken)
  const pushToast = useToasts((state) => state.push)
  const queryClient = useQueryClient()
  const queryKey = ['service-schedules', serviceId]
  const [draft, setDraft] = useState<ServiceScheduleInput>(emptySchedule)
  const [editingId, setEditingId] = useState<string | null>(null)
  const schedules = useQuery({
    queryKey,
    queryFn: () => fetchServiceSchedules(accessToken!, serviceId),
    enabled: Boolean(accessToken),
    networkMode: 'always',
    placeholderData: { schedules: [] },
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const create = useMutation({
    mutationFn: (input: ServiceScheduleInput) => createServiceSchedule(useAuth.getState().accessToken!, serviceId, input),
    networkMode: 'always',
    onSuccess: () => {
      void refresh()
      setDraft(emptySchedule())
      pushToast({ title: 'Schedule created', message: 'The agent will run it even when this page is closed.', tone: 'success' })
    },
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServiceScheduleInput }) => updateServiceSchedule(useAuth.getState().accessToken!, serviceId, id, input),
    networkMode: 'always',
    onSuccess: () => {
      void refresh()
      setEditingId(null)
      setDraft(emptySchedule())
      pushToast({ title: 'Schedule updated', message: 'The next run has been recalculated.', tone: 'success' })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteServiceSchedule(useAuth.getState().accessToken!, serviceId, id),
    networkMode: 'always',
    onSuccess: () => {
      void refresh()
      pushToast({ title: 'Schedule removed', message: 'No future command will be created from this rule.', tone: 'success' })
    },
  })
  const pending = create.isPending || update.isPending || remove.isPending
  const disabled = !canEdit || !available || pending
  const error = create.error ?? update.error ?? remove.error

  const toggleDay = (value: number) => setDraft((current) => {
    const selected = current.daysOfWeek.includes(value)
      ? current.daysOfWeek.filter((day) => day !== value)
      : [...current.daysOfWeek, value]
    return { ...current, daysOfWeek: selected.length ? selected : current.daysOfWeek }
  })
  const edit = (schedule: ServiceSchedule) => {
    setEditingId(schedule.id)
    setDraft(scheduleInput(schedule))
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraft(emptySchedule())
  }
  const submit = () => {
    if (editingId) update.mutate({ id: editingId, input: draft })
    else create.mutate(draft)
  }

  return <section className="border-t border-border-soft pt-5">
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><CalendarClock className="h-4 w-4" /></span>
      <div><h3 className="text-[13px] font-semibold text-fg">Automatic schedule</h3><p className="mt-0.5 text-[11px] text-fg-faint">Start, stop or restart this process on selected days. Rules run in the chosen timezone.</p></div>
    </div>

    {!available && <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[11px] text-warning">Save Remote control as enabled for this manageable process before adding schedules.</p>}

    <div className="mt-4 space-y-3">
      {schedules.isLoading && <p className="text-[12px] text-fg-faint">Loading schedules…</p>}
      {schedules.data?.schedules.map((schedule) => <article key={schedule.id} className="rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><p className="text-[13px] font-medium capitalize text-fg">{schedule.action} at <span className="font-mono text-accent">{schedule.localTime}</span></p><p className="mt-1 text-[11px] text-fg-faint">{daysLabel(schedule.daysOfWeek)} · {schedule.timezone}</p><p className="mt-1 text-[11px] text-fg-muted">Next: {nextRunLabel(schedule)}</p></div>
          <button type="button" role="switch" aria-label={`${schedule.enabled ? 'Pause' : 'Enable'} schedule`} aria-checked={schedule.enabled} disabled={!canEdit || pending || (!available && !schedule.enabled)} onClick={() => update.mutate({ id: schedule.id, input: { ...scheduleInput(schedule), enabled: !schedule.enabled } })} className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40', schedule.enabled ? 'border-accent/40 bg-accent/25' : 'border-border bg-surface-3')}><span className={cn('absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all', schedule.enabled ? 'left-[22px] bg-accent' : 'left-0.5 bg-fg-faint')} /></button>
        </div>
        {canEdit && <div className="mt-2 flex justify-end gap-1 border-t border-border-soft pt-2"><button type="button" onClick={() => edit(schedule)} disabled={pending} aria-label="Edit schedule" className="grid h-7 w-7 place-items-center rounded-md text-fg-faint hover:bg-surface-3 hover:text-fg disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => { if (globalThis.confirm('Remove this schedule?')) remove.mutate(schedule.id) }} disabled={pending} aria-label="Delete schedule" className="grid h-7 w-7 place-items-center rounded-md text-fg-faint hover:bg-danger/10 hover:text-danger disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></div>}
      </article>)}
      {schedules.data?.schedules.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-fg-faint">No automatic actions yet.</p>}
    </div>

    {canEdit && <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-3 flex items-center justify-between"><p className="text-[12px] font-semibold text-fg">{editingId ? 'Edit rule' : 'Add rule'}</p>{editingId && <button type="button" onClick={cancelEdit} disabled={pending} aria-label="Cancel editing" className="text-fg-faint hover:text-fg"><X className="h-4 w-4" /></button>}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-fg-faint">Action<select value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value as ServiceScheduleInput['action'] }))} disabled={disabled} className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-3 px-2 text-[12px] capitalize text-fg outline-none focus:border-accent disabled:opacity-50"><option value="start">Start</option><option value="stop">Stop</option><option value="restart">Restart</option></select></label>
        <label className="text-[11px] text-fg-faint">Time<input type="time" value={draft.localTime} onChange={(event) => setDraft((current) => ({ ...current, localTime: event.target.value }))} disabled={disabled} className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-3 px-2 font-mono text-[12px] text-fg outline-none focus:border-accent disabled:opacity-50" /></label>
      </div>
      <div className="mt-3"><div className="mb-1.5 flex items-center justify-between"><span className="text-[11px] text-fg-faint">Days</span><div className="flex gap-2"><button type="button" onClick={() => setDraft((current) => ({ ...current, daysOfWeek: [1, 2, 3, 4, 5] }))} disabled={disabled} className="text-[10px] text-accent disabled:opacity-50">Weekdays</button><button type="button" onClick={() => setDraft((current) => ({ ...current, daysOfWeek: [...ALL_DAYS] }))} disabled={disabled} className="text-[10px] text-accent disabled:opacity-50">Every day</button></div></div><div className="grid grid-cols-7 gap-1">{DAYS.map((day) => <button key={day.value} type="button" aria-pressed={draft.daysOfWeek.includes(day.value)} onClick={() => toggleDay(day.value)} disabled={disabled} className={cn('h-7 rounded-md border text-[10px] transition-colors disabled:opacity-40', draft.daysOfWeek.includes(day.value) ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border bg-surface-3 text-fg-faint')}>{day.short.slice(0, 2)}</button>)}</div></div>
      <label className="mt-3 block text-[11px] text-fg-faint">Timezone<input value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} disabled={disabled} maxLength={80} placeholder="Europe/Moscow" className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-3 px-2 text-[12px] text-fg outline-none focus:border-accent disabled:opacity-50" /></label>
      {error && <p className="mt-3 text-[11px] text-danger">{error.message}</p>}
      <button type="button" onClick={submit} disabled={disabled || !draft.localTime || !draft.daysOfWeek.length || !draft.timezone} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-[12px] font-semibold text-[#04150e] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />{pending ? 'Saving…' : editingId ? 'Save schedule' : 'Add schedule'}</button>
    </div>}
  </section>
}
