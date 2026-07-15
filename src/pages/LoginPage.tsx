import { type FormEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { KeyRound, Server } from 'lucide-react'
import { localSession, login } from '@/services/auth'
import { ApiError } from '@/services/api'
import { useAuth } from '@/stores/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuth((state) => state.setSession)
  const accessToken = useAuth((state) => state.accessToken)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkingLocal, setCheckingLocal] = useState(true)

  useEffect(() => {
    void localSession().then((session) => {
      if (session) {
        setSession(session.accessToken, session.user)
        navigate('/', { replace: true })
      }
    }).catch(() => undefined).finally(() => setCheckingLocal(false))
  }, [navigate, setSession])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const session = await login(email, password)
      setSession(session.accessToken, session.user)
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  if (accessToken) return <Navigate to="/" replace />
  if (checkingLocal) return <main className="grid min-h-screen place-items-center bg-canvas text-fg-muted">Opening local dashboard…</main>

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-5">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/20">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-accent"><Server className="h-5 w-5" /></div>
        <h1 className="mt-5 text-xl font-semibold text-fg">Sign in to NodeDeck</h1>
        <p className="mt-1 text-sm text-fg-muted">Use your organization account to access infrastructure.</p>
        <label className="mt-6 block text-sm text-fg-muted">Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-fg outline-none focus:border-accent" />
        </label>
        <label className="mt-4 block text-sm text-fg-muted">Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-fg outline-none focus:border-accent" />
        </label>
        {error && <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button disabled={submitting} className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-[#04150e] disabled:cursor-wait disabled:opacity-70">
          <KeyRound className="h-4 w-4" />{submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
