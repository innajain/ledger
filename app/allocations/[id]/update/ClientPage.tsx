'use client'

import type { Prisma } from '@/generated/prisma/client'
import { UpdateAccountForm, accountFormConfig } from '@/app/_components/AccountForm'

export default function ClientPage({
  account,
  parents,
  deleteAccount,
}: {
  account: Prisma.accountGetPayload<Record<string, never>>
  parents: Prisma.accountGetPayload<Record<string, never>>[]
  deleteAccount?: (id: string) => Promise<{ success: boolean; message: string }>
}) {
  return <UpdateAccountForm account={account} parents={parents} config={accountFormConfig('allocation')} deleteAccount={deleteAccount} />
}
