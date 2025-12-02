'use client';

import { useState } from 'react';
import { create_asset } from '@/app/_actions/resources';
import type { asset_type, Prisma } from '@/generated/prisma/client';
import { PageHeader, FormCard, TextInput, AssetTypeSelect, ParentAssetSelect, FormActions } from '@/app/_components/AccountFormComponents';

export default function ClientPage({ parents }: { parents: Prisma.assetGetPayload<{}>[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<asset_type>('other');
  const [ticker, setTicker] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create_asset(name, type, ticker || undefined, parentId ?? undefined);
      window.location.href = '/assets';
    } catch (err: any) {
      alert('Failed: ' + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader backLink="/assets" backText="Back to Assets" title="Create Asset" description="Add a new asset to your portfolio" />

      <form onSubmit={onCreate} className="space-y-6">
        <FormCard title="Asset Details">
          <TextInput label="Asset Name" value={name} onChange={setName} placeholder="Enter asset name" required />

          <AssetTypeSelect label="Asset Type" value={type} onChange={val => setType(val as asset_type)} />

          <TextInput label="Ticker (Optional)" value={ticker} onChange={setTicker} placeholder="e.g., AAPL, INFY" />

          <ParentAssetSelect
            label="Parent Asset (Optional)"
            value={parentId}
            onChange={setParentId}
            parents={parents}
            helpText="Select a parent to create a sub-asset"
          />
        </FormCard>

        <FormActions cancelLink="/assets" submitText={busy ? 'Creating...' : 'Create Asset'} busy={busy} />
      </form>
    </div>
  );
}
