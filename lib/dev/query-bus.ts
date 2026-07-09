import 'server-only'
import { EventEmitter } from 'node:events'
import { isDev } from '../env'

export const DEV_QUERY_TOASTS_ENABLED = isDev() && process.env.DEV_QUERY_TOASTS !== 'off'

export type QueryEvent =
  | { kind: 'db'; model?: string; action?: string; duration_ms: number; error?: boolean; ts?: number; replayed?: boolean }
  | { kind: 'redis'; op: string; duration_ms: number; hit?: boolean; error?: boolean; ts?: number; replayed?: boolean }

declare global {
  var __dev_query_bus: EventEmitter | undefined
  var __dev_query_buffer: QueryEvent[] | undefined
}

const bus: EventEmitter = globalThis.__dev_query_bus ?? new EventEmitter()
bus.setMaxListeners(0)
if (!globalThis.__dev_query_bus) globalThis.__dev_query_bus = bus

const buffer: QueryEvent[] = globalThis.__dev_query_buffer ?? []
if (!globalThis.__dev_query_buffer) globalThis.__dev_query_buffer = buffer

const BUFFER_WINDOW_MS = 10_000
const BUFFER_MAX = 500

export const queryBus = bus

export function publishQueryEvent(ev: QueryEvent): void {
  if (!DEV_QUERY_TOASTS_ENABLED) return

  const stamped: QueryEvent = { ...ev, ts: Date.now() }
  buffer.push(stamped)

  const cutoff = stamped.ts! - BUFFER_WINDOW_MS
  while (buffer.length > BUFFER_MAX || (buffer.length > 0 && (buffer[0].ts ?? 0) < cutoff)) {
    buffer.shift()
  }

  if (bus.listenerCount('event') > 0) bus.emit('event', stamped)
}

export function getRecentEvents(): QueryEvent[] {
  const cutoff = Date.now() - BUFFER_WINDOW_MS
  return buffer.filter(e => (e.ts ?? 0) >= cutoff)
}
