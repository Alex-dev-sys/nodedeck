import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import type { Config } from './config.js'
import { verifyAccessToken, type AuthUser, type Role } from './auth.js'
import { NotificationDeliveryError } from './notifications.js'

export interface AuthenticatedRequest extends Request {
  user?: AuthUser
  requestId?: string
}

export function requireAuth(config: Config) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const value = req.header('authorization')
    if (!value?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'authentication_required' })
      return
    }
    try {
      req.user = verifyAccessToken(value.slice(7), config)
      next()
    } catch {
      res.status(401).json({ error: 'invalid_access_token' })
    }
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'insufficient_permissions' })
      return
    }
    next()
  }
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'invalid_request', details: error.flatten(), requestId: (req as AuthenticatedRequest).requestId })
    return
  }
  if (error instanceof NotificationDeliveryError) {
    console.warn(JSON.stringify({
      event: 'notification.delivery_failed',
      requestId: (req as AuthenticatedRequest).requestId,
      channelKind: error.channelKind,
      ...(error.providerStatus ? { providerStatus: error.providerStatus } : {}),
    }))
    res.status(error.status).json({ error: error.code, message: error.message, requestId: (req as AuthenticatedRequest).requestId })
    return
  }
  const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined
  if (status === 400 || status === 413 || status === 415) {
    const code = status === 413 ? 'payload_too_large' : status === 415 ? 'unsupported_media_type' : 'invalid_json'
    res.status(status).json({ error: code, requestId: (req as AuthenticatedRequest).requestId })
    return
  }
  const publicCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    && /^[a-z0-9_]{1,64}$/.test(error.code) ? error.code : undefined
  if (status && [402, 403, 404, 409, 429, 503].includes(status) && publicCode) {
    const message = error instanceof Error ? error.message : undefined
    res.status(status).json({ error: publicCode, ...(message ? { message } : {}), requestId: (req as AuthenticatedRequest).requestId })
    return
  }
  const unsafeCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  const code = typeof unsafeCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(unsafeCode) ? unsafeCode : undefined
  console.error(JSON.stringify({
    event: 'request.failed',
    requestId: (req as AuthenticatedRequest).requestId,
    error: error instanceof Error ? error.name : 'unknown',
    ...(code ? { code } : {}),
  }))
  res.status(500).json({ error: 'internal_server_error', requestId: (req as AuthenticatedRequest).requestId })
}
