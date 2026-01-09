'use client';

import { useState } from 'react';
import { create_account } from '@/app/_actions/resources';
import type { Prisma } from '@/generated/prisma/client';
import { PageHeader, FormCard, TextInput, ParentSelect, FormActions } from '@/app/_components/AccountFormComponents';

export default function ClientPage({ parents }: { parents: Prisma.accountGetPayload<{}>[] }) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create_account(name, 'real', parentId ?? undefined);
      window.location.href = '/accounts';
    } catch (err: any) {
      alert('Failed: ' + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader backLink="/accounts" backText="Back to Accounts" title="Create Account" description="Add a new account to your ledger" />

      <form onSubmit={onCreate} className="space-y-6">
        <FormCard title="Account Details">
          <TextInput label="Account Name" value={name} onChange={setName} placeholder="Enter account name" required />

          <ParentSelect
            label="Parent Account (Optional)"
            value={parentId}
            onChange={setParentId}
            parents={parents}
            helpText="Select a parent to create a sub-account"
          />
        </FormCard>

        <FormActions cancelLink="/accounts" submitText={busy ? 'Creating...' : 'Create Account'} busy={busy} />
      </form>
    </div>
  );
}
