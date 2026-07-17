import { Pool, type PoolClient } from 'pg'
import type { Config } from '../config.js'
import { SUPABASE_ROOT_CA_2021 } from './supabase-ca.js'

export function databaseTls(config: Config) {
  if (!config.DATABASE_SSL) return undefined
  const hostname = new URL(config.DATABASE_URL).hostname.toLowerCase()
  const supabase = hostname.endsWith('.supabase.com') || hostname.endsWith('.supabase.co')
  return {
    rejectUnauthorized: true,
    ...(supabase ? { ca: SUPABASE_ROOT_CA_2021 } : {}),
  }
}

export function createPool(config: Config) {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    ssl: databaseTls(config),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
}

export async function inTransaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
