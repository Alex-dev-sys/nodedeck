import { isIP } from 'node:net'
import { resolve4, resolve6 } from 'node:dns/promises'
import type { Config } from './config.js'
import { openSecret } from './secrets.js'

export type NotificationChannelConfig =
  | { kind: 'telegram'; botToken: string; chatId: string }
  | { kind: 'webhook'; url: string }

export interface AlertNotification {
  id: string
  kind: string
  title: string
  details: Record<string, unknown>
  openedAt: string
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
]

function privateAddress(address: string) {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true
  if (address.startsWith('::ffff:')) return privateAddress(address.slice(7))
  return PRIVATE_V4.some((pattern) => pattern.test(address))
}

export function validateWebhookUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS')
  if (url.username || url.password) throw new Error('Webhook URL cannot contain credentials')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || privateAddress(hostname)) throw new Error('Private webhook targets are not allowed')
  return url.toString()
}

async function assertPublicTarget(url: string) {
  const hostname = new URL(url).hostname
  if (isIP(hostname)) {
    if (privateAddress(hostname)) throw new Error('Private webhook targets are not allowed')
    return
  }
  const addresses = [...await resolve4(hostname).catch(() => []), ...await resolve6(hostname).catch(() => [])]
  if (addresses.length === 0) throw new Error('Webhook hostname could not be resolved')
  if (addresses.some(privateAddress)) throw new Error('Private webhook targets are not allowed')
}

function message(alert: AlertNotification) {
  const details = Object.entries(alert.details ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 5)
    .map(([name, value]) => `${name}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join('\n')
  return `NodeDeck · ${alert.title}\n${alert.kind}${details ? `\n${details}` : ''}`
}

export async function sendNotification(config: NotificationChannelConfig, alert: AlertNotification, fetchImpl: typeof fetch = fetch) {
  const text = message(alert)
  if (config.kind === 'telegram') {
    const response = await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}`)
    return
  }

  const url = validateWebhookUrl(config.url)
  await assertPublicTarget(url)
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'NodeDeck/1.0' },
    body: JSON.stringify({
      event: 'server_os.alert.opened',
      content: text,
      text,
      alert,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`)
}

export function decryptChannel(value: string, config: Config) {
  return openSecret<NotificationChannelConfig>(value, config.JWT_SECRET)
}
