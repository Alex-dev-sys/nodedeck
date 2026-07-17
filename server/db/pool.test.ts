import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { databaseTls } from './pool.js'

function config(databaseUrl: string, ssl: 'true' | 'false') {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: ssl,
    JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  })
}

describe('database TLS', () => {
  it('uses the official Supabase CA with certificate verification', () => {
    expect(databaseTls(config('postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres', 'true'))).toMatchObject({
      rejectUnauthorized: true,
      ca: expect.stringContaining('BEGIN CERTIFICATE'),
    })
  })

  it('uses the system trust store for other Postgres providers', () => {
    expect(databaseTls(config('postgresql://user:pass@db.example.com:5432/app', 'true'))).toEqual({ rejectUnauthorized: true })
  })

  it('keeps TLS disabled for an explicitly local database', () => {
    expect(databaseTls(config('postgresql://user:pass@postgres:5432/app', 'false'))).toBeUndefined()
  })
})
