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
      await create_account(name, 'allocation', parentId ?? undefined);
      window.location.href = '/allocations';
    } catch (err: any) {
      alert('Failed: ' + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backLink="/allocations"
        backText="Back to Allocations"
        title="Create Allocation"
        description="Add a new allocation to your ledger"
      />

      <form onSubmit={onCreate} className="space-y-6">
        <FormCard title="Allocation Details">
          <TextInput label="Allocation Name" value={name} onChange={setName} placeholder="Enter allocation name" required />

          <ParentSelect
            label="Parent Allocation (Optional)"
            value={parentId}
            onChange={setParentId}
            parents={parents}
            helpText="Select a parent to create a sub-allocation"
          />
        </FormCard>

        <FormActions cancelLink="/allocations" submitText={busy ? 'Creating...' : 'Create Allocation'} busy={busy} />
      </form>
    </div>
  );
}
