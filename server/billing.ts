import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import Stripe from 'stripe'
import type { Config } from './config.js'
import { inTransaction } from './db/pool.js'

export type BillingPlan = 'free' | 'pro' | 'team'

export const PLAN_CATALOG = {
  free: { name: 'Free', priceMonthly: 0, servers: 2, members: 1, metricRetentionDays: 1 },
  pro: { name: 'Pro', priceMonthly: 19, servers: 20, members: 3, metricRetentionDays: 30 },
  team: { name: 'Team', priceMonthly: 49, servers: 100, members: 25, metricRetentionDays: 90 },
} as const satisfies Record<BillingPlan, {
  name: string
  priceMonthly: number
  servers: number
  members: number
  metricRetentionDays: number
}>

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due'])
const STORED_SUBSCRIPTION_STATUSES = new Set([
  'inactive', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused', 'incomplete', 'incomplete_expired',
])

export function stripeClient(config: Config) {
  if (!config.STRIPE_SECRET_KEY) throw new BillingUnavailableError()
  return new Stripe(config.STRIPE_SECRET_KEY)
}

export class BillingUnavailableError extends Error {
  readonly status = 503
  readonly code = 'billing_not_configured'

  constructor() {
    super('Billing is not configured yet.')
    this.name = 'BillingUnavailableError'
  }
}

export class BillingLimitError extends Error {
  readonly status = 402
  readonly code = 'plan_limit_reached'

  constructor(readonly resource: 'servers' | 'members', readonly limit: number) {
    super(`Your plan allows ${limit} ${resource}.`)
    this.name = 'BillingLimitError'
  }
}

export function priceIdForPlan(config: Config, plan: Exclude<BillingPlan, 'free'>) {
  const priceId = plan === 'pro' ? config.STRIPE_PRO_PRICE_ID : config.STRIPE_TEAM_PRICE_ID
  if (!priceId) throw new BillingUnavailableError()
  return priceId
}

export function planForPrice(config: Config, priceId: string | null | undefined): BillingPlan {
  if (priceId && priceId === config.STRIPE_TEAM_PRICE_ID) return 'team'
  if (priceId && priceId === config.STRIPE_PRO_PRICE_ID) return 'pro'
  return 'free'
}

export function billingConfigured(config: Config) {
  return Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET && config.STRIPE_PRO_PRICE_ID && config.STRIPE_TEAM_PRICE_ID)
}

export async function processStripeWebhook(pool: Pool, config: Config, rawBody: Buffer, signature: string | undefined) {
  if (!config.STRIPE_WEBHOOK_SECRET || !signature) throw new InvalidStripeWebhookError()
  const stripe = stripeClient(config)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET)
  } catch {
    throw new InvalidStripeWebhookError()
  }

  const payloadSha256 = createHash('sha256').update(rawBody).digest('hex')
  return inTransaction(pool, async (database) => {
    const inserted = await database.query(
      `INSERT INTO billing_events (stripe_event_id, event_type, payload_sha256)
       VALUES ($1, $2, $3) ON CONFLICT (stripe_event_id) DO NOTHING RETURNING stripe_event_id`,
      [event.id, event.type, payloadSha256],
    )
    if (!inserted.rowCount) return { duplicate: true }

    let organizationId: string | null = null
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      organizationId = session.metadata?.organizationId ?? session.client_reference_id ?? null
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      if (organizationId) {
        await database.query(
          `UPDATE organizations SET stripe_customer_id = COALESCE($2, stripe_customer_id),
             stripe_subscription_id = COALESCE($3, stripe_subscription_id), billing_updated_at = now()
           WHERE id = $1`,
          [organizationId, customerId ?? null, subscriptionId ?? null],
        )
      }
    } else if (
      event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription
      organizationId = subscription.metadata.organizationId ?? null
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
      const priceId = subscription.items.data[0]?.price.id ?? null
      const rawStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status
      const status = STORED_SUBSCRIPTION_STATUSES.has(rawStatus) ? rawStatus : 'inactive'
      const subscribedPlan = planForPrice(config, priceId)
      const plan = ACTIVE_SUBSCRIPTION_STATUSES.has(status) ? subscribedPlan : 'free'
      const currentPeriodEnd = subscription.items.data[0]?.current_period_end
      const parameters = [
        plan,
        status,
        customerId,
        subscription.id,
        priceId,
        currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
        subscription.cancel_at_period_end,
      ]
      if (organizationId) {
        await database.query(
          `UPDATE organizations SET plan = $2, subscription_status = $3, stripe_customer_id = $4,
             stripe_subscription_id = $5, stripe_price_id = $6, subscription_current_period_end = $7,
             subscription_cancel_at_period_end = $8, billing_updated_at = now()
           WHERE id = $1`,
          [organizationId, ...parameters],
        )
      } else {
        const found = await database.query<{ id: string }>('SELECT id FROM organizations WHERE stripe_customer_id = $1', [customerId])
        organizationId = found.rows[0]?.id ?? null
        if (organizationId) {
          await database.query(
            `UPDATE organizations SET plan = $2, subscription_status = $3,
               stripe_subscription_id = $4, stripe_price_id = $5, subscription_current_period_end = $6,
               subscription_cancel_at_period_end = $7, billing_updated_at = now()
             WHERE id = $1`,
            [organizationId, plan, status, subscription.id, priceId, parameters[5], subscription.cancel_at_period_end],
          )
        }
      }
    }

    if (organizationId) {
      await database.query('UPDATE billing_events SET organization_id = $2 WHERE stripe_event_id = $1', [event.id, organizationId])
    }
    return { duplicate: false }
  })
}

export class InvalidStripeWebhookError extends Error {
  readonly status = 400
  readonly code = 'invalid_stripe_signature'

  constructor() {
    super('Invalid Stripe webhook signature.')
    this.name = 'InvalidStripeWebhookError'
  }
}
