import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { delete_account } from '@/app/_actions/resources'
import type { Prisma } from '@/generated/prisma/client'
import { UpdateHeadForm, headFormConfig } from '@/app/_components/HeadForm'
import { HEAD_CONFIG, isHeadType } from '../../head_config'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ type: string; id: string }> }

async function Page({ params }: Props) {
  const { type, id } = await params
  if (!isHeadType(type)) notFound()
  const cfg = HEAD_CONFIG[type]

  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Update {cfg.entityName}</h1>
        <p>User not authenticated.</p>
      </div>
    )
  }

  const head = await prisma.accounting_head.findUnique({ where: { id, user_id: user.id, type } })
  if (!head) {
    return (
      <div>
        <h1>Update {cfg.entityName}</h1>
        <p>{cfg.entityName} not found.</p>
      </div>
    )
  }

  // Linked-user display is head-only (the only type that can be linked).
  const linkedUsername =
    type === 'account' && head.linked_user_id
      ? ((await prisma.user.findUnique({ where: { id: head.linked_user_id }, select: { username: true } }))?.username ?? null)
      : null

  const parents: Prisma.accounting_headGetPayload<Record<string, never>>[] = await prisma.accounting_head.findMany({
    where: { user_id: user.id, type },
    orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  })

  return <UpdateHeadForm head={head} parents={parents} config={headFormConfig(type)} deleteHead={delete_account} linkedUsername={linkedUsername} />
}

export default profile('/heads/[type]/[id]/update', Page)
