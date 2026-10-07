import { prisma } from '@/lib/prisma'
import { send_push_to_user } from '@/app/_utils/push'
import { rate_limit } from '@/lib/rate_limit'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'
import { deliveries_for_request, group_by_push, summarize_deliveries, type DeliveryStatus } from '@/app/_utils/push_delivery'

// Shared by the web action and the MCP tool, so both enforce the same link check
// and the same rate limits — an agent can't nag a counterparty faster than a person.

async function is_linked_to(me: string, target: string): Promise<boolean> {
  const head = await prisma.accounting_head.findFirst({
    where: { user_id: me, linked_user_id: target },
    select: { id: true },
  })
  return !!head
}

export type NotifyResult = {
  /** Devices whose push service accepted the message — NOT devices that showed it. Kept under this name for existing callers; same as `accepted`. */
  delivered: number
  accepted: number
  /** Identifies this push in list_sent_notifications; null when nothing was sent. */
  sent_datetime: string | null
}

export async function notify_linked_user_core(me: string, target_user_id: string, message: string): Promise<ActionResult<NotifyResult>> {
  try {
    const text = (message ?? '').trim()
    if (!text) return err('VALIDATION', 'Message is empty')
    if (text.length > 500) return err('VALIDATION', 'Message is too long (max 500 characters)')
    if (target_user_id === me) return err('VALIDATION', "You can't notify yourself")
    if (!(await is_linked_to(me, target_user_id))) return err('VALIDATION', 'That user is not linked to you')

    if (!(await rate_limit(`notify:${me}:${target_user_id}`, 5, 10 * 60)) || !(await rate_limit(`notify:${me}`, 20, 60 * 60)))
      return err('VALIDATION', 'You’re sending messages too fast. Please wait a bit.')

    const meRow = await prisma.user.findUnique({ where: { id: me }, select: { username: true } })
    const { accepted, sent_at } = await send_push_to_user(
      target_user_id,
      {
        title: `Message from @${meRow?.username ?? 'someone'}`,
        body: text,
        url: '/',
      },
      { kind: 'message', sender_id: me },
    )

    audit('notification.linked_user', me, { delivered_count: accepted })
    return ok(
      { delivered: accepted, accepted, sent_datetime: sent_at?.toISOString() ?? null },
      accepted > 0 ? 'Notification sent' : "Sent — but they don't have notifications enabled",
    )
  } catch (error) {
    return reportActionError(error, { action: 'notification.linked_user' })
  }
}

export type SentNotification = {
  to: string
  kind: string
  sent_datetime: string
  devices: number
  /** Furthest any device got; 'in_flight' while the send hasn't come back. */
  status: DeliveryStatus | 'in_flight'
  status_datetime: string | null
}

const DELIVERY_SELECT = {
  recipient_id: true,
  kind: true,
  sent_at: true,
  accepted_at: true,
  failed_status: true,
  delivered_at: true,
  opened_at: true,
} as const

/**
 * Pushes `me` caused on other people's devices (approval requests, rejections,
 * nudges) and how far each got. `link_id` narrows to the push about one approval
 * request — the same matching the outbox uses. History is kept 30 days.
 */
export async function list_sent_notifications_core(
  me: string,
  opts: { to_user_id?: string; kind?: string; link_id?: string; limit?: number },
): Promise<ActionResult<{ notifications: SentNotification[]; note?: string }>> {
  try {
    let groups
    if (opts.link_id) {
      const link = await prisma.transaction_link.findFirst({
        where: { id: opts.link_id, OR: [{ user_a_id: me }, { user_b_id: me }] },
        select: { user_a_id: true, user_b_id: true, updated_at: true, pending_by: true },
      })
      if (!link) return err('NOT_FOUND', 'No such request')
      const other = link.user_a_id === me ? link.user_b_id : link.user_a_id
      if (link.pending_by !== other) return ok({ notifications: [], note: 'This request is not awaiting them, so no push of yours is about it.' })
      const rows = await prisma.push_delivery.findMany({
        where: { sender_id: me, recipient_id: other, kind: { in: ['request_pending', 'request_rejected'] }, sent_at: { gte: link.updated_at } },
        select: DELIVERY_SELECT,
      })
      const hit = deliveries_for_request(rows, other, link.updated_at)
      groups = hit.length ? [hit] : []
    } else {
      const rows = await prisma.push_delivery.findMany({
        where: { sender_id: me, ...(opts.to_user_id ? { recipient_id: opts.to_user_id } : {}), ...(opts.kind ? { kind: opts.kind } : {}) },
        orderBy: { sent_at: 'desc' },
        // Rows are per device; over-fetch so `limit` pushes survive grouping.
        take: (opts.limit ?? 20) * 5,
        select: DELIVERY_SELECT,
      })
      groups = group_by_push(rows).slice(0, opts.limit ?? 20)
    }

    const ids = Array.from(new Set(groups.map(g => g[0].recipient_id)))
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })
    const name = new Map(users.map(u => [u.id, u.username]))

    const notifications = groups.map(g => {
      const summary = summarize_deliveries(g)
      return {
        to: name.get(g[0].recipient_id) ?? 'unknown',
        kind: g[0].kind,
        sent_datetime: g[0].sent_at.toISOString(),
        devices: g.length,
        status: summary?.status ?? ('in_flight' as const),
        status_datetime: summary?.datetime ?? null,
      }
    })
    return ok(
      opts.link_id && notifications.length === 0
        ? { notifications, note: 'No push was recorded for this request — they may not have notifications turned on.' }
        : { notifications },
    )
  } catch (error) {
    return reportActionError(error, { action: 'notification.list_sent' })
  }
}
