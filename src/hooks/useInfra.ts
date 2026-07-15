import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfraSnapshot, ServiceAction } from '@/types'
import { api } from '@/services/api'
import { apiMode } from '@/services/api'
import { infraKey } from '@/app/queryClient'

/** Primary data hook. Seeds from an async fetch, then keeps the query cache
 *  live via the engine subscription (stands in for a WebSocket feed). */
export function useInfra() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: infraKey,
    // Keep the API client as the receiver: HttpApiClient#getSnapshot uses its
    // own transport and cannot be passed to React Query as an unbound method.
    queryFn: () => api.getSnapshot(),
  })

  useEffect(() => {
    const unsub = api.subscribe((snap) => {
      qc.setQueryData<InfraSnapshot>(infraKey, snap)
    })
    return unsub
  }, [qc])

  return query
}

export function useServiceAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ServiceAction }) =>
      api.dispatchAction(id, action),
    // Optimistic status flip so the UI reacts instantly.
    onMutate: async ({ id, action }) => {
      if (apiMode === 'production') return { prev: qc.getQueryData<InfraSnapshot>(infraKey) }
      await qc.cancelQueries({ queryKey: infraKey })
      const prev = qc.getQueryData<InfraSnapshot>(infraKey)
      if (prev) {
        qc.setQueryData<InfraSnapshot>(infraKey, {
          ...prev,
          services: prev.services.map((s) =>
            s.id === id
              ? { ...s, status: action === 'stop' ? 'offline' : 'restarting' }
              : s,
          ),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(infraKey, ctx.prev)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: infraKey })
      void qc.invalidateQueries({ queryKey: ['commands'] })
    },
  })
}

export function useSimulateCrash() {
  return useMutation({ mutationFn: (id: string) => api.simulateCrash(id) })
}

export function useResolveIncident() {
  return useMutation({ mutationFn: (id: string) => api.resolveIncident(id) })
}

export function useRollbackDeployment() {
  return useMutation({ mutationFn: (id: string) => api.rollbackDeployment(id) })
}

export function usePanic() {
  return useMutation({ mutationFn: () => api.panic() })
}

export function useMarkNotificationsRead() {
  return useMutation({ mutationFn: () => api.markNotificationsRead() })
}

export function useResetDemo() {
  return useMutation({ mutationFn: () => api.resetDemo() })
}
