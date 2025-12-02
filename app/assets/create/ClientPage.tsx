"use client";

import { useState } from 'react';
import Link from 'next/link';
import { create_asset } from '@/app/_actions/resources';
import type { asset_type, Prisma } from '@/generated/prisma/client';

export default function ClientPage({ parents }: { parents: Prisma.assetGetPayload<{}>[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<asset_type>('other');
  const [ticker, setTicker] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setBusy(true);
    try {
      await create_asset(name, type, ticker || undefined, parentId ?? undefined);
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Create Asset</h1>
      <div style={{ marginBottom: 8 }}>
        <Link href="/assets">← Back to assets</Link>
      </div>
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
          {parents.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <button onClick={onCreate} disabled={busy}>Create</button>
      </div>
    </div>
  );
}
