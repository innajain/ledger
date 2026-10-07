// Pure rollup of push_delivery rows into the one line a sender sees ("delivered
// 20:56 · 2 devices"). A push goes to every device the recipient subscribed, so
// the summary reports the furthest any device got: tapped beats shown beats
// accepted by the push service beats refused.

export type DeliveryRow = {
  sent_at: Date
  accepted_at: Date | null
  failed_status: number | null
  delivered_at: Date | null
  opened_at: Date | null
}

export type DeliveryStatus = 'opened' | 'delivered' | 'accepted' | 'failed'

export type DeliverySummary = {
  status: DeliveryStatus
  /** When the first device reached that status (ISO). */
  datetime: string
  /** How many devices the push was sent to. */
  devices: number
}

const RANK: Record<DeliveryStatus, number> = { failed: 0, accepted: 1, delivered: 2, opened: 3 }

function row_status(r: DeliveryRow): { status: DeliveryStatus; at: Date } | null {
  if (r.opened_at) return { status: 'opened', at: r.opened_at }
  if (r.delivered_at) return { status: 'delivered', at: r.delivered_at }
  if (r.accepted_at) return { status: 'accepted', at: r.accepted_at }
  if (r.failed_status !== null) return { status: 'failed', at: r.sent_at }
  // Still in flight — the send hasn't come back yet.
  return null
}

export function summarize_deliveries(rows: DeliveryRow[]): DeliverySummary | null {
  let best: { status: DeliveryStatus; at: Date } | null = null
  for (const r of rows) {
    const s = row_status(r)
    if (!s) continue
    if (!best || RANK[s.status] > RANK[best.status] || (s.status === best.status && s.at < best.at)) best = s
  }
  return best ? { status: best.status, datetime: best.at.toISOString(), devices: rows.length } : null
}

export const ACK_EVENTS = ['delivered', 'opened'] as const
export type AckEvent = (typeof ACK_EVENTS)[number]

/**
 * Which deliveries a sender's pending request accounts for. Every pending/rejected
 * notification fires right after the write that (re)opened the link, and that write
 * stamps the link's `updated_at` — so the request's push is the *first* burst to that
 * counterparty at or after `requested_at`. (Not the latest: a second request to the
 * same person sent later is a later burst, and belongs to that one.) A burst is one
 * fan-out to several devices, which share a single `sent_at`.
 */
export function deliveries_for_request<T extends DeliveryRow & { recipient_id: string }>(rows: T[], other_id: string, requested_at: Date): T[] {
  const after = rows.filter(r => r.recipient_id === other_id && r.sent_at >= requested_at)
  if (after.length === 0) return []
  const first = Math.min(...after.map(r => r.sent_at.getTime()))
  return after.filter(r => r.sent_at.getTime() === first)
}

/**
 * Splits rows into one group per push — the devices of one send share recipient,
 * kind and `sent_at` exactly (send_push_to_user stamps one instant per fan-out).
 * Newest first.
 */
export function group_by_push<T extends DeliveryRow & { recipient_id: string; kind: string }>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const key = `${r.recipient_id}|${r.kind}|${r.sent_at.getTime()}`
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }
  return [...groups.values()].sort((a, b) => b[0].sent_at.getTime() - a[0].sent_at.getTime())
}
