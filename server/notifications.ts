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

const blockedAddresses = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedAddresses.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['2001:db8::', 32],
] as const) blockedAddresses.addSubnet(address, prefix, 'ipv6')

function privateAddress(address: string) {
  const normalized = address.toLowerCase()
  const family = isIP(normalized)
  return family === 4
    ? blockedAddresses.check(normalized, 'ipv4')
    : family === 6 ? blockedAddresses.check(normalized, 'ipv6') : false
}

function normalizeHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized
}

export function validateWebhookUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS')
  if (url.username || url.password) throw new Error('Webhook URL cannot contain credentials')
  const hostname = normalizeHostname(url.hostname)
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || privateAddress(hostname)) throw new Error('Private webhook targets are not allowed')
  return url.toString()
}

async function assertPublicTarget(url: string) {
  const hostname = normalizeHostname(new URL(url).hostname)
  if (isIP(hostname)) {
    if (privateAddress(hostname)) throw new Error('Private webhook targets are not allowed')
    return hostname
  }
  const addresses = [...await resolve4(hostname).catch(() => []), ...await resolve6(hostname).catch(() => [])]
  if (addresses.length === 0) throw new Error('Webhook hostname could not be resolved')
  if (addresses.some(privateAddress)) throw new Error('Private webhook targets are not allowed')
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
        else reject(new Error(`Webhook returned HTTP ${status}`))
      })
    })
    request.on('timeout', () => request.destroy(new Error('Webhook request timed out')))
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
  const body = JSON.stringify({
    event: 'server_os.alert.opened',
    content: text,
    text,
    alert,
  })
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
  if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`)
}

export function decryptChannel(value: string, config: Config) {
  return openSecret<NotificationChannelConfig>(value, config.JWT_SECRET)
}
