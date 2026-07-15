import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getSampleCount,
  seriesForRange,
  startMetricHistory,
  subscribeHistory,
  type SeriesRow,
} from '@/services/metricHistory'
import { apiMode } from '@/services/api'
import { fetchHostMetrics } from '@/services/operations'
import { useAuth } from '@/stores/auth'
import { RANGES } from '@/services/metricHistory'

/** Live metric history for a given time range. Re-renders on every new sample
 *  (the engine tick) so the chart tail advances in real time. */
export function useMetricHistory(rangeMs: number): SeriesRow[] {
  const accessToken = useAuth((state) => state.accessToken)
  const range = RANGES.find((item) => item.ms === rangeMs)?.key ?? '1h'
  useEffect(() => {
    if (apiMode !== 'production') return startMetricHistory()
  }, [])

  // Bump on every ingested sample.
  const count = useSyncExternalStore(subscribeHistory, getSampleCount, getSampleCount)
  const remote = useQuery({
    queryKey: ['host-metrics', range],
    enabled: apiMode === 'production' && Boolean(accessToken),
    queryFn: () => fetchHostMetrics(accessToken!, range),
    refetchInterval: 20_000,
  })

  return useMemo(
    () => apiMode === 'production'
      ? (remote.data?.metrics ?? []).map((row) => ({
          t: Date.parse(row.ts),
          cpu: Number(row.cpu),
          ram: Number(row.ram),
          disk: Number(row.disk),
          net: 0,
          ping: 0,
        }))
      : seriesForRange(rangeMs, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeMs, count, remote.data],
  )
}
