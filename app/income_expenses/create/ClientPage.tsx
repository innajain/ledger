'use client';

import { useState } from 'react';
import { create_account } from '@/app/_actions/resources';
import type { account_type, Prisma } from '@/generated/prisma/client';
import { PageHeader, FormCard, TextInput, AccountTypeSelect, ParentSelect, FormActions } from '@/app/_components/AccountFormComponents';

export default function ClientPage({ parents }: { parents: Prisma.accountGetPayload<{}>[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<account_type>('nominal');
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create_account(name, type, parentId ?? undefined);
      window.location.href = '/income_expenses';
    } catch (err: any) {
      alert('Failed: ' + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader backLink="/income_expenses" backText="Back to Nominal Accounts" title="Create Nominal Account" description="Add an income or expense account" />

      <form onSubmit={onCreate} className="space-y-6">
        <FormCard title="Account Details">
          <TextInput label="Account Name" value={name} onChange={setName} placeholder="Enter account name" required />

          <AccountTypeSelect label="Account Type" value={type} onChange={setType} restrictedTo={['nominal']} />

          <ParentSelect
            label="Parent Account (Optional)"
            value={parentId}
            onChange={setParentId}
            parents={parents}
            helpText="Select a parent to create a sub-account"
          />
        </FormCard>

        <FormActions cancelLink="/income_expenses" submitText={busy ? 'Creating...' : 'Create Account'} busy={busy} />
      </form>
    </div>
  );
}
