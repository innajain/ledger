'use client';

import { useState } from 'react';
import { create_asset } from '@/app/_actions/resources';
import type { asset_type, Prisma } from '@/generated/prisma/client';
import { PageHeader, FormCard, TextInput, AssetTypeSelect, ParentAssetSelect, FormActions, ErrorAlert } from '@/app/_components/AccountFormComponents';

export default function ClientPage({ parents }: { parents: Prisma.assetGetPayload<{}>[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<asset_type>('other');
  const [ticker, setTicker] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await create_asset(name, type, ticker || undefined, parentId, isActive);
      window.location.href = '/assets';
    } catch (err: any) {
      setError(err?.message ?? String(err));
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

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Active</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">Inactive assets can be archived and hidden from default views</p>
          </div>
        </FormCard>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <FormActions cancelLink="/assets" submitText={busy ? 'Creating...' : 'Create Asset'} busy={busy} />
      </form>
    </div>
  );
}
