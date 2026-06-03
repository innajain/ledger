import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import type { Prisma } from '@/generated/prisma/client'
import { CreateAccountForm, accountFormConfig } from '@/app/_components/AccountForm'
import { isHeadType } from '../head_config'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ type: string }> }

async function Page({ params }: Props) {
  const { type } = await params
  if (!isHeadType(type)) notFound()

  const user = await get_current_user()
  const parents: Prisma.accounting_headGetPayload<Record<string, never>>[] = user
    ? await prisma.accounting_head.findMany({
        where: { user_id: user.id, type },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      })
    : []

  return <CreateAccountForm parents={parents} config={accountFormConfig(type)} />
}

export default profile('/heads/[type]/create', Page)
