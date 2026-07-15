import type { Pool } from 'pg'
import { z } from 'zod'
import { createRefreshToken, hashPassword, hashRefreshToken, type AuthUser } from './auth.js'
import { inTransaction } from './db/pool.js'

export const registrationSchema = z.object({
  organizationName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
}).strict()

export type RegistrationConflictCode = 'email_exists' | 'organization_exists'

export class RegistrationConflictError extends Error {
  constructor(readonly code: RegistrationConflictCode) {
    super(code)
    this.name = 'RegistrationConflictError'
  }
}

function conflictCode(error: unknown): RegistrationConflictCode | null {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== '23505') return null
  const constraint = 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : ''
  if (constraint === 'users_email_key') return 'email_exists'
  if (constraint === 'organizations_name_key' || constraint === 'organizations_name_lower_idx') return 'organization_exists'
  return null
}

export async function registerOwner(pool: Pool, input: z.infer<typeof registrationSchema>) {
  const email = input.email.toLowerCase()
  const organizationName = input.organizationName.trim().replace(/\s+/g, ' ')
  const passwordHash = await hashPassword(input.password)
  const refreshToken = createRefreshToken()

  try {
    const user = await inTransaction(pool, async (client): Promise<AuthUser> => {
      const organization = await client.query<{ id: string }>(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
        [organizationName],
      )
      const owner = await client.query<{ id: string; email: string }>(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'owner')
         RETURNING id, email`,
        [email, passwordHash],
      )
      const current: AuthUser = {
        id: owner.rows[0].id,
        email: owner.rows[0].email,
        role: 'owner',
        organizationId: organization.rows[0].id,
      }

      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [current.organizationId, current.id],
      )
      await client.query(
        `INSERT INTO refresh_sessions (user_id, organization_id, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '30 days')`,
        [current.id, current.organizationId, hashRefreshToken(refreshToken)],
      )
      await client.query(
        `INSERT INTO audit_logs (organization_id, actor_id, action, target, result)
         VALUES ($1, $2, 'organization.register', $3, 'ok')`,
        [current.organizationId, current.id, current.organizationId],
      )
      return current
    })
    return { user, refreshToken }
  } catch (error) {
    const code = conflictCode(error)
    if (code) throw new RegistrationConflictError(code)
    throw error
  }
}
