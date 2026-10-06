import { prisma } from '@/lib/prisma'
import { send_push_to_user } from '@/app/_utils/push'
import { rate_limit } from '@/lib/rate_limit'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'

// Shared by the web action and the MCP tool, so both enforce the same link check
// and the same rate limits — an agent can't nag a counterparty faster than a person.

async function is_linked_to(me: string, target: string): Promise<boolean> {
  const head = await prisma.accounting_head.findFirst({
    where: { user_id: me, linked_user_id: target },
    select: { id: true },
  })
  return !!head
}

export async function notify_linked_user_core(me: string, target_user_id: string, message: string): Promise<ActionResult<{ delivered: number }>> {
  try {
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

    audit('notification.linked_user', me, { delivered_count: delivered })
    return ok({ delivered }, delivered > 0 ? 'Notification sent' : "Sent — but they don't have notifications enabled")
  } catch (error) {
    return reportActionError(error, { action: 'notification.linked_user' })
  }
}
