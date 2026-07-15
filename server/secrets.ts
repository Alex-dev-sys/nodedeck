import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function key(secret: string) {
  return createHash('sha256').update(secret).digest()
}

export function sealSecret(value: unknown, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

export function openSecret<T>(value: string, secret: string): T {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted configuration')
  const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ])
  return JSON.parse(plain.toString('utf8')) as T
}

