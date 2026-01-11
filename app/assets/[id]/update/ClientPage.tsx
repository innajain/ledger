'use client';

import { useState } from 'react';
import { update_asset } from '@/app/_actions/resources';
import type { Prisma, asset_type } from '@/generated/prisma/client';
import { PageHeader, FormCard, TextInput, AssetTypeSelect, ParentAssetSelect, FormActions, ErrorAlert } from '@/app/_components/AccountFormComponents';

export default function ClientPage({
  asset,
  parents,
  deleteAsset,
}: {
  asset: Prisma.assetGetPayload<{}>;
  parents: Prisma.assetGetPayload<{}>[];
  deleteAsset?: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState<asset_type>(asset.type);
  const [ticker, setTicker] = useState(asset.ticker ?? '');
  const [parentId, setParentId] = useState<string | null>(asset.parent_id ?? null);
  const [isActive, setIsActive] = useState(asset.is_active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await update_asset(asset.id, name, type, ticker || undefined, parentId, isActive);
      window.location.href = '/assets';
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAsset) {
      setError('Delete operation is not available');
      return;
    }
    if (!confirm('Delete this asset? This action cannot be undone.')) return;
    setError(null);
    try {
      await deleteAsset(asset.id);
      window.location.href = '/assets';
    } catch (err: any) {
      setError('Delete failed: ' + (err?.message ?? String(err)));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader backLink="/assets" backText="Back to Assets" title="Update Asset" description="Modify asset details or delete" />

      <form onSubmit={onUpdate} className="space-y-6">
        <FormCard title="Asset Details">
          <TextInput label="Asset Name" value={name} onChange={setName} placeholder="Enter asset name" required />

          <AssetTypeSelect label="Asset Type" value={type} onChange={val => setType(val as asset_type)} />

          <TextInput label="Ticker (Optional)" value={ticker} onChange={setTicker} placeholder="e.g., AAPL, INFY" />

          <ParentAssetSelect
            label="Parent Asset (Optional)"
            value={parentId}
            onChange={setParentId}
            parents={parents}
            excludeId={asset.id}
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

        <FormActions
          cancelLink="/assets"
          submitText={busy ? 'Updating...' : 'Update Asset'}
          busy={busy}
          onDelete={deleteAsset ? onDelete : undefined}
          deleteText="Delete Asset"
        />
      </form>
    </div>
  );
}
