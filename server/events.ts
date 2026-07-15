import { EventEmitter } from 'node:events'

export const events = new EventEmitter()
events.setMaxListeners(100)

function snapshotEvent(organizationId: string) {
  return `snapshot-changed:${organizationId}`
}

export function publishSnapshotChanged(organizationId: string) {
  events.emit(snapshotEvent(organizationId))
}

export function subscribeSnapshotChanged(organizationId: string, listener: () => void) {
  const event = snapshotEvent(organizationId)
  events.on(event, listener)
  return () => events.off(event, listener)
}
