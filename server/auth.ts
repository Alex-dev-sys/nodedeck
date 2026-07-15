import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Config } from './config.js'

export type Role = 'owner' | 'admin' | 'operator' | 'viewer'

export interface AuthUser {
  id: string
  email: string
  role: Role
  organizationId: string
}

interface AccessClaims extends jwt.JwtPayload {
  sub: string
  email: string
  role: Role
  organizationId: string
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export function createRefreshToken() {
  return randomBytes(32).toString('base64url')
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function signAccessToken(user: AuthUser, config: Config) {
  return jwt.sign(
    { email: user.email, role: user.role, organizationId: user.organizationId },
    config.JWT_SECRET,
    { subject: user.id, expiresIn: '15m', issuer: 'infra-dashboard', audience: 'infra-dashboard-ui' },
  )
}

export function verifyAccessToken(token: string, config: Config): AuthUser {
  const claims = jwt.verify(token, config.JWT_SECRET, {
    issuer: 'infra-dashboard',
    audience: 'infra-dashboard-ui',
  }) as AccessClaims
  if (!claims.sub || !claims.email || !claims.role || !claims.organizationId) {
    throw new Error('Invalid access token claims')
  }
  return { id: claims.sub, email: claims.email, role: claims.role, organizationId: claims.organizationId }
}
