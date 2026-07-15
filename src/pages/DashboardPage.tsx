import { useInfra } from '@/hooks/useInfra'
import { Section } from '@/components/ui/Section'
import { HeroPanel } from '@/components/dashboard/HeroPanel'
import { ServiceCard } from '@/components/infrastructure/ServiceCard'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ActivityPanel, AttentionPanel } from '@/components/dashboard/AttentionPanel'
import { apiMode } from '@/services/api'

export function DashboardPage() {
  const { data, isLoading, error } = useInfra()

  if (isLoading) return <PageSkeleton />
  if (error) return <p className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error.message}</p>
  if (!data) return <PageSkeleton />

  const { services, summary } = data
  return (
    <div className="space-y-7">
      <HeroPanel summary={summary} />

      <div className={apiMode === 'production' ? 'grid grid-cols-1 gap-5' : 'grid grid-cols-1 gap-5 xl:grid-cols-2'}>
        <AttentionPanel services={services} />
        {apiMode !== 'production' && <ActivityPanel items={data.notifications} now={data.serverTimeMs} />}
      </div>

      <Section title="Services" subtitle={`${summary.online} online · ${summary.degraded} degraded · ${summary.offline} down`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {services.map((s, i) => (
            <ServiceCard key={s.id} service={s} index={i} />
          ))}
        </div>
      </Section>
    </div>
  )
}
