import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Pause, Play, Regex, ScrollText, Search, X } from 'lucide-react'
import { useInfra } from '@/hooks/useInfra'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { Section } from '@/components/ui/Section'
import { cn } from '@/lib/utils'
import type { LogLine, Service } from '@/types'
import { apiMode } from '@/services/api'
import { fetchLogs } from '@/services/operations'
import { useAuth } from '@/stores/auth'
import { useSearchParams } from 'react-router-dom'

type Level = LogLine['level']

interface Row extends LogLine {
  service: string
  serviceId: string
}

const LEVEL: Record<Level, { color: string; label: string }> = {
  error: { color: '#ff4d4f', label: 'ERR' },
  warn: { color: '#fbbf24', label: 'WRN' },
  info: { color: '#6ee7b7', label: 'INF' },
  debug: { color: '#60a5fa', label: 'DBG' },
}

const LEVELS: Level[] = ['error', 'warn', 'info', 'debug']

function buildRows(services: Service[]): Row[] {
  const rows: Row[] = []
  for (const s of services) {
    for (const l of s.recentLogs) {
      rows.push({ ...l, service: s.name, serviceId: s.id })
    }
  }
  return rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
}

/** Split text into highlighted / plain segments around a matcher. */
function highlight(text: string, re: RegExp | null) {
  if (!re) return text
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  re.lastIndex = 0
  let guard = 0
  while ((m = re.exec(text)) && guard++ < 200) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <mark key={m.index} className="rounded bg-accent/25 px-0.5 text-accent">
        {m[0] || ' '}
      </mark>,
    )
    last = m.index + (m[0].length || 1)
    if (m[0].length === 0) re.lastIndex++ // avoid zero-width infinite loop
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function LogsPage() {
  const [searchParams] = useSearchParams()
  const { data, isLoading } = useInfra()
  const accessToken = useAuth((state) => state.accessToken)
  const remoteLogs = useQuery({
    queryKey: ['logs'],
    enabled: apiMode === 'production' && Boolean(accessToken),
    queryFn: () => fetchLogs(accessToken!),
    refetchInterval: 10_000,
  })
  const [query, setQuery] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [muted, setMuted] = useState<Set<Level>>(new Set())
  const [serviceId, setServiceId] = useState<string>(() => searchParams.get('service') ?? 'all')
  const [follow, setFollow] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)

  const allRows = useMemo(() => {
    if (apiMode === 'production') return remoteLogs.data?.logs.map((line) => ({ ...line, service: line.serviceName })) ?? []
    return data ? buildRows(data.services) : []
  }, [data, remoteLogs.data])

  const matcher = useMemo<RegExp | null>(() => {
    if (!query) return null
    try {
      return new RegExp(useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    } catch {
      return null // invalid regex — treat as no filter, flagged in UI
    }
  }, [query, useRegex])

  const regexError = useRegex && query !== '' && matcher === null

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (muted.has(r.level)) return false
      if (serviceId !== 'all' && r.serviceId !== serviceId) return false
      if (query && matcher) {
        matcher.lastIndex = 0
        if (!matcher.test(r.text)) return false
      } else if (query && !regexError) {
        if (!r.text.toLowerCase().includes(query.toLowerCase())) return false
      }
      return true
    })
  }, [allRows, muted, serviceId, query, matcher, regexError])

  // Auto-scroll to newest while following.
  useLayoutEffect(() => {
    if (follow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [rows, follow])

  // If the user scrolls up, pause following; re-follow when back at bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      setFollow(atBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  if (isLoading || (apiMode === 'production' && remoteLogs.isLoading) || !data) return <PageSkeleton />
  if (remoteLogs.isError) return <p className="text-danger">Could not load live logs.</p>

  const toggleLevel = (lv: Level) =>
    setMuted((prev) => {
      const next = new Set(prev)
      if (next.has(lv)) next.delete(lv)
      else next.add(lv)
      return next
    })

  const counts = LEVELS.reduce<Record<Level, number>>(
    (a, lv) => ({ ...a, [lv]: allRows.filter((r) => r.level === lv).length }),
    { error: 0, warn: 0, info: 0, debug: 0 },
  )

  return (
    <Section
      title="Logs"
      subtitle={`${rows.length} of ${allRows.length} lines · live tail across ${data.services.length} services`}
      action={
        <button
          onClick={() => {
            setFollow((f) => {
              const nf = !f
              if (nf && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              return nf
            })
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition-colors',
            follow
              ? 'border-accent/40 bg-accent/12 text-accent'
              : 'border-border bg-surface-2 text-fg-muted hover:text-fg',
          )}
        >
          {follow ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {follow ? 'Following' : 'Paused'}
        </button>
      }
    >
      <div className="rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border-soft p-3">
          <div
            className={cn(
              'flex min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border bg-[#0b0c10] px-2.5',
              regexError ? 'border-danger/60' : 'border-border',
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-fg-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={useRegex ? 'regex…  e.g. \\b5\\d{2}\\b' : 'search logs…'}
              className="h-8 w-full bg-transparent font-mono text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-fg-faint hover:text-fg">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setUseRegex((v) => !v)}
              title="Regular expression"
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors',
                useRegex ? 'bg-accent/15 text-accent' : 'text-fg-faint hover:text-fg',
              )}
            >
              <Regex className="h-4 w-4" />
            </button>
          </div>

          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="h-9 rounded-[10px] border border-border bg-surface-2 px-2.5 text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <option value="all">All services</option>
            {data.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {LEVELS.map((lv) => {
              const on = !muted.has(lv)
              return (
                <button
                  key={lv}
                  onClick={() => toggleLevel(lv)}
                  className={cn(
                    'rounded-md border px-2 py-1 font-mono text-[11px] font-semibold transition-opacity',
                    on ? 'opacity-100' : 'opacity-35',
                  )}
                  style={{
                    color: LEVEL[lv].color,
                    borderColor: `${LEVEL[lv].color}40`,
                    backgroundColor: `${LEVEL[lv].color}12`,
                  }}
                  title={`${counts[lv]} ${lv}`}
                >
                  {LEVEL[lv].label} {counts[lv]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Terminal */}
        <div ref={scrollRef} className="h-[calc(100vh-19rem)] min-h-[320px] overflow-y-auto bg-[#0b0c10] p-3 font-mono">
          {rows.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-[13px] text-fg-faint">
              <div>
                <ScrollText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                {regexError ? 'invalid regular expression' : 'no lines match the current filters'}
              </div>
            </div>
          ) : (
            rows.map((r, i) => {
              const m = LEVEL[r.level]
              const time = new Date(r.ts).toLocaleTimeString('en-GB', { hour12: false })
              return (
                <motion.div
                  key={`${r.serviceId}-${r.ts}-${i}`}
                  initial={i > rows.length - 4 ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  className="flex items-baseline gap-2.5 py-0.5 text-[12.5px] leading-relaxed hover:bg-white/[0.02]"
                >
                  <span className="shrink-0 text-fg-faint/70">{time}</span>
                  <span className="w-9 shrink-0 font-semibold" style={{ color: m.color }}>
                    {m.label}
                  </span>
                  <span className="w-24 shrink-0 truncate text-fg-faint" title={r.service}>
                    {r.service}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 break-words',
                      r.level === 'error'
                        ? 'text-danger/90'
                        : r.level === 'warn'
                          ? 'text-warning/90'
                          : 'text-fg-muted',
                    )}
                  >
                    {highlight(r.text, matcher)}
                  </span>
                </motion.div>
              )
            })
          )}
        </div>
      </div>
    </Section>
  )
}
