import { ApiError } from './api'

export interface RemoteLogLine {
  ts: string
  level: 'info' | 'warn' | 'error' | 'debug'
  text: string
  serviceId: string
  serviceName: string
}

export interface RemoteAlert {
  id: string
  serviceId: string | null
  kind: 'agent_offline' | 'command_failed' | 'service_offline' | 'service_unhealthy' | 'host_resource_high'
  status: 'open' | 'resolved'
  title: string
  details: { message?: string; lastSeenAt?: string; name?: string; cpu?: number; ram?: number; disk?: number; threshold?: number }
  openedAt: string
  resolvedAt: string | null
}

export interface RemoteCommand {
  id: string
  serviceId: string
  serviceName: string
  action: 'start' | 'restart' | 'stop' | 'rollback'
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  createdAt: string
  claimedAt: string | null
  startedAt: string | null
  completedAt: string | null
  expiresAt: string
  result: { message?: string } | null
}

export interface RemoteHostMetric {
  ts: string
  cpu: number | string
  ram: number | string
  disk: number | string
}

export interface NotificationChannel {
  id: string
  kind: 'telegram' | 'webhook'
  name: string
  target: string
  enabled: boolean
  createdAt: string
}

export type NotificationChannelInput =
  | { kind: 'telegram'; name: string; botToken: string; chatId: string }
  | { kind: 'webhook'; name: string; url: string }

async function request<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  if (!response.ok) throw new ApiError(`Could not load ${path}.`, response.status)
  return response.json() as Promise<T>
}

async function mutate<T = undefined>(path: string, accessToken: string, init: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    credentials: 'include',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; error?: string } | null
    throw new ApiError(body?.message ?? body?.error ?? `Request failed with HTTP ${response.status}.`, response.status, body?.error)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function fetchLogs(accessToken: string, serviceId?: string) {
  const query = serviceId ? `?limit=200&serviceId=${encodeURIComponent(serviceId)}` : '?limit=200'
  return request<{ logs: RemoteLogLine[] }>(`/api/v1/logs${query}`, accessToken)
}

export async function fetchAlerts(accessToken: string) {
  return request<{ alerts: RemoteAlert[] }>('/api/v1/alerts', accessToken)
}

export async function fetchCommands(accessToken: string) {
  return request<{ commands: RemoteCommand[] }>('/api/v1/commands', accessToken)
}

export async function fetchHostMetrics(accessToken: string, range: string) {
  return request<{ metrics: RemoteHostMetric[] }>(`/api/v1/metrics/host?range=${encodeURIComponent(range)}`, accessToken)
}

export async function fetchNotificationChannels(accessToken: string) {
  return request<{ channels: NotificationChannel[] }>('/api/v1/notification-channels', accessToken)
}

export async function createNotificationChannel(accessToken: string, input: NotificationChannelInput) {
  return mutate<{ channel: NotificationChannel }>('/api/v1/notification-channels', accessToken, { method: 'POST', body: JSON.stringify(input) })
}

export async function testNotificationChannel(accessToken: string, id: string) {
  return mutate(`/api/v1/notification-channels/${encodeURIComponent(id)}/test`, accessToken, { method: 'POST' })
}

export async function deleteNotificationChannel(accessToken: string, id: string) {
  return mutate(`/api/v1/notification-channels/${encodeURIComponent(id)}`, accessToken, { method: 'DELETE' })
}
