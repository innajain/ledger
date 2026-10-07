import 'server-only'
import { randomBytes } from 'node:crypto'
import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { auditRef, logger } from '@/lib/logger'

let configured = false
function ensure_configured(): boolean {
  if (configured) return true
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
  return true
}

export type PushPayload = {
  title: string
  body: string

  url?: string

  tag?: string
}

export type PushKind = 'request_pending' | 'request_rejected' | 'message' | 'test'

/** `accepted` = devices whose push service took the message (not that it was shown); `sent_at` identifies the push for list_sent_notifications. */
export type PushResult = { accepted: number; sent_at: Date | null }

const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Sends to every device the user subscribed and records one push_delivery row per
 * device. Each payload carries that row's random token, which the service worker
 * posts back to /api/push/ack when it shows the notification and when it's tapped —
 * the push service itself only ever says it *accepted* the message.
 */
export async function send_push_to_user(
  user_id: string,
  payload: PushPayload,
  meta: { kind: PushKind; sender_id?: string | null },
): Promise<PushResult> {
  if (!ensure_configured()) return { accepted: 0, sent_at: null }

  const subs = await prisma.push_subscription.findMany({ where: { user_id } })
  if (subs.length === 0) return { accepted: 0, sent_at: null }

  // One instant for the whole fan-out, so the devices of one push read as one burst.
  const sent_at = new Date()
  const tokens = new Map(subs.map(sub => [sub.id, randomBytes(18).toString('base64url')]))
  // Tracking is best-effort: if the rows can't be written, still send — just untracked.
  const tracked = await prisma.push_delivery
    .createMany({
      data: subs.map(sub => ({
        token: tokens.get(sub.id)!,
        recipient_id: user_id,
        sender_id: meta.sender_id ?? null,
        kind: meta.kind,
        subscription_id: sub.id,
        sent_at,
      })),
    })
    .then(
      () => true,
      error => {
        logger.warn(
          { err: error, user_ref: auditRef(user_id), event: 'operation.degraded', action: 'notification.track' },
          'failed to record push deliveries',
        )
        return false
      },
    )

  const stale: string[] = []
  let delivered = 0
  const outcomes: { token: string; accepted: boolean; status: number }[] = []

  await Promise.all(
    subs.map(async sub => {
      const token = tokens.get(sub.id)!
      const body = JSON.stringify(tracked ? { ...payload, delivery: token } : payload)
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body)
        delivered++
        outcomes.push({ token, accepted: true, status: 201 })
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        outcomes.push({ token, accepted: false, status: status ?? 0 })
        if (status === 404 || status === 410) stale.push(sub.endpoint)
        else
          logger.error(
            { err: e, user_ref: auditRef(user_id), status, event: 'operation.failed', action: 'notification.push' },
            'web push send failed',
          )
      }
    }),
  )

  if (tracked) await record_outcomes(user_id, outcomes)

  if (stale.length > 0) {
    await prisma.push_subscription.deleteMany({ where: { endpoint: { in: stale } } }).catch(error => {
      logger.warn(
        { err: error, user_ref: auditRef(user_id), stale_count: stale.length, event: 'operation.degraded', action: 'notification.cleanup_stale' },
        'failed to remove stale push subscriptions',
      )
    })
  }
  return { accepted: delivered, sent_at }
}

async function record_outcomes(user_id: string, outcomes: { token: string; accepted: boolean; status: number }[]): Promise<void> {
  const now = new Date()
  const accepted = outcomes.filter(o => o.accepted).map(o => o.token)
  try {
    await Promise.all([
      accepted.length > 0 ? prisma.push_delivery.updateMany({ where: { token: { in: accepted } }, data: { accepted_at: now } }) : null,
      ...outcomes.filter(o => !o.accepted).map(o => prisma.push_delivery.update({ where: { token: o.token }, data: { failed_status: o.status } })),
      prisma.push_delivery.deleteMany({ where: { recipient_id: user_id, sent_at: { lt: new Date(now.getTime() - DELIVERY_RETENTION_MS) } } }),
    ])
  } catch (error) {
    logger.warn(
      { err: error, user_ref: auditRef(user_id), event: 'operation.degraded', action: 'notification.track' },
      'failed to record push outcomes',
    )
  }
}
