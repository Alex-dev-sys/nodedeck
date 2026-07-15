import type { Request, Response } from 'express'
import { runMaintenance } from '../server/maintenance.js'
import { vercelConfig, vercelPool } from '../server/vercel-app.js'

export default async function cron(req: Request, res: Response) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.header('authorization') !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'invalid_cron_authorization' })
    return
  }

  await runMaintenance(vercelPool, vercelConfig)
  res.json({ ok: true })
}

