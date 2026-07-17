import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { agentCredentialKey, clientAddress, rateLimit, safeEqual } from './security.js'

function request(headers: Record<string, string> = {}, remoteAddress = '127.0.0.1') {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    socket: { remoteAddress },
  } as Request
}

describe('security helpers', () => {
  it('uses Vercel-provided client addresses and never returns an agent token', () => {
    const req = request({ 'x-forwarded-for': '203.0.113.10', authorization: 'Agent super-secret-agent-token' })
    expect(clientAddress(req)).toBe('203.0.113.10')
    expect(agentCredentialKey(req)).not.toContain('super-secret-agent-token')
  })

  it('compares secrets without accepting missing or partial values', () => {
    expect(safeEqual('same-secret', 'same-secret')).toBe(true)
    expect(safeEqual('same-secret', 'same-secre')).toBe(false)
    expect(safeEqual(undefined, 'same-secret')).toBe(false)
  })

  it('returns 429 after the configured database-backed limit', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ attempts: 2, retryAfter: 30 }] })
      .mockResolvedValueOnce({ rows: [{ attempts: 3, retryAfter: 29 }] })
    const pool = { query } as never
    const middleware = rateLimit(pool, { scope: 'test', limit: 2, windowSeconds: 60, key: () => 'identity' })
    const set = vi.fn()
    const setHeader = vi.fn()
    const status = vi.fn().mockReturnThis()
    const json = vi.fn()
    const res = { set, setHeader, status, json } as never
    const next = vi.fn()

    await middleware(request(), res, next)
    await middleware(request(), res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).toHaveBeenCalledWith(429)
    expect(json).toHaveBeenCalledWith({ error: 'rate_limit_exceeded', retryAfter: 29 })
    expect(query.mock.calls[0][1]).not.toContain('identity')
  })
})
