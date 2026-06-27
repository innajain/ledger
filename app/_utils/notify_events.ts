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

// Track every fire-and-forget notification so a runtime that exits the process
// immediately (the CLI) can await delivery before tearing down. On the web the
// serverless runtime keeps the function alive, so callers still just `void` these.
const in_flight = new Set<Promise<void>>()

function track(work: Promise<void>): Promise<void> {
  in_flight.add(work)
  void work.finally(() => in_flight.delete(work))
  return work
}

/** Await all push notifications still in flight (best-effort; they never reject). */
export async function flush_notifications(): Promise<void> {
  await Promise.allSettled([...in_flight])
}

// A new or changed approval request now awaits `target_user_id`.
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
      } catch {
        // best-effort — never throw to fire-and-forget callers
      }
    })(),
  )
}

// `target_user_id`'s change was rejected by `from_user_id`.
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
      } catch {
        // best-effort — never throw to fire-and-forget callers
      }
    })(),
  )
}
