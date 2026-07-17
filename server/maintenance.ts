import type { Pool } from 'pg'
import type { Config } from './config.js'
import { publishSnapshotChanged } from './events.js'
import { decryptChannel, sendNotification, type AlertNotification } from './notifications.js'

interface DeliveryRow extends AlertNotification {
  channelId: string
  encryptedConfig: string
}

export async function runMaintenance(pool: Pool, config: Config) {
  await pool.query(
    `WITH expired_limits AS (
       DELETE FROM private.security_rate_limits WHERE expires_at < now() - interval '1 day'
     ), old_logs AS (
       DELETE FROM service_logs WHERE occurred_at < now() - interval '7 days'
     ), old_metrics AS (
       DELETE FROM host_metric_samples WHERE recorded_at < now() - interval '30 days'
     ), old_sessions AS (
       DELETE FROM refresh_sessions
       WHERE (expires_at < now() OR revoked_at IS NOT NULL) AND created_at < now() - interval '7 days'
     ), old_enrollments AS (
       DELETE FROM agent_enrollments
       WHERE (expires_at < now() OR used_at IS NOT NULL) AND created_at < now() - interval '7 days'
     ) SELECT 1`,
  )
  const offline = await pool.query<{ organizationId: string }>(
    `WITH inserted AS (
       INSERT INTO alert_events (organization_id, agent_id, kind, title, details)
       SELECT organization_id, id, 'agent_offline', 'Server agent is offline', jsonb_build_object('lastSeenAt', last_seen_at, 'hostname', hostname)
       FROM agents
       WHERE revoked_at IS NULL AND (last_seen_at IS NULL OR last_seen_at < now() - interval '60 seconds')
       ON CONFLICT (agent_id, kind) WHERE status = 'open' AND agent_id IS NOT NULL AND service_id IS NULL AND command_id IS NULL DO NOTHING
       RETURNING organization_id
     ) SELECT DISTINCT organization_id AS "organizationId" FROM inserted`,
  )

  await pool.query(
    `UPDATE services s SET status = 'offline', cpu = 0, ram = 0, updated_at = now()
     FROM agents a
     WHERE s.agent_id = a.id AND a.revoked_at IS NULL
       AND (a.last_seen_at IS NULL OR a.last_seen_at < now() - interval '60 seconds')
       AND s.status <> 'offline'`,
  )

  await pool.query(
    `UPDATE commands SET status = 'expired', completed_at = now(), result = '{"message":"Command expired before execution."}'::jsonb
     WHERE status IN ('queued', 'running') AND (expires_at <= now() OR (status = 'running' AND lease_expires_at <= now()))`,
  )

  for (const row of offline.rows) publishSnapshotChanged(row.organizationId)
  await deliverPendingNotifications(pool, config)
}

export async function deliverPendingNotifications(pool: Pool, config: Config) {
  const pending = await pool.query<DeliveryRow>(
    `SELECT a.id, a.kind, a.title, a.details, a.opened_at AS "openedAt",
            c.id AS "channelId", c.config_encrypted AS "encryptedConfig"
     FROM alert_events a
     JOIN notification_channels c ON c.organization_id = a.organization_id AND c.enabled = true AND a.opened_at >= c.created_at
     LEFT JOIN notification_deliveries d ON d.alert_id = a.id AND d.channel_id = c.id
     WHERE a.status = 'open' AND (d.status IS NULL OR (d.status = 'failed' AND d.attempts < 5 AND d.attempted_at < now() - interval '1 minute'))
     ORDER BY a.opened_at LIMIT 20`,
  )

  for (const item of pending.rows) {
    const claimed = await pool.query(
      `INSERT INTO notification_deliveries (alert_id, channel_id, status, attempts)
       VALUES ($1, $2, 'sending', 1)
       ON CONFLICT (alert_id, channel_id) DO UPDATE
       SET status = 'sending', attempts = notification_deliveries.attempts + 1, attempted_at = now(), last_error = NULL
       WHERE notification_deliveries.status = 'failed' AND notification_deliveries.attempts < 5
       RETURNING alert_id`,
      [item.id, item.channelId],
    )
    if (!claimed.rowCount) continue
    try {
      await sendNotification(decryptChannel(item.encryptedConfig, config), item)
      await pool.query(
        `UPDATE notification_deliveries SET status = 'succeeded', delivered_at = now() WHERE alert_id = $1 AND channel_id = $2`,
        [item.id, item.channelId],
      )
    } catch (error) {
      await pool.query(
        `UPDATE notification_deliveries SET status = 'failed', last_error = $3 WHERE alert_id = $1 AND channel_id = $2`,
        [item.id, item.channelId, error instanceof Error ? error.message.slice(0, 500) : 'Notification delivery failed'],
      )
    }
  }
}

export function startMaintenance(pool: Pool, config: Config) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runMaintenance(pool, config)
    } catch (error) {
      console.error(JSON.stringify({ event: 'maintenance.failed', error: error instanceof Error ? error.message : 'unknown' }))
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), 15_000)
  timer.unref()
  return () => clearInterval(timer)
}
