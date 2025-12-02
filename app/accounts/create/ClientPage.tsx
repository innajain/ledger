"use client";

import { useState } from 'react';
import Link from 'next/link';
import { create_account } from '@/app/_actions/resources';
import type { account_type, Prisma } from '@/generated/prisma/client';

export default function ClientPage({ parents }: { parents: Prisma.accountGetPayload<{}>[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<account_type>('real');
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setBusy(true);
    try {
      await create_account(name, type, parentId ?? undefined);
      // simple client-side redirect
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Create Account</h1>
      <div style={{ marginBottom: 8 }}>
        <Link href="/accounts">← Back to accounts</Link>
      </div>
      <div>
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label>Type</label>
        <select value={type} onChange={e => setType(e.target.value as account_type)}>
          <option value="real">real</option>
          <option value="allocation">allocation</option>
          <option value="nominal">nominal</option>
        </select>
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
