import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { createPool, inTransaction } from './pool.js'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

async function migrate() {
  const pool = createPool(loadConfig())
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()

    for (const name of files) {
      const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
      if (applied.rowCount) continue

      const sql = await readFile(join(migrationsDir, name), 'utf8')
      await inTransaction(pool, async (client) => {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      })
      console.info(`Applied ${name}`)
    }
  } finally {
    await pool.end()
  }
}

migrate().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
