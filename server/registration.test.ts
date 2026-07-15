import type { Pool, PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { verifyPassword } from './auth.js'
import { registerOwner, RegistrationConflictError } from './registration.js'

function fakePool(query: ReturnType<typeof vi.fn>) {
  const client = { query, release: vi.fn() } as unknown as PoolClient
  return {
    client,
    pool: { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool,
  }
}

describe('owner registration', () => {
  it('creates the organization, owner, membership and session atomically', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'org-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'owner@acme.test' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
    const { pool, client } = fakePool(query)

    const result = await registerOwner(pool, {
      organizationName: '  Acme   Cloud  ',
      email: 'OWNER@ACME.TEST',
      password: 'a-strong-registration-password',
    })

    expect(result.user).toEqual({ id: 'user-1', email: 'owner@acme.test', role: 'owner', organizationId: 'org-1' })
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(query).toHaveBeenNthCalledWith(2, 'INSERT INTO organizations (name) VALUES ($1) RETURNING id', ['Acme Cloud'])
    const passwordHash = query.mock.calls[2][1][1] as string
    await expect(verifyPassword('a-strong-registration-password', passwordHash)).resolves.toBe(true)
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back and returns a stable conflict for an existing email', async () => {
    const duplicateEmail = Object.assign(new Error('duplicate'), { code: '23505', constraint: 'users_email_key' })
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'org-1' }] })
      .mockRejectedValueOnce(duplicateEmail)
      .mockResolvedValueOnce({})
    const { pool, client } = fakePool(query)

    await expect(registerOwner(pool, {
      organizationName: 'Acme',
      email: 'owner@acme.test',
      password: 'a-strong-registration-password',
    })).rejects.toMatchObject({ code: 'email_exists' } satisfies Partial<RegistrationConflictError>)
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
    expect(client.release).toHaveBeenCalledOnce()
  })
})
