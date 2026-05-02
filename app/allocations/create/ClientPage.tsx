'use client'

import type { Prisma } from '@/generated/prisma/client'
import { CreateAccountForm, accountFormConfig } from '@/app/_components/AccountForm'

export default function ClientPage({ parents }: { parents: Prisma.accountGetPayload<Record<string, never>>[] }) {
  return <CreateAccountForm parents={parents} config={accountFormConfig('allocation')} />
}
