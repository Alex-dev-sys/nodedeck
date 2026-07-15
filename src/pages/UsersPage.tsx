import { useState } from 'react'
import {
  CheckCircle2,
  KeyRound,
  MinusCircle,
  ShieldCheck,
  ShieldX,
  UserCog,
  XCircle,
} from 'lucide-react'
import type { AuditEntry, AuditResult, Role, User, UserStatus } from '@/types'
import { useInfra } from '@/hooks/useInfra'
import { Section } from '@/components/ui/Section'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { cn, relativeTime } from '@/lib/utils'

const roleMeta: Record<Role, { label: string; hex: string }> = {
  owner: { label: 'Owner', hex: '#8b5cf6' },
  admin: { label: 'Admin', hex: '#60a5fa' },
  operator: { label: 'Operator', hex: '#6ee7b7' },
  viewer: { label: 'Viewer', hex: '#9aa1ad' },
}

const statusMeta: Record<UserStatus, { label: string; hex: string }> = {
  active: { label: 'Active', hex: '#6ee7b7' },
  invited: { label: 'Invited', hex: '#fbbf24' },
  suspended: { label: 'Suspended', hex: '#ff4d4f' },
}

const resultMeta: Record<AuditResult, { hex: string; Icon: typeof CheckCircle2 }> = {
  ok: { hex: '#6ee7b7', Icon: CheckCircle2 },
  denied: { hex: '#fbbf24', Icon: MinusCircle },
  failed: { hex: '#ff4d4f', Icon: XCircle },
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function UsersPage() {
  const { data, isLoading } = useInfra()
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')

  const users = data?.users ?? []
  const audit = data?.auditLog ?? []

  const filtered = roleFilter === 'all' ? users : users.filter((u) => u.role === roleFilter)

  if (isLoading || !data) return <PageSkeleton />

  const active = users.filter((u) => u.status === 'active').length
  const noMfa = users.filter((u) => !u.mfa && u.status !== 'invited').length

  return (
    <div className="space-y-6">
      <Section
        title="Users & Access"
        subtitle={`${users.length} members · ${active} active`}
        action={
          noMfa > 0 ? (
            <Badge color="#fbbf24">
              <ShieldX className="h-3 w-3" />
              {noMfa} without MFA
            </Badge>
          ) : (
            <Badge color="#6ee7b7">
              <ShieldCheck className="h-3 w-3" />
              MFA enforced
            </Badge>
          )
        }
      >
        {/* Role filter */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(['all', 'owner', 'admin', 'operator', 'viewer'] as const).map((r) => {
            const on = roleFilter === r
            const count = r === 'all' ? users.length : users.filter((u) => u.role === r).length
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[12px] font-medium capitalize transition-colors',
                  on
                    ? 'border-fg-faint bg-surface-2 text-fg'
                    : 'border-border text-fg-muted hover:text-fg hover:border-fg-faint/60',
                )}
              >
                {r} <span className="text-fg-faint">{count}</span>
              </button>
            )
          })}
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-faint">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">MFA</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                  <th className="px-5 py-3 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <UserRow key={u.id} user={u} now={data.serverTimeMs} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Section title="Audit log" subtitle={`${audit.length} recent events`}>
        <Card className="overflow-hidden">
          <ul>
            {audit.map((e, i) => (
              <AuditRow
                key={e.id}
                entry={e}
                user={users.find((u) => u.id === e.userId)}
                now={data.serverTimeMs}
                first={i === 0}
              />
            ))}
          </ul>
        </Card>
      </Section>
    </div>
  )
}

function UserRow({ user: u, now }: { user: User; now: number }) {
  const role = roleMeta[u.role]
  const status = statusMeta[u.status]
  const dim = u.status === 'suspended'
  return (
    <tr className={cn('border-b border-border-soft last:border-0 transition-colors hover:bg-surface-2/50', dim && 'opacity-55')}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold"
            style={{ backgroundColor: `${role.hex}20`, color: role.hex }}
          >
            {initials(u.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-fg">{u.name}</div>
            <div className="truncate text-[11px] text-fg-faint">{u.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <Badge color={role.hex}>{role.label}</Badge>
      </td>
      <td className="px-5 py-3">
        <Badge color={status.hex}>{status.label}</Badge>
      </td>
      <td className="px-5 py-3">
        {u.mfa ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-accent">
            <KeyRound className="h-3.5 w-3.5" /> on
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] text-warning">
            <ShieldX className="h-3.5 w-3.5" /> off
          </span>
        )}
      </td>
      <td className="px-5 py-3 font-mono text-[12px] text-fg-muted">{u.actionsCount.toLocaleString()}</td>
      <td className="px-5 py-3 text-[12px] text-fg-muted">
        {u.status === 'invited' ? <span className="text-fg-faint">pending</span> : relativeTime(u.lastActive, now)}
      </td>
    </tr>
  )
}

function AuditRow({
  entry: e,
  user,
  now,
  first,
}: {
  entry: AuditEntry
  user?: User
  now: number
  first: boolean
}) {
  const meta = resultMeta[e.result]
  return (
    <li className={cn('flex items-center gap-3 px-5 py-3', !first && 'border-t border-border-soft')}>
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `${meta.hex}18`, color: meta.hex }}
      >
        <meta.Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="font-semibold text-fg">{user?.name ?? e.userId}</span>
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">{e.action}</code>
          <span className="truncate text-fg-muted">{e.target}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-faint">
          <span className="inline-flex items-center gap-1">
            <UserCog className="h-3 w-3" />
            {e.ip}
          </span>
          <span>·</span>
          <span>{relativeTime(e.ts, now)}</span>
        </div>
      </div>
      {e.result !== 'ok' && <Badge color={meta.hex}>{e.result}</Badge>}
    </li>
  )
}
