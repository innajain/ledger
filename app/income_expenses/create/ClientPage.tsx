'use client'

import type { Prisma } from '@/generated/prisma/client'
import { CreateAccountForm, accountFormConfig } from '@/app/_components/AccountForm'

export default function ClientPage({ parents }: { parents: Prisma.accounting_headGetPayload<Record<string, never>>[] }) {
  return <CreateAccountForm parents={parents} config={accountFormConfig('income_expense')} />
}
