import { describe, expect, it, vi } from 'vitest'
import { HttpApiClient, toInfraSnapshot } from './api'

describe('toInfraSnapshot', () => {
  it('normalizes the current backend response into the dashboard contract', () => {
    const snapshot = toInfraSnapshot({
      serverTimeMs: Date.parse('2026-07-10T12:00:00.000Z'),
      services: [
        {
          id: 'api',
          name: 'API',
          kind: 'api',
          status: 'healthy',
          hostname: 'api-01',
          version: '2.8.0',
          cpu: 23.5,
          ram: 41.2,
          updatedAt: '2026-07-10T11:00:00.000Z',
        },
        {
          id: 'bot',
          name: 'Telegram Bot',
          kind: 'systemd',
          status: 'healthy',
          hostname: 'host-01',
          version: 'user systemd service',
          managed: false,
          updatedAt: '2026-07-10T11:00:00.000Z',
        },
      ],
      incidents: [],
    })

    expect(snapshot.services).toMatchObject([
      { id: 'api', kind: 'api', status: 'healthy', metrics: { cpu: 23.5, ram: 41.2 } },
      { id: 'bot', kind: 'systemd', status: 'healthy', managed: false },
    ])
    expect(snapshot.summary).toMatchObject({ total: 2, online: 2, offline: 0, healthScore: 100 })
  })
})

describe('HttpApiClient', () => {
  it('requests a snapshot and sends authenticated command requests', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        services: [],
        incidents: [],
        serverTimeMs: 0,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ command: { id: 'command-1' } }), { status: 202 }))
    const client = new HttpApiClient({
      baseUrl: 'https://control.example.test/',
      getAccessToken: () => 'access-token',
      fetchImpl,
    })

    await expect(client.getSnapshot()).resolves.toMatchObject({ services: [] })
    await expect(client.dispatchAction('api', 'restart')).resolves.toBeUndefined()

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://control.example.test/api/v1/services',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://control.example.test/api/v1/services/api/commands',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'restart' }) }),
    )
    const [, request] = fetchImpl.mock.calls[1]
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer access-token')
    expect(new Headers(request?.headers).get('Idempotency-Key')).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
  })
})
