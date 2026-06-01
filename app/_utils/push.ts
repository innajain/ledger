import 'server-only'
import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

// Web Push fan-out. VAPID keys are optional — without them, sending is a no-op
// so the app runs fine in environments that haven't configured push.

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
  /** Path to open when the notification is clicked (defaults to '/'). */
  url?: string
  /** Coalescing tag — a newer notification with the same tag replaces the old. */
  tag?: string
}

/**
 * Send a push to every subscription a user has. Fire-and-forget friendly:
 * never throws, prunes subscriptions the push service reports as gone
 * (404/410), and logs other failures. Returns the number delivered.
 */
export async function send_push_to_user(user_id: string, payload: PushPayload): Promise<number> {
  if (!ensure_configured()) return 0

  const subs = await prisma.push_subscription.findMany({ where: { user_id } })
  if (subs.length === 0) return 0

  const body = JSON.stringify(payload)
  const stale: string[] = []
  let delivered = 0

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body)
        delivered++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) stale.push(sub.endpoint)
        else logger.error({ err: e, user_id, status }, 'web push send failed')
      }
    }),
  )

  if (stale.length > 0) {
    await prisma.push_subscription.deleteMany({ where: { endpoint: { in: stale } } }).catch(() => {})
  }
  return delivered
}
