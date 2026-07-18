import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, CreditCard, ExternalLink, Server, ShieldCheck, Users } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { Section } from '@/components/ui/Section'
import { createBillingCheckout, createBillingPortal, fetchBilling, type BillingPlan } from '@/services/operations'
import { useAuth } from '@/stores/auth'
import { useToasts } from '@/stores/toasts'
import { cn } from '@/lib/utils'

const ORDER: BillingPlan[] = ['free', 'pro', 'team']

export function BillingPage() {
  const accessToken = useAuth((state) => state.accessToken)
  const pushToast = useToasts((state) => state.push)
  const [searchParams, setSearchParams] = useSearchParams()
  const query = useQuery({
    queryKey: ['billing'],
    queryFn: () => fetchBilling(accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: searchParams.get('checkout') === 'success' ? 3_000 : false,
  })
  const checkout = useMutation({
    mutationFn: (plan: 'pro' | 'team') => createBillingCheckout(accessToken!, plan),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => pushToast({ title: 'Checkout unavailable', message: error.message, tone: 'error' }),
  })
  const portal = useMutation({
    mutationFn: () => createBillingPortal(accessToken!),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => pushToast({ title: 'Billing portal unavailable', message: error.message, tone: 'error' }),
  })

  useEffect(() => {
    const result = searchParams.get('checkout')
    if (!result) return
    pushToast(result === 'success'
      ? { title: 'Payment received', message: 'Stripe is confirming your subscription. The plan will update automatically.', tone: 'success' }
      : { title: 'Checkout cancelled', message: 'Nothing was charged.', tone: 'info' })
    setSearchParams({}, { replace: true })
  }, [pushToast, searchParams, setSearchParams])

  if (query.isLoading) return <PageSkeleton />
  if (query.isError || !query.data) return <div className="p-6 text-sm text-danger">Could not load billing.</div>
  const { billing, plans } = query.data

  return <div className="space-y-6">
    <Section
      title="Plan & billing"
      subtitle={`${billing.name} · ${plans[billing.plan].name}`}
      action={<Badge color={billing.subscriptionStatus === 'past_due' ? '#fbbf24' : '#6ee7b7'}>{billing.plan === 'free' ? 'Free plan' : billing.subscriptionStatus}</Badge>}
    >
      <Card className="mb-5 grid gap-4 p-5 sm:grid-cols-3">
        <Usage icon={Server} label="Servers" used={billing.serversUsed} limit={billing.limits.servers} />
        <Usage icon={Users} label="Members" used={billing.membersUsed} limit={billing.limits.members} />
        <Usage icon={ShieldCheck} label="Metrics history" used={billing.limits.metricRetentionDays} limit={billing.limits.metricRetentionDays} suffix="days" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {ORDER.map((plan) => {
          const details = plans[plan]
          const current = billing.plan === plan
          const recommended = plan === 'pro'
          return <Card key={plan} className={cn('relative flex flex-col p-5', current && 'ring-1 ring-accent/60', recommended && !current && 'ring-1 ring-purple/40')}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-fg">{details.name}</h2><p className="mt-1 text-[12px] text-fg-muted">{plan === 'free' ? 'For a personal server' : plan === 'pro' ? 'For serious self-hosting' : 'For teams and fleets'}</p></div>
              {current && <Badge color="#6ee7b7">Current</Badge>}
              {!current && recommended && <Badge color="#8b5cf6">Popular</Badge>}
            </div>
            <div className="mt-5 flex items-end gap-1"><span className="text-3xl font-bold text-fg">${details.priceMonthly}</span><span className="pb-1 text-sm text-fg-faint">/ month</span></div>
            <ul className="my-5 flex-1 space-y-2.5 text-[13px] text-fg-muted">
              <Feature>{details.servers} connected servers</Feature>
              <Feature>{details.members} team {details.members === 1 ? 'member' : 'members'}</Feature>
              <Feature>{details.metricRetentionDays} {details.metricRetentionDays === 1 ? 'day' : 'days'} of metric history</Feature>
              {plan !== 'free' && <Feature>Telegram and webhook alerts</Feature>}
              {plan === 'team' && <Feature>Roles and security audit</Feature>}
            </ul>
            {current ? (
              billing.hasCustomer && billing.canManage
                ? <Button variant="surface" className="w-full" onClick={() => portal.mutate()} disabled={portal.isPending}><CreditCard className="h-4 w-4" />Manage subscription</Button>
                : <Button variant="surface" className="w-full" disabled>Current plan</Button>
            ) : plan === 'free' ? (
              <Button variant="surface" className="w-full" onClick={() => portal.mutate()} disabled={!billing.hasCustomer || !billing.canManage}>Manage downgrade</Button>
            ) : (
              <Button variant="primary" className="w-full" onClick={() => checkout.mutate(plan)} disabled={!billing.configured || !billing.canManage || checkout.isPending}>
                Upgrade to {details.name}<ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </Card>
        })}
      </div>

      {!billing.configured && <Card className="mt-5 border-warning/25 bg-warning/5 p-4 text-[13px] text-fg-muted">
        Payments are not connected yet. Free limits are active; an owner can connect Stripe without changing the agent setup.
      </Card>}
      {!billing.canManage && <p className="mt-4 text-[12px] text-fg-faint">Only the workspace owner can change billing.</p>}
    </Section>
  </div>
}

function Feature({ children }: { children: React.ReactNode }) {
  return <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{children}</li>
}

function Usage({ icon: Icon, label, used, limit, suffix }: { icon: typeof Server; label: string; used: number; limit: number; suffix?: string }) {
  const value = suffix ? `${used} ${suffix}` : `${used} / ${limit}`
  return <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-3 text-accent"><Icon className="h-4.5 w-4.5" /></span><div><div className="text-[12px] text-fg-faint">{label}</div><div className="mt-0.5 font-mono text-sm font-semibold text-fg">{value}</div></div></div>
}
