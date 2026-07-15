import { useState } from 'react'
import type { ServiceStatus } from '@/types'
import { useInfra } from '@/hooks/useInfra'
import { Section } from '@/components/ui/Section'
import { ServiceCard } from '@/components/infrastructure/ServiceCard'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { cn } from '@/lib/utils'

type Filter = 'all' | ServiceStatus

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'degraded', label: 'Degraded' },
  { key: 'restarting', label: 'Restarting' },
  { key: 'offline', label: 'Offline' },
]
const FILTER_KEY = 'infra-service-filter:v1'

function initialFilter(): Filter {
  try {
    const saved = window.localStorage.getItem(FILTER_KEY)
    return FILTERS.some((filter) => filter.key === saved) ? saved as Filter : 'all'
  } catch {
    return 'all'
  }
}

export function InfrastructurePage() {
  const { data, isLoading } = useInfra()
  const [filter, setFilter] = useState<Filter>(initialFilter)

  const chooseFilter = (next: Filter) => {
    setFilter(next)
    window.localStorage.setItem(FILTER_KEY, next)
  }

  if (isLoading || !data) return <PageSkeleton />

  const services = data.services.filter((s) => filter === 'all' || s.status === filter)

  return (
    <Section
      title="Services"
      subtitle={`${data.summary.total} services across ${new Set(data.services.map((s) => s.hostname)).size} hosts`}
      action={
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
          {FILTERS.map((f) => {
            const count =
              f.key === 'all'
                ? data.services.length
                : data.services.filter((s) => s.status === f.key).length
            return (
              <button
                key={f.key}
                onClick={() => chooseFilter(f.key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
                  filter === f.key ? 'bg-surface-2 text-fg' : 'text-fg-faint hover:text-fg-muted',
                )}
              >
                {f.label}
                <span className="ml-1.5 text-fg-faint">{count}</span>
              </button>
            )
          })}
        </div>
      }
    >
      {services.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface py-16 text-center text-[13px] text-fg-faint">
          No services in this state.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {services.map((s, i) => (
            <ServiceCard key={s.id} service={s} index={i} />
          ))}
        </div>
      )}
    </Section>
  )
}
