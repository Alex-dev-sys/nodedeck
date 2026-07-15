import { Link, useRouteError } from 'react-router-dom'
import { RefreshCcw, TriangleAlert } from 'lucide-react'

export function RouteErrorPage() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : 'The requested view is unavailable.'

  return (
    <main className="grid min-h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-danger/12 text-danger">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-fg">Could not load this view</h1>
        <p className="mt-2 text-[13px] text-fg-muted">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/" className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-[#04150e]">
            Dashboard
          </Link>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-[13px] text-fg-muted hover:text-fg">
            <RefreshCcw className="h-3.5 w-3.5" /> Reload
          </button>
        </div>
      </div>
    </main>
  )
}
