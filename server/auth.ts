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
  tokenUse: 'access'
}

const DUMMY_PASSWORD_HASH = '$2b$12$AGp3KkbxICapQ49ZW4zeUu3Y4Y904cMlIYIantO5oAY2SHjx.6JUa'
const ROLES: Role[] = ['owner', 'admin', 'operator', 'viewer']

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function verifyPasswordOrDummy(password: string, hash?: string) {
  return bcrypt.compare(password, hash ?? DUMMY_PASSWORD_HASH)
}

export function createRefreshToken() {
  return randomBytes(32).toString('base64url')
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function signAccessToken(user: AuthUser, config: Config) {
  return jwt.sign(
    { email: user.email, role: user.role, organizationId: user.organizationId, tokenUse: 'access' },
    config.JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: user.id,
      jwtid: randomBytes(16).toString('base64url'),
      expiresIn: '15m',
      issuer: 'nodedeck',
      audience: 'nodedeck-ui',
    },
  )
}

export function verifyAccessToken(token: string, config: Config): AuthUser {
  const claims = jwt.verify(token, config.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'nodedeck',
    audience: 'nodedeck-ui',
    maxAge: '15m',
    clockTolerance: 5,
  }) as AccessClaims
  if (!claims.sub || !claims.email || !ROLES.includes(claims.role) || !claims.organizationId || claims.tokenUse !== 'access') {
    throw new Error('Invalid access token claims')
  }
  return { id: claims.sub, email: claims.email, role: claims.role, organizationId: claims.organizationId }
}
