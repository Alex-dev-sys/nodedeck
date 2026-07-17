import { describe, expect, it, vi } from 'vitest'
import { sendNotification, validateWebhookUrl } from './notifications.js'

const alert = {
  id: 'alert-1',
  kind: 'agent_offline',
  title: 'Server agent is offline',
  details: { hostname: 'host-1' },
  openedAt: '2026-07-14T12:00:00.000Z',
}

describe('notification delivery', () => {
  it('rejects local and insecure webhook targets', () => {
    expect(() => validateWebhookUrl('http://example.com/hook')).toThrow('HTTPS')
    expect(() => validateWebhookUrl('https://127.0.0.1/hook')).toThrow('Private')
    expect(() => validateWebhookUrl('https://100.64.0.1/hook')).toThrow('Private')
    expect(() => validateWebhookUrl('https://[fe90::1]/hook')).toThrow('Private')
    expect(() => validateWebhookUrl('https://[::ffff:7f00:1]/hook')).toThrow('Private')
    expect(() => validateWebhookUrl('https://[64:ff9b::7f00:1]/hook')).toThrow('Private')
    expect(() => validateWebhookUrl('https://localhost/hook')).toThrow('Private')
  })

  it('posts a Telegram message without exposing the token in the body', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response('{}', { status: 200 }))
    await sendNotification({ kind: 'telegram', botToken: '123456:secret-token-value', chatId: '-10001' }, alert, fetchImpl as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toContain('api.telegram.org')
    expect(String(init?.body)).toContain('Server agent is offline')
    expect(String(init?.body)).not.toContain('secret-token-value')
  })
})
