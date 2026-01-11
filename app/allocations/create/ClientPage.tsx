'use client';

import type { Prisma } from '@/generated/prisma/client';
import { CreateAccountForm } from '@/app/_components/AccountForm';

const allocationConfig = {
  accountType: 'allocation' as const,
  entityName: 'Allocation',
  basePath: '/allocations',
  backText: 'Back to Allocations',
  parentLabel: 'Parent Allocation (Optional)',
  parentHelpText: 'Select a parent to create a sub-allocation',
};

export default function ClientPage({ parents }: { parents: Prisma.accountGetPayload<Record<string, never>>[] }) {
  return <CreateAccountForm parents={parents} config={allocationConfig} />;
}
