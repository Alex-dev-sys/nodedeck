import type { IncomingMessage, ServerResponse } from 'node:http'
import { runMaintenance } from '../server/maintenance.js'
import { safeEqual } from '../server/security.js'
import { vercelConfig, vercelPool } from '../server/vercel-app.js'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.end(JSON.stringify(body))
}

export default async function cron(req: IncomingMessage, res: ServerResponse) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization
  if (!safeEqual(authorization, cronSecret ? `Bearer ${cronSecret}` : undefined)) {
    json(res, 401, { error: 'invalid_cron_authorization' })
    return
  }

  await runMaintenance(vercelPool, vercelConfig)
  json(res, 200, { ok: true })
}
