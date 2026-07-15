import type { InfraSnapshot } from '@/types'
import { api } from './api'

// ── Time-series history for the monitoring charts ───────────
// The mock engine only holds *current* metrics, so this module accumulates a
// rolling buffer of real samples off the live subscription. Production history
// is loaded from the API; this buffer exists only for the in-memory demo mode.

export interface Sample {
  t: number // epoch ms
  cpu: number // %
  ram: number // %
  disk: number // %
  net: number // Mbps (fleet avg)
  ping: number // ms (fleet avg)
}

export type MetricKey = keyof Omit<Sample, 't'>

const CAP = 1200 // ~40min of real samples at the 2s engine cadence
const buf: Sample[] = []
const listeners = new Set<() => void>()
let stopIngest: (() => void) | null = null
let consumers = 0

function avg(snap: InfraSnapshot, sel: (m: number) => number, pick: (m: InfraSnapshot['services'][number]['metrics']) => number): number {
  const live = snap.services.filter((s) => s.status !== 'offline')
  if (!live.length) return 0
  return sel(live.reduce((a, s) => a + pick(s.metrics), 0) / live.length)
}

function ingest(snap: InfraSnapshot) {
  const sample: Sample = {
    t: snap.serverTimeMs,
    cpu: snap.host.cpu,
    ram: snap.host.ram,
    disk: snap.host.disk,
    net: avg(snap, (x) => x, (m) => m.network),
    ping: avg(snap, (x) => x, (m) => m.ping),
  }
  buf.push(sample)
  if (buf.length > CAP) buf.shift()
  listeners.forEach((l) => l())
}

/** Reference-counted: only collect while at least one monitoring view is mounted. */
export function startMetricHistory() {
  consumers++
  if (!stopIngest) stopIngest = api.subscribe(ingest)

  return () => {
    consumers--
    if (consumers === 0) {
      stopIngest?.()
      stopIngest = null
    }
  }
}

export function subscribeHistory(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getSampleCount() {
  return buf.length
}

export const RANGES = [
  { key: '15m', label: '15m', ms: 15 * 60_000 },
  { key: '1h', label: '1h', ms: 60 * 60_000 },
  { key: '6h', label: '6h', ms: 6 * 3600_000 },
  { key: '24h', label: '24h', ms: 24 * 3600_000 },
  { key: '7d', label: '7d', ms: 7 * 86400_000 },
  { key: '30d', label: '30d', ms: 30 * 86400_000 },
] as const

export type RangeKey = (typeof RANGES)[number]['key']

export interface SeriesRow {
  t: number
  cpu: number
  ram: number
  disk: number
  net: number
  ping: number
}

/** Return only measurements that were actually observed. */
export function seriesForRange(rangeMs: number, nowMs: number): SeriesRow[] {
  const start = nowMs - rangeMs
  return buf.filter((sample) => sample.t >= start && sample.t <= nowMs)
}
