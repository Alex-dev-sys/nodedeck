import { motion } from 'framer-motion'
import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function PlaceholderPage({
  title,
  phase,
  note,
}: {
  title: string
  phase: string
  note: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid h-[70vh] place-items-center"
    >
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-purple/12 text-purple">
          <Construction className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] text-fg-muted">{note}</p>
        <div className="mt-4 flex justify-center">
          <Badge color="#8b5cf6">{phase}</Badge>
        </div>
      </Card>
    </motion.div>
  )
}
