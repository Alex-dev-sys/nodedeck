import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

function legacyKey(secret: string) {
  return createHash('sha256').update(secret).digest()
}

function key(secret: string) {
  return createHmac('sha256', secret).update('nodedeck:notification-secrets:v1').digest()
}

export function sealSecret(value: unknown, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv, tag, encrypted].map((part) => typeof part === 'string' ? part : part.toString('base64url')).join('.')
}

export function openSecret<T>(value: string, secret: string): T {
  const parts = value.split('.')
  const versioned = parts[0] === 'v1'
  const [ivValue, tagValue, encryptedValue] = versioned ? parts.slice(1) : parts
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted configuration')
  const decipher = createDecipheriv('aes-256-gcm', versioned ? key(secret) : legacyKey(secret), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ])
  return JSON.parse(plain.toString('utf8')) as T
}
