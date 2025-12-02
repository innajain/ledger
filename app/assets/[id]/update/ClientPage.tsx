"use client";

import { useState } from 'react';
import { update_asset } from '@/app/_actions/resources';
import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import type { asset_type } from '@/generated/prisma/client';

export default function ClientPage({ asset, parents, deleteAsset }: { asset: Prisma.assetGetPayload<{}>; parents: Prisma.assetGetPayload<{}>[]; deleteAsset?: (id: string) => Promise<void> }) {
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState<asset_type>(asset.type);
  const [ticker, setTicker] = useState(asset.ticker ?? '');
  const [parentId, setParentId] = useState<string | null>(asset.parent_id ?? null);
  const [busy, setBusy] = useState(false);

  async function onUpdate() {
    setBusy(true);
    try {
      await update_asset(asset.id, name, type, ticker || undefined, parentId ?? undefined);
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAsset) return alert('delete not available');
    if (!confirm('Delete this asset? This action cannot be undone.')) return;
    try {
      await deleteAsset(asset.id);
      window.location.href = '/assets';
    } catch (err: any) {
      alert('Delete failed: ' + (err?.message ?? String(err)));
    }
  }

  return (
    <div>
      <h1>Update Asset</h1>
      <div>
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label>Type</label>
        <select value={type} onChange={e => setType(e.target.value as asset_type)}>
          <option value="rupees">rupees</option>
          <option value="mf">mf</option>
          <option value="etf">etf</option>
          <option value="shares">shares</option>
          <option value="other">other</option>
        </select>
      </div>
      <div>
        <label>Ticker</label>
        <input value={ticker} onChange={e => setTicker(e.target.value)} />
      </div>
      <div>
        <label>Parent (optional)</label>
        <select value={parentId ?? ''} onChange={e => setParentId(e.target.value || null)}>
          <option value="">-- none --</option>
          {parents.filter(p => p.id !== asset.id).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <button onClick={onUpdate} disabled={busy}>Update</button>{' '}
        <button onClick={onDelete} style={{ marginLeft: 8 }}>Delete</button>
      </div>
    </div>
  );
}
