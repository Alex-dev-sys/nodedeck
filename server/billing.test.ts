import { createHmac } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { billingConfigured, PLAN_CATALOG, planForPrice, processStripeWebhook } from './billing.js'
import { loadConfig } from './config.js'

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://infra:infra@127.0.0.1:5433/infra_dashboard',
  JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  STRIPE_SECRET_KEY: 'sk_test_nodedeck',
  STRIPE_WEBHOOK_SECRET: 'whsec_nodedeck_test',
  STRIPE_PRO_PRICE_ID: 'price_nodedeck_pro',
  STRIPE_TEAM_PRICE_ID: 'price_nodedeck_team',
})

function signedPayload(event: object) {
  const body = Buffer.from(JSON.stringify(event))
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', config.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${body.toString()}`).digest('hex')
  return { body, signature: `t=${timestamp},v1=${signature}` }
}

describe('billing', () => {
  it('defines enforceable plan limits and maps only configured Stripe prices', () => {
    expect(PLAN_CATALOG.free.servers).toBe(2)
    expect(PLAN_CATALOG.pro.servers).toBeGreaterThan(PLAN_CATALOG.free.servers)
    expect(planForPrice(config, 'price_nodedeck_team')).toBe('team')
    expect(planForPrice(config, 'price_unknown')).toBe('free')
    expect(billingConfigured(config)).toBe(true)
  })

  it('verifies and records Stripe events before changing billing state', async () => {
    const event = {
      id: 'evt_checkout_1',
      object: 'event',
      api_version: '2026-06-30.basil',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test_1', object: 'checkout.session', client_reference_id: '11111111-1111-4111-8111-111111111111',
        customer: 'cus_test_1', subscription: 'sub_test_1', metadata: { organizationId: '11111111-1111-4111-8111-111111111111' },
      } },
    }
    const { body, signature } = signedPayload(event)
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ stripe_event_id: event.id }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({})
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool
    const result = await processStripeWebhook(pool, config, body, signature)

    expect(result).toEqual({ duplicate: false })
    expect(query).toHaveBeenCalledTimes(5)
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT')
    expect(query.mock.calls[2][1]).toContain('cus_test_1')
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
  })

  it('rejects an invalid signature without touching the database', async () => {
    const connect = vi.fn()
    await expect(processStripeWebhook({ connect } as unknown as Pool, config, Buffer.from('{}'), 't=1,v1=bad')).rejects.toMatchObject({ code: 'invalid_stripe_signature' })
    expect(connect).not.toHaveBeenCalled()
  })
})
