import { afterEach, describe, expect, it, vi } from 'vitest'
import { register } from './auth'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registration client', () => {
  it('creates a workspace and returns the authenticated session', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      accessToken: 'access-token',
      user: { id: 'user-1', email: 'owner@acme.test', role: 'owner', organizationId: 'org-1' },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(register('Acme', 'owner@acme.test', 'a-strong-registration-password')).resolves.toMatchObject({ accessToken: 'access-token' })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/register', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ organizationName: 'Acme', email: 'owner@acme.test', password: 'a-strong-registration-password' }),
    }))
  })

  it('shows a useful message when the email already exists', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'email_exists' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(register('Acme', 'owner@acme.test', 'a-strong-registration-password')).rejects.toMatchObject({
      message: 'An account with this email already exists.',
      status: 409,
      code: 'email_exists',
    })
  })
})
