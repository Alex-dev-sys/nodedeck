import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockInfraEngine } from './engine'

function crashFirstService(engine: MockInfraEngine) {
  const service = engine.getSnapshot().services[0]
  engine.crash(service.id)
  const incident = engine.getSnapshot().incidents.find((item) => item.serviceId === service.id)
  if (!incident) throw new Error('Expected crash to create an incident')
  return { service, incident }
}

describe('MockInfraEngine incident lifecycle', () => {
  afterEach(() => vi.useRealTimers())

  it('does not resolve an incident while its service remains offline', () => {
    const engine = new MockInfraEngine()
    const { incident } = crashFirstService(engine)

    engine.resolveIncident(incident.id)

    const snapshot = engine.getSnapshot()
    expect(snapshot.services.find((service) => service.id === incident.serviceId)?.status).toBe('offline')
    expect(snapshot.incidents.find((item) => item.id === incident.id)?.resolved).toBe(false)
  })

  it('resolves the active incident after a successful restart', async () => {
    vi.useFakeTimers()
    const engine = new MockInfraEngine()
    const { service, incident } = crashFirstService(engine)

    const restart = engine.dispatch(service.id, 'start')
    await vi.advanceTimersByTimeAsync(1400)
    await restart

    const snapshot = engine.getSnapshot()
    expect(snapshot.services.find((item) => item.id === service.id)?.status).toBe('healthy')
    expect(snapshot.incidents.find((item) => item.id === incident.id)?.resolved).toBe(true)
  })

  it('propagates a dependency outage through the service graph', () => {
    const engine = new MockInfraEngine()

    engine.crash('postgres')

    const services = new Map(engine.getSnapshot().services.map((service) => [service.id, service]))
    expect(services.get('postgres')?.status).toBe('offline')
    expect(services.get('api')?.status).toBe('degraded')
    expect(services.get('website')?.status).toBe('degraded')
    expect(services.get('openclaw')?.status).toBe('degraded')
    expect(services.get('backup')?.status).toBe('degraded')
  })
})

describe('MockInfraEngine emergency recovery', () => {
  afterEach(() => vi.useRealTimers())

  it('does nothing when no services are offline', async () => {
    const engine = new MockInfraEngine()
    const before = engine.getSnapshot()

    await expect(engine.panic()).resolves.toEqual({ recovered: 0 })

    const after = engine.getSnapshot()
    expect(after.notifications).toHaveLength(before.notifications.length)
    expect(after.services.every((service) => service.status !== 'offline')).toBe(true)
  })

  it('recovers only offline services and marks their incidents as auto-recovered', async () => {
    vi.useFakeTimers()
    const engine = new MockInfraEngine()
    const { service, incident } = crashFirstService(engine)

    const recovery = engine.panic()
    await vi.advanceTimersByTimeAsync(1200)
    await expect(recovery).resolves.toEqual({ recovered: 1 })

    const snapshot = engine.getSnapshot()
    expect(snapshot.services.find((item) => item.id === service.id)?.status).toBe('healthy')
    expect(snapshot.incidents.find((item) => item.id === incident.id)).toMatchObject({
      autoRecovery: true,
      resolved: true,
    })
  })

  it('restores all demo data after a reset', () => {
    const engine = new MockInfraEngine()
    engine.crash('postgres')

    engine.resetDemo()

    const snapshot = engine.getSnapshot()
    expect(snapshot.services.every((service) => service.status === 'healthy')).toBe(true)
    expect(snapshot.incidents).toHaveLength(0)
  })
})
