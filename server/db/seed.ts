import 'dotenv/config'
import { loadConfig } from '../config.js'
import { hashPassword } from '../auth.js'
import { createPool } from './pool.js'

async function seed() {
  const config = loadConfig()
  if (!config.BOOTSTRAP_EMAIL || !config.BOOTSTRAP_PASSWORD) {
    throw new Error('BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD are required to seed an owner account')
  }

  const pool = createPool(config)
  try {
    const passwordHash = await hashPassword(config.BOOTSTRAP_PASSWORD)
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [config.BOOTSTRAP_EMAIL.toLowerCase(), passwordHash],
    )
    const organization = await pool.query<{ id: string }>(
      `SELECT id FROM organizations WHERE name = 'Default organization'`,
    )
    if (!organization.rowCount) throw new Error('Default organization is missing after migrations')
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [organization.rows[0].id, owner.rows[0].id],
    )
    console.info(`Owner account ready: ${config.BOOTSTRAP_EMAIL}`)
  } finally {
    await pool.end()
  }
}

seed().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
