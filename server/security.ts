import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { Pool } from 'pg'

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
const MAX_URL_LENGTH = 2_048
const MAX_AUTHORIZATION_LENGTH = 512

export interface RateLimitOptions {
  scope: string
  limit: number
  windowSeconds: number
  key: (req: Request) => string
  cost?: (req: Request) => number
}

export function clientAddress(req: Request) {
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 128)
}

export function agentCredentialKey(req: Request) {
  const authorization = req.header('authorization')
  if (authorization?.startsWith('Agent ') && authorization.length <= MAX_AUTHORIZATION_LENGTH) {
    return `agent:${createHash('sha256').update(authorization.slice(6)).digest('hex')}`
  }
  return `ip:${clientAddress(req)}`
}

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  })

  if (!ALLOWED_METHODS.has(req.method)) {
    res.setHeader('Allow', [...ALLOWED_METHODS].join(', '))
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (req.originalUrl.length > MAX_URL_LENGTH) {
    res.status(414).json({ error: 'uri_too_long' })
    return
  }
  const authorization = req.header('authorization')
  if (authorization && authorization.length > MAX_AUTHORIZATION_LENGTH) {
    res.status(400).json({ error: 'authorization_header_too_large' })
    return
  }
  const contentLength = Number(req.header('content-length') ?? 0)
  const hasBody = (Number.isFinite(contentLength) && contentLength > 0) || req.header('transfer-encoding') !== undefined
  if (hasBody && ['POST', 'PUT'].includes(req.method) && !req.is('application/json')) {
    res.status(415).json({ error: 'unsupported_media_type' })
    return
  }
  next()
}

export function rateLimit(pool: Pool, options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const keyHash = createHash('sha256').update(options.key(req)).digest('hex')
    const requestedCost = Math.floor(options.cost?.(req) ?? 1)
    const cost = Number.isFinite(requestedCost) ? Math.min(options.limit, Math.max(1, requestedCost)) : 1
    const result = await pool.query<{ attempts: number; retryAfter: number }>(
      `INSERT INTO private.security_rate_limits (scope, key_hash, window_start, attempts, expires_at)
       VALUES (
         $1, $2,
         to_timestamp(floor(extract(epoch FROM clock_timestamp()) / $3::integer) * $3::integer),
         $4::integer,
         to_timestamp((floor(extract(epoch FROM clock_timestamp()) / $3::integer) + 1) * $3::integer)
       )
       ON CONFLICT (scope, key_hash, window_start) DO UPDATE
         SET attempts = private.security_rate_limits.attempts + EXCLUDED.attempts
       RETURNING attempts,
         GREATEST(1, ceil(extract(epoch FROM (expires_at - clock_timestamp()))))::integer AS "retryAfter"`,
      [options.scope, keyHash, options.windowSeconds, cost],
    )
    const current = result.rows[0]
    const remaining = Math.max(0, options.limit - current.attempts)
    res.set({
      'RateLimit-Limit': String(options.limit),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(current.retryAfter),
    })
    if (current.attempts > options.limit) {
      res.setHeader('Retry-After', String(current.retryAfter))
      res.status(429).json({ error: 'rate_limit_exceeded', retryAfter: current.retryAfter })
      return
    }
    next()
  }
}

export function safeEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
