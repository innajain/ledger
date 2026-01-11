'use client';

import type { Prisma } from '@/generated/prisma/client';
import { CreateAccountForm } from '@/app/_components/AccountForm';

const accountConfig = {
  accountType: 'real' as const,
  entityName: 'Account',
  basePath: '/accounts',
  backText: 'Back to Accounts',
  parentLabel: 'Parent Account (Optional)',
  parentHelpText: 'Select a parent to create a sub-account',
};

export default function ClientPage({ parents }: { parents: Prisma.accountGetPayload<Record<string, never>>[] }) {
  return <CreateAccountForm parents={parents} config={accountConfig} />;
}
