'use client';

import { useState } from 'react';
import { update_account } from '@/app/_actions/resources';
import type { Prisma } from '@/generated/prisma/client';
import { PageHeader, FormCard, TextInput, ParentSelect, FormActions } from '@/app/_components/AccountFormComponents';

export default function ClientPage({
  account,
  parents,
  deleteAccount,
}: {
  account: Prisma.accountGetPayload<{}>;
  parents: Prisma.accountGetPayload<{}>[];
  deleteAccount?: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(account.name);
  const [parentId, setParentId] = useState<string | null>(account.parent_id ?? null);
  const [busy, setBusy] = useState(false);

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await update_account(account.id, name, 'allocation', parentId);
      window.location.href = '/allocations';
    } catch (err: any) {
      alert('Failed: ' + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAccount) return alert('Delete not available');
    if (!confirm('Delete this allocation? This action cannot be undone.')) return;
    try {
      await deleteAccount(account.id);
      window.location.href = '/allocations';
    } catch (err: any) {
      alert('Delete failed: ' + (err?.message ?? String(err)));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backLink="/allocations"
        backText="Back to Allocations"
        title="Update Allocation"
        description="Modify allocation details or delete"
      />

      <form onSubmit={onUpdate} className="space-y-6">
        <FormCard title="Allocation Details">
          <TextInput label="Allocation Name" value={name} onChange={setName} placeholder="Enter allocation name" required />

          <ParentSelect
            label="Parent Allocation (Optional)"
            value={parentId}
            onChange={setParentId}
            parents={parents}
            excludeId={account.id}
            helpText="Select a parent to create a sub-allocation"
          />
        </FormCard>

        <FormActions
          cancelLink="/allocations"
          submitText={busy ? 'Updating...' : 'Update Allocation'}
          busy={busy}
          onDelete={deleteAccount ? onDelete : undefined}
          deleteText="Delete Allocation"
        />
      </form>
    </div>
  );
}
