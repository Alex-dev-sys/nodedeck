import { describe, expect, it } from 'vitest'
import { hashPassword, signAccessToken, verifyAccessToken, verifyPassword } from './auth.js'
import { loadConfig } from './config.js'

const config = loadConfig({
  NODE_ENV: 'test',
  PORT: '8787',
  CORS_ORIGIN: 'http://127.0.0.1:5173',
  DATABASE_URL: 'postgresql://infra:infra@127.0.0.1:5433/infra_dashboard',
  JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
})

describe('backend authentication', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('a-long-test-password')

    await expect(verifyPassword('a-long-test-password', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false)
  })

  it('round-trips signed access tokens with the user role', () => {
    const token = signAccessToken({ id: '2d73364e-ffbf-4457-9251-9013ab66c30d', email: 'owner@example.com', role: 'owner', organizationId: '9643a61f-d9ea-4177-a2a4-f1ac12dba70e' }, config)

    expect(verifyAccessToken(token, config)).toEqual({
      id: '2d73364e-ffbf-4457-9251-9013ab66c30d',
      email: 'owner@example.com',
      role: 'owner',
      organizationId: '9643a61f-d9ea-4177-a2a4-f1ac12dba70e',
    })
  })

  it('rejects a short JWT secret before the server starts', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://infra:infra@127.0.0.1:5433/infra_dashboard',
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('Invalid server configuration')
  })

  it('parses the cookie security flag explicitly', () => {
    const base = {
      DATABASE_URL: 'postgresql://infra:infra@127.0.0.1:5433/infra_dashboard',
      JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
    }

    expect(loadConfig({ ...base, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false)
    expect(loadConfig({ ...base, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true)
    expect(loadConfig({ ...base, HOST_ALERT_THRESHOLD: '85' }).HOST_ALERT_THRESHOLD).toBe(85)
  })
})
