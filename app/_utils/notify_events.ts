import 'server-only'
import { prisma } from '@/lib/prisma'
import { send_push_to_user } from './push'

// Domain-level push notifications for the cross-user approval workflow. All are
// safe to call fire-and-forget — they never throw (send_push_to_user swallows
// delivery errors; the username lookup is wrapped).

async function username_of(user_id: string): Promise<string> {
  try {
    const u = await prisma.user.findUnique({ where: { id: user_id }, select: { username: true } })
    return u?.username ?? 'someone'
  } catch {
    return 'someone'
  }
}

// A new or changed approval request now awaits `target_user_id`.
export async function notify_request_pending(
  target_user_id: string,
  from_user_id: string,
  opts: { changed?: boolean; description?: string | null } = {},
): Promise<void> {
  const from = await username_of(from_user_id)
  const verb = opts.changed ? 'updated a shared transaction' : 'sent you a transaction to approve'
  const desc = opts.description ? ` — ${opts.description}` : ''
  await send_push_to_user(target_user_id, {
    title: `Approval request from @${from}`,
    body: `@${from} ${verb}${desc}`,
    url: '/requests',
  })
}

// `target_user_id`'s change was rejected by `from_user_id`.
export async function notify_request_rejected(target_user_id: string, from_user_id: string, description?: string | null): Promise<void> {
  const from = await username_of(from_user_id)
  const desc = description ? ` — ${description}` : ''
  await send_push_to_user(target_user_id, {
    title: `@${from} rejected your change`,
    body: `A shared transaction needs your attention${desc}`,
    url: '/requests',
  })
}
