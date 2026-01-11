'use client';

import type { Prisma } from '@/generated/prisma/client';
import { UpdateAccountForm } from '@/app/_components/AccountForm';

const allocationConfig = {
  accountType: 'allocation' as const,
  entityName: 'Allocation',
  basePath: '/allocations',
  backText: 'Back to Allocations',
  parentLabel: 'Parent Allocation (Optional)',
  parentHelpText: 'Select a parent to create a sub-allocation',
};

export default function ClientPage({
  account,
  parents,
  deleteAccount,
}: {
  account: Prisma.accountGetPayload<Record<string, never>>;
  parents: Prisma.accountGetPayload<Record<string, never>>[];
  deleteAccount?: (id: string) => Promise<void>;
}) {
  return <UpdateAccountForm account={account} parents={parents} config={allocationConfig} deleteAccount={deleteAccount} />;
}
