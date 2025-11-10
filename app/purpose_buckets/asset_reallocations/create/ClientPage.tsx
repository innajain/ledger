'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { create_asset_reallocation_between_purpose_buckets } from '@/server actions/purpose_bucket/asset_reallocation_between_purpose_buckets/create';
import { get_indian_date_from_date_obj } from '@/utils/date';

type BucketRef = { id: string; name: string };
type AssetRef = { id: string; name: string };

export default function ClientPage({ purpose_buckets, assets }: { purpose_buckets: BucketRef[]; assets: AssetRef[] }) {
  const router = useRouter();
  const [fromBucket, setFromBucket] = useState(purpose_buckets[0]?.id || '');
  const [toBucket, setToBucket] = useState(purpose_buckets[1]?.id || purpose_buckets[0]?.id || '');
  const [assetId, setAssetId] = useState(assets[0]?.id || '');
  const [quantity, setQuantity] = useState<number | ''>('' as any);
  const [dateStr, setDateStr] = useState(get_indian_date_from_date_obj(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromBucket || !toBucket) return setError('Choose both source and destination buckets');
    if (fromBucket === toBucket) return setError('Source and destination must be different');
    if (!assetId) return setError('Choose an asset');
    const q = Number(quantity);
    if (!q || q <= 0) return setError('Quantity must be > 0');

    setLoading(true);
    try {
      await create_asset_reallocation_between_purpose_buckets({
        from_purpose_bucket_id: fromBucket,
        to_purpose_bucket_id: toBucket,
        asset_id: assetId,
        quantity: q,
        date: dateStr,
      });
      router.push('/purpose_buckets');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-yellow-50 to-amber-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Create Asset Reallocation</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">From Bucket</label>
              <select className="mt-1 block w-full border rounded px-2 py-1" value={fromBucket} onChange={e => setFromBucket(e.target.value)}>
                {purpose_buckets.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">To Bucket</label>
              <select className="mt-1 block w-full border rounded px-2 py-1" value={toBucket} onChange={e => setToBucket(e.target.value)}>
                {purpose_buckets.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Asset</label>
            <select className="mt-1 block w-full border rounded px-2 py-1" value={assetId} onChange={e => setAssetId(e.target.value)}>
              {assets.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Quantity</label>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              className="mt-1 block w-full border rounded px-2 py-1"
              value={quantity as any}
              onChange={e => setQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Date</label>
            <input type="date" className="mt-1 block w-full border rounded px-2 py-1" value={dateStr} onChange={e => setDateStr(e.target.value)} />
            <div className="text-xs text-gray-500 mt-1">If empty, today's date will be used.</div>
          </div>

          {error && <div className="text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="px-4 py-2 bg-amber-500 text-white rounded">
              {loading ? 'Creating...' : 'Create Reallocation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
