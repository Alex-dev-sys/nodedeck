import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Search } from 'lucide-react'
import { useUI } from '@/stores/ui'
import { useInfra } from '@/hooks/useInfra'
import { NAV } from '@/lib/nav'
import { kindIcon, statusMeta } from '@/lib/serviceMeta'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette() {
  const open = useUI((s) => s.commandOpen)
  const setOpen = useUI((s) => s.setCommandOpen)
  const openDrawer = useUI((s) => s.openDrawer)
  const navigate = useNavigate()
  const { data } = useInfra()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = NAV.map((n) => ({
      id: `nav-${n.to}`,
      label: n.label,
      hint: 'Navigate',
      icon: <n.icon className="h-4 w-4 text-fg-muted" />,
      run: () => navigate(n.to),
    }))
    const svc: Item[] = (data?.services ?? []).map((s) => {
      const Icon = kindIcon[s.kind]
      return {
        id: `svc-${s.id}`,
        label: s.name,
        hint: statusMeta[s.status].label,
        icon: (
          <span className="relative">
            <Icon className="h-4 w-4" style={{ color: statusMeta[s.status].hex }} />
          </span>
        ),
        run: () => openDrawer(s.id),
      }
    })
    return [...svc, ...nav]
  }, [data, navigate, openDrawer])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return items
    return items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(t))
  }, [items, q])

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      const t = setTimeout(() => inputRef.current?.focus(), 40)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [q])

  const choose = (i: Item | undefined) => {
    if (!i) return
    i.run()
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(filtered[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 440, damping: 34 }}
            className="glass relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-pop)]"
            onKeyDown={onKey}
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-fg-faint" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search services and pages…"
                className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint"
              />
              <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-faint">
                ESC
              </kbd>
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <div className="px-3 py-8 text-center text-[13px] text-fg-faint">No results</div>
              )}
              {filtered.map((i, idx) => (
                <button
                  key={i.id}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => choose(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    idx === active ? 'bg-surface-2' : 'hover:bg-surface-2/50',
                  )}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3">
                    {i.icon}
                  </span>
                  <span className="flex-1 text-[14px] text-fg">{i.label}</span>
                  <span className="text-[11px] text-fg-faint">{i.hint}</span>
                  {idx === active && <CornerDownLeft className="h-3.5 w-3.5 text-fg-faint" />}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
