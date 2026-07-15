import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { localSession, refreshSession } from '@/services/auth'
import { useAuth } from '@/stores/auth'
import { router } from './router'

export function SessionBootstrap() {
  const isRestoring = useAuth((state) => state.isRestoring)
  const setSession = useAuth((state) => state.setSession)
  const finishRestoring = useAuth((state) => state.finishRestoring)

  useEffect(() => {
    void refreshSession().then((session) => session ?? localSession()).then((session) => { if (session) setSession(session.accessToken, session.user) }).catch(() => undefined).finally(finishRestoring)
  }, [finishRestoring, setSession])

  if (isRestoring) return <main className="grid min-h-screen place-items-center bg-canvas text-fg-muted">Restoring session…</main>
  return <RouterProvider router={router} />
}
