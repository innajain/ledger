'use client';

import type { Prisma } from '@/generated/prisma/client';
import { CreateAccountForm } from '@/app/_components/AccountForm';

const nominalConfig = {
  accountType: 'nominal' as const,
  entityName: 'Nominal Account',
  basePath: '/income_expenses',
  backText: 'Back to Nominal Accounts',
  parentLabel: 'Parent Account (Optional)',
  parentHelpText: 'Select a parent to create a sub-account',
};

export default function ClientPage({ parents }: { parents: Prisma.accountGetPayload<Record<string, never>>[] }) {
  return <CreateAccountForm parents={parents} config={nominalConfig} />;
}
