'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { send_push_to_user } from '@/app/_utils/push'
import { rate_limit } from '@/lib/rate_limit'
import { ActionResult, ok, err } from './_result'
import { notify_linked_user_core, type NotifyResult } from '@/app/_core/notifications_core'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'

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
    audit('notification.subscription.save', me)
    return ok(undefined, 'Notifications enabled')
  } catch (error) {
    return reportActionError(error, { action: 'notification.subscription.save', entity: 'push_subscription' })
  }
}

export async function delete_push_subscription(endpoint: string): Promise<ActionResult> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')
    await prisma.push_subscription.deleteMany({ where: { endpoint, user_id: me } })
    audit('notification.subscription.delete', me)
    return ok(undefined, 'Notifications disabled')
  } catch (error) {
    return reportActionError(error, { action: 'notification.subscription.delete', entity: 'push_subscription' })
  }
}

export async function send_test_notification(): Promise<ActionResult<{ delivered: number }>> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')
    if (!(await rate_limit(`notify_test:${me}`, 5, 60))) return err('VALIDATION', 'Too many test notifications — wait a minute.')
    const { accepted: delivered } = await send_push_to_user(
      me,
      {
        title: 'Ledger',
        body: 'Test notification ✓ — push is working.',
        url: '/',
      },
      { kind: 'test' },
    )
    audit('notification.test', me, { delivered_count: delivered })
    return ok({ delivered }, delivered > 0 ? 'Test notification sent' : 'No active subscription on any device yet')
  } catch (error) {
    return reportActionError(error, { action: 'notification.test' })
  }
}

export async function notify_linked_user(target_user_id: string, message: string): Promise<ActionResult<NotifyResult>> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'unauthorized')
  return notify_linked_user_core(me, target_user_id, message)
}
