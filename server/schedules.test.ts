import { describe, expect, it, vi } from 'vitest'
import { enqueueDueSchedules, normalizeDays, validTimeZone } from './schedules.js'

describe('service schedules', () => {
  it('validates timezones and normalizes selected days', () => {
    expect(validTimeZone('Asia/Seoul')).toBe(true)
    expect(validTimeZone('Definitely/Not-A-Timezone')).toBe(false)
    expect(normalizeDays([5, 1, 5, 0])).toEqual([0, 1, 5])
  })

  it('creates one allowlisted agent command and audits a due schedule', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'schedule-id', organizationId: 'organization-id', serviceId: 'service-id', action: 'restart', requestedBy: 'user-id', localDate: '2026-07-19' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'command-id' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })

    await expect(enqueueDueSchedules({ query } as never, 'agent-id')).resolves.toBe(1)

    expect(query).toHaveBeenCalledTimes(5)
    expect(query.mock.calls[1][0]).toContain('INSERT INTO commands')
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining(['restart', 'schedule_schedule-id_20260719']))
    expect(query.mock.calls[4][0]).toContain('audit_logs')
    expect(query.mock.calls[4][1]).toEqual(expect.arrayContaining(['service.restart.scheduled']))
  })

  it('does not create commands when nothing is due', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await expect(enqueueDueSchedules({ query } as never, 'agent-id')).resolves.toBe(0)
    expect(query).toHaveBeenCalledOnce()
  })
})
