'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { send_push_to_user } from '@/app/_utils/push'
import { rate_limit } from '@/lib/rate_limit'
import { logger } from '@/lib/logger'
import { ActionResult, ok, err, fromError } from './_result'

type SubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function save_push_subscription(sub: SubscriptionInput): Promise<ActionResult> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return err('VALIDATION', 'Invalid subscription')

    await prisma.push_subscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { user_id: me, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      update: { user_id: me, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
    return ok(undefined, 'Notifications enabled')
  } catch (error) {
    logger.error({ err: error, action: 'save_push_subscription' }, 'save_push_subscription failed')
    return fromError(error)
  }
}

export async function delete_push_subscription(endpoint: string): Promise<ActionResult> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')
    await prisma.push_subscription.deleteMany({ where: { endpoint, user_id: me } })
    return ok(undefined, 'Notifications disabled')
  } catch (error) {
    return fromError(error)
  }
}

export async function send_test_notification(): Promise<ActionResult<{ delivered: number }>> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')
    if (!(await rate_limit(`notify_test:${me}`, 5, 60))) return err('VALIDATION', 'Too many test notifications — wait a minute.')
    const delivered = await send_push_to_user(me, {
      title: 'Ledger',
      body: 'Test notification ✓ — push is working.',
      url: '/',
    })
    return ok({ delivered }, delivered > 0 ? 'Test notification sent' : 'No active subscription on any device yet')
  } catch (error) {
    return fromError(error)
  }
}

async function is_linked_to(me: string, target: string): Promise<boolean> {
  const head = await prisma.accounting_head.findFirst({
    where: { user_id: me, linked_user_id: target },
    select: { id: true },
  })
  return !!head
}

export async function notify_linked_user(target_user_id: string, message: string): Promise<ActionResult<{ delivered: number }>> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')

    const text = (message ?? '').trim()
    if (!text) return err('VALIDATION', 'Message is empty')
    if (text.length > 500) return err('VALIDATION', 'Message is too long (max 500 characters)')
    if (target_user_id === me) return err('VALIDATION', "You can't notify yourself")
    if (!(await is_linked_to(me, target_user_id))) return err('VALIDATION', 'That user is not linked to you')

    if (!(await rate_limit(`notify:${me}:${target_user_id}`, 5, 10 * 60)) || !(await rate_limit(`notify:${me}`, 20, 60 * 60)))
      return err('VALIDATION', 'You’re sending messages too fast. Please wait a bit.')

    const meRow = await prisma.user.findUnique({ where: { id: me }, select: { username: true } })
    const delivered = await send_push_to_user(target_user_id, {
      title: `Message from @${meRow?.username ?? 'someone'}`,
      body: text,
      url: '/',
    })

    return ok({ delivered }, delivered > 0 ? 'Notification sent' : "Sent — but they don't have notifications enabled")
  } catch (error) {
    logger.error({ err: error, action: 'notify_linked_user' }, 'notify_linked_user failed')
    return fromError(error)
  }
}
