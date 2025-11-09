"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { update_asset_reallocation_between_purpose_buckets } from '@/server actions/purpose_bucket/asset_reallocation_between_purpose_buckets/update';
import { delete_asset_reallocation_between_purpose_buckets } from '@/server actions/purpose_bucket/asset_reallocation_between_purpose_buckets/delete';
import { get_indian_date_from_date_obj } from '@/utils/date';

type BucketRef = { id: string; name: string };
type AssetRef = { id: string; name: string };

export default function ClientPage({ initial_data, purpose_buckets, assets }: { initial_data: any; purpose_buckets: BucketRef[]; assets: AssetRef[] }) {
  const router = useRouter();
  const [fromBucket, setFromBucket] = useState(initial_data.from_purpose_bucket_id || '');
  const [toBucket, setToBucket] = useState(initial_data.to_purpose_bucket_id || '');
  const [assetId, setAssetId] = useState(initial_data.asset_id || '');
  const [quantity, setQuantity] = useState<number | ''>(initial_data.quantity ?? '');
  const [dateStr, setDateStr] = useState(() => {
    try {
      return initial_data?.date ? get_indian_date_from_date_obj(new Date(initial_data.date)) : '';
    } catch (e) {
      return '';
    }
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromBucket || !toBucket) return setError('Choose both buckets');
    if (fromBucket === toBucket) return setError('Buckets must differ');
    const q = Number(quantity);
    if (!q || q <= 0) return setError('Quantity must be > 0');

    setLoading(true);
    try {
      await update_asset_reallocation_between_purpose_buckets({ id: initial_data.id, from_purpose_bucket_id: fromBucket, to_purpose_bucket_id: toBucket, asset_id: assetId, quantity: q, date: dateStr || undefined });
      // navigate to from-bucket page
      router.push(`/purpose_buckets/${fromBucket}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this reallocation? This cannot be undone.')) return;
    setError(null);
    setDeleting(true);
    try {
      // server action expects the id string
      await delete_asset_reallocation_between_purpose_buckets(initial_data.id);
      router.push("/purpose_buckets");
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-yellow-50 to-amber-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Edit Reallocation</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm">From Bucket</label>
              <select value={fromBucket} onChange={e => setFromBucket(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                {purpose_buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm">To Bucket</label>
              <select value={toBucket} onChange={e => setToBucket(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                {purpose_buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm">Asset</label>
            <select value={assetId} onChange={e => setAssetId(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm">Quantity</label>
            <input type="number" value={quantity as any} onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 block w-full border rounded px-2 py-1" />
          </div>

          <div>
            <label className="block text-sm">Date (dd-MM-yyyy)</label>
            <input type="text" placeholder="dd-MM-yyyy" value={dateStr} onChange={e => setDateStr(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
            <div className="text-xs text-gray-500 mt-1">Enter date as DD-MM-YYYY. If empty, today's date will be used.</div>
          </div>

          {error && <div className="text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={loading || deleting} className="px-4 py-2 bg-amber-500 text-white rounded">{loading ? 'Saving...' : 'Save'}</button>

            <button type="button" onClick={onDelete} disabled={deleting || loading} className="px-4 py-2 bg-red-500 text-white rounded">
              {deleting ? 'Deleting...' : 'Delete'}
            </button>

            <button type="button" onClick={() => router.push(initial_data?.from_purpose_bucket_id ? `/purpose_buckets/${initial_data.from_purpose_bucket_id}` : '/purpose_buckets')} className="px-4 py-2 border rounded">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
