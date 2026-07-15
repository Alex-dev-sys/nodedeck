export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-56 animate-pulse rounded-[var(--radius-card)] border border-border bg-surface" />
      <div className="h-[420px] animate-pulse rounded-[var(--radius-card)] border border-border bg-surface" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-52 animate-pulse rounded-[var(--radius-card)] border border-border bg-surface"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
