import { describe, expect, it } from 'vitest'
import { openSecret, sealSecret } from './secrets.js'

describe('encrypted notification configuration', () => {
  const key = 'test-secret-that-is-long-enough-for-production'

  it('round-trips structured secrets without storing plaintext', () => {
    const input = { kind: 'telegram', botToken: '123456:secret-token', chatId: '-10001' }
    const encrypted = sealSecret(input, key)
    expect(encrypted).not.toContain(input.botToken)
    expect(openSecret(encrypted, key)).toEqual(input)
  })

  it('cannot be opened with another application secret', () => {
    const encrypted = sealSecret({ token: 'secret' }, key)
    expect(() => openSecret(encrypted, `${key}-different`)).toThrow()
  })
})

