import 'server-only'
import { prisma } from '@/lib/prisma'
import { send_push_to_user } from './push'
import { auditRef, logger } from '@/lib/logger'

async function username_of(user_id: string): Promise<string> {
  try {
    const u = await prisma.user.findUnique({ where: { id: user_id }, select: { username: true } })
    return u?.username ?? 'someone'
  } catch (error) {
    logger.warn(
      { err: error, user_ref: auditRef(user_id), event: 'operation.degraded', action: 'notification.resolve_sender' },
      'failed to resolve notification sender',
    )
    return 'someone'
  }
}

const in_flight = new Set<Promise<void>>()

function track(work: Promise<void>): Promise<void> {
  in_flight.add(work)
  void work.finally(() => in_flight.delete(work))
  return work
}

export async function flush_notifications(): Promise<void> {
  await Promise.allSettled([...in_flight])
}

export function notify_request_pending(
  target_user_id: string,
  from_user_id: string,
  opts: { changed?: boolean; description?: string | null } = {},
): Promise<void> {
  return track(
    (async () => {
      try {
        const from = await username_of(from_user_id)
        const verb = opts.changed ? 'updated a shared transaction' : 'sent you a transaction to approve'
        const desc = opts.description ? ` — ${opts.description}` : ''
        await send_push_to_user(target_user_id, {
          title: `Approval request from @${from}`,
          body: `@${from} ${verb}${desc}`,
          url: '/requests',
        })
      } catch (error) {
        logger.warn(
          { err: error, user_ref: auditRef(target_user_id), event: 'operation.degraded', action: 'notification.pending' },
          'failed to send approval notification',
        )
      }
    })(),
  )
}

export function notify_request_rejected(target_user_id: string, from_user_id: string, description?: string | null): Promise<void> {
  return track(
    (async () => {
      try {
        const from = await username_of(from_user_id)
        const desc = description ? ` — ${description}` : ''
        await send_push_to_user(target_user_id, {
          title: `@${from} rejected your change`,
          body: `A shared transaction needs your attention${desc}`,
          url: '/requests',
        })
      } catch (error) {
        logger.warn(
          { err: error, user_ref: auditRef(target_user_id), event: 'operation.degraded', action: 'notification.rejected' },
          'failed to send rejection notification',
        )
      }
    })(),
  )
}
