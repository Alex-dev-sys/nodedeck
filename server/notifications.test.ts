import { describe, expect, it, vi } from 'vitest'
import { NotificationDeliveryError, sendNotification, validateWebhookUrl } from './notifications.js'

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
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response('{"ok":true}', { status: 200 }))
    const botToken = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789'
    await sendNotification({ kind: 'telegram', botToken, chatId: '-10001' }, alert, fetchImpl as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`https://api.telegram.org/bot${botToken}/sendMessage`)
    expect(url).not.toContain('%3A')
    expect(String(init?.body)).toContain('Server agent is offline')
    expect(String(init?.body)).not.toContain(botToken)
    expect(JSON.parse(String(init?.body))).toMatchObject({ chat_id: '-10001', link_preview_options: { is_disabled: true } })
  })

  it('turns Telegram chat errors into an actionable safe message', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":false,"description":"Bad Request: chat not found"}', { status: 400 }))
    await expect(sendNotification({
      kind: 'telegram',
      botToken: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789',
      chatId: '999',
    }, alert, fetchImpl as typeof fetch)).rejects.toMatchObject({
      name: 'NotificationDeliveryError',
      status: 422,
      message: expect.stringContaining('press Start'),
    })
  })

  it('rejects malformed Telegram tokens before making a request', async () => {
    const fetchImpl = vi.fn()
    await expect(sendNotification({ kind: 'telegram', botToken: 'not-a-token', chatId: '1' }, alert, fetchImpl as typeof fetch))
      .rejects.toBeInstanceOf(NotificationDeliveryError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts a versioned Slack and Discord compatible webhook payload', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }))
    await sendNotification({ kind: 'webhook', url: 'https://8.8.8.8/hooks/nodedeck' }, alert, fetchImpl as typeof fetch)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://8.8.8.8/hooks/nodedeck')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      event: 'nodedeck.alert.opened',
      version: 1,
      content: expect.stringContaining('Server agent is offline'),
      text: expect.stringContaining('Server agent is offline'),
      alert: { id: 'alert-1' },
    })
  })
})
