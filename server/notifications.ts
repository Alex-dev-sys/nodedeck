import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
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

export class NotificationDeliveryError extends Error {
  readonly status = 422
  readonly code = 'notification_delivery_failed'

  constructor(message: string, readonly channelKind: NotificationChannelConfig['kind'], readonly providerStatus?: number) {
    super(message)
    this.name = 'NotificationDeliveryError'
  }
}

const telegramTokenPattern = /^\d{5,16}:[A-Za-z0-9_-]{20,200}$/

function deliveryError(message: string, channelKind: NotificationChannelConfig['kind'], providerStatus?: number) {
  return new NotificationDeliveryError(message, channelKind, providerStatus)
}

function telegramErrorMessage(status: number, description?: string) {
  const normalized = description?.toLowerCase() ?? ''
  if (status === 401 || normalized.includes('unauthorized')) return 'Telegram rejected the bot token. Copy a fresh token from @BotFather.'
  if (normalized.includes('chat not found')) return 'Telegram chat was not found. Open the bot, press Start, then check the Chat ID.'
  if (status === 403 || normalized.includes('bot was blocked') || normalized.includes('kicked')) return 'Telegram cannot message this chat. Unblock the bot or add it to the chat, then try again.'
  if (status === 429) return 'Telegram is rate limiting this bot. Wait a moment and try again.'
  return `Telegram could not deliver the message (HTTP ${status}). Check the bot token and Chat ID.`
}

const blockedIpv4Addresses = new BlockList()
const blockedIpv6Addresses = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedIpv4Addresses.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['2001:db8::', 32],
] as const) blockedIpv6Addresses.addSubnet(address, prefix, 'ipv6')

function privateAddress(address: string) {
  const normalized = address.toLowerCase()
  const family = isIP(normalized)
  return family === 4
    ? blockedIpv4Addresses.check(normalized, 'ipv4')
    : family === 6 ? blockedIpv6Addresses.check(normalized, 'ipv6') : false
}

function normalizeHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized
}

export function validateWebhookUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw deliveryError('Enter a valid webhook URL.', 'webhook')
  }
  if (url.protocol !== 'https:') throw deliveryError('Webhook URL must use HTTPS.', 'webhook')
  if (url.username || url.password) throw deliveryError('Webhook URL cannot contain credentials.', 'webhook')
  const hostname = normalizeHostname(url.hostname)
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || privateAddress(hostname)) throw deliveryError('Private webhook targets are not allowed.', 'webhook')
  return url.toString()
}

async function assertPublicTarget(url: string) {
  const hostname = normalizeHostname(new URL(url).hostname)
  if (isIP(hostname)) {
    if (privateAddress(hostname)) throw deliveryError('Private webhook targets are not allowed.', 'webhook')
    return hostname
  }
  const addresses = [...await resolve4(hostname).catch(() => []), ...await resolve6(hostname).catch(() => [])]
  if (addresses.length === 0) throw deliveryError('Webhook hostname could not be resolved. Check the URL.', 'webhook')
  if (addresses.some(privateAddress)) throw deliveryError('Private webhook targets are not allowed.', 'webhook')
  return addresses[0]
}

async function sendPinnedWebhook(urlValue: string, body: string) {
  const url = new URL(urlValue)
  const address = await assertPublicTarget(urlValue)
  const pinnedUrl = new URL(url)
  pinnedUrl.hostname = isIP(address) === 6 ? `[${address}]` : address

  await new Promise<void>((resolve, reject) => {
    const request = httpsRequest(pinnedUrl, {
      method: 'POST',
      servername: isIP(normalizeHostname(url.hostname)) ? undefined : normalizeHostname(url.hostname),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Host: url.host,
        'User-Agent': 'NodeDeck/1.0',
      },
      timeout: 10_000,
    }, (response) => {
      response.resume()
      response.on('end', () => {
        const status = response.statusCode ?? 0
        if (status >= 200 && status < 300) resolve()
        else reject(deliveryError(`Webhook rejected the test request (HTTP ${status}).`, 'webhook', status))
      })
    })
    request.on('timeout', () => request.destroy(deliveryError('Webhook request timed out. Check that the receiver is online.', 'webhook')))
    request.on('error', reject)
    request.end(body)
  })
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
    if (!telegramTokenPattern.test(config.botToken)) throw deliveryError('Bot token has an invalid format. Copy it again from @BotFather.', 'telegram')
    let response: Response
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      if (error instanceof NotificationDeliveryError) throw error
      throw deliveryError('Telegram could not be reached. Check the connection and try again.', 'telegram')
    }
    const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null
    if (!response.ok || result?.ok === false) throw deliveryError(telegramErrorMessage(response.status, result?.description), 'telegram', response.status)
    return
  }

  const url = validateWebhookUrl(config.url)
  const body = JSON.stringify({
    event: 'nodedeck.alert.opened',
    version: 1,
    content: text,
    text,
    alert,
  })
  try {
    if (fetchImpl === fetch) {
      await sendPinnedWebhook(url, body)
      return
    }
    await assertPublicTarget(url)
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'NodeDeck/1.0' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw deliveryError(`Webhook rejected the test request (HTTP ${response.status}).`, 'webhook', response.status)
  } catch (error) {
    if (error instanceof NotificationDeliveryError) throw error
    throw deliveryError('Webhook could not be reached. Check the URL and receiver availability.', 'webhook')
  }
}

export function decryptChannel(value: string, config: Config) {
  return openSecret<NotificationChannelConfig>(value, config.JWT_SECRET)
}
