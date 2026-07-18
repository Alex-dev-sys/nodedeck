import type { PoolClient } from 'pg'

export type ScheduledAction = 'start' | 'restart' | 'stop'

interface DueSchedule {
  id: string
  organizationId: string
  serviceId: string
  action: ScheduledAction
  requestedBy: string
  localDate: string
}

export function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function normalizeDays(days: number[]) {
  return [...new Set(days)].sort((left, right) => left - right)
}

export async function enqueueDueSchedules(client: PoolClient, agentId: string) {
  const due = await client.query<DueSchedule>(
    `SELECT sch.id, sch.organization_id AS "organizationId", sch.service_id AS "serviceId",
            sch.action, sch.created_by AS "requestedBy",
            ((now() AT TIME ZONE sch.timezone)::date)::text AS "localDate"
     FROM service_schedules sch
     JOIN services s ON s.id = sch.service_id AND s.organization_id = sch.organization_id
     LEFT JOIN service_policies p ON p.service_id = s.id AND p.organization_id = s.organization_id
     WHERE s.agent_id = $1 AND sch.enabled = true
       AND COALESCE(p.control_enabled, true) = true AND s.is_protected = false
       AND (
         s.kind = 'docker'
         OR (s.kind = 'systemd' AND s.container_id LIKE 'systemd-user:%')
         OR (s.kind = 'launchd' AND s.container_id LIKE 'launchd-user:%')
         OR (s.kind = 'pm2' AND s.container_id LIKE 'pm2:%')
       )
       AND EXTRACT(DOW FROM now() AT TIME ZONE sch.timezone)::smallint = ANY(sch.days_of_week)
       AND (now() AT TIME ZONE sch.timezone)::time >= sch.local_time
       AND sch.last_run_local_date IS DISTINCT FROM (now() AT TIME ZONE sch.timezone)::date
     ORDER BY sch.local_time, sch.created_at
     FOR UPDATE OF sch SKIP LOCKED`,
    [agentId],
  )

  let created = 0
  for (const schedule of due.rows) {
    const idempotencyKey = `schedule_${schedule.id}_${schedule.localDate.replaceAll('-', '')}`
    const command = await client.query<{ id: string }>(
      `INSERT INTO commands (organization_id, agent_id, service_id, action, requested_by, expires_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes', $6)
       ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [schedule.organizationId, agentId, schedule.serviceId, schedule.action, schedule.requestedBy, idempotencyKey],
    )
    await client.query(
      `UPDATE service_schedules
       SET last_run_local_date = $2::date, last_run_at = now(), updated_at = now()
       WHERE id = $1`,
      [schedule.id, schedule.localDate],
    )
    if (!command.rowCount) continue
    created += 1
    await client.query(
      `UPDATE services SET desired_state = $2 WHERE id = $1 AND organization_id = $3`,
      [schedule.serviceId, schedule.action === 'stop' ? 'stopped' : 'running', schedule.organizationId],
    )
    await client.query(
      `INSERT INTO audit_logs (organization_id, actor_id, action, target, result, metadata)
       VALUES ($1, $2, $3, $4, 'ok', $5::jsonb)`,
      [schedule.organizationId, schedule.requestedBy, `service.${schedule.action}.scheduled`, schedule.serviceId, JSON.stringify({ commandId: command.rows[0].id, scheduleId: schedule.id })],
    )
  }
  return created
}
