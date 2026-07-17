import { Pool, type PoolClient } from 'pg'
import type { Config } from '../config.js'

export function createPool(config: Config) {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
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
