'use client'

import type { Prisma } from '@/generated/prisma/client'
import { UpdateAccountForm } from '@/app/_components/AccountForm'

const accountConfig = {
  accountType: 'real' as const,
  entityName: 'Account',
  basePath: '/accounts',
  backText: 'Back to Accounts',
  parentLabel: 'Parent Account (Optional)',
  parentHelpText: 'Select a parent to create a sub-account',
}

export default function ClientPage({
  account,
  parents,
  deleteAccount,
}: {
  account: Prisma.accountGetPayload<Record<string, never>>
  parents: Prisma.accountGetPayload<Record<string, never>>[]
  deleteAccount?: (id: string) => Promise<void>
}) {
  return <UpdateAccountForm account={account} parents={parents} config={accountConfig} deleteAccount={deleteAccount} />
}
