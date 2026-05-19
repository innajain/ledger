'use client'

import type { Prisma } from '@/generated/prisma/client'
import type { ActionResult } from '@/app/_actions/_result'
import { UpdateAccountForm, accountFormConfig } from '@/app/_components/AccountForm'

export default function ClientPage({
  account,
  parents,
  deleteAccount,
}: {
  account: Prisma.accounting_headGetPayload<Record<string, never>>
  parents: Prisma.accounting_headGetPayload<Record<string, never>>[]
  deleteAccount?: (id: string) => Promise<ActionResult>
}) {
  return <UpdateAccountForm account={account} parents={parents} config={accountFormConfig('account')} deleteAccount={deleteAccount} />
}
