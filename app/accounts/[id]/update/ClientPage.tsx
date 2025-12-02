"use client";

import { useState } from 'react';
import { update_account } from '@/app/_actions/resources';
import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import type { account_type } from '@/generated/prisma/client';

export default function ClientPage({ account, parents, deleteAccount }: { account: Prisma.accountGetPayload<{}>; parents: Prisma.accountGetPayload<{}>[]; deleteAccount?: (id: string) => Promise<void> }) {
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<account_type>(account.type);
  const [parentId, setParentId] = useState<string | null>(account.parent_id ?? null);
  const [busy, setBusy] = useState(false);

  async function onUpdate() {
    setBusy(true);
    try {
      await update_account(account.id, name, type, parentId ?? undefined);
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAccount) return alert('delete not available');
    if (!confirm('Delete this account? This action cannot be undone.')) return;
    try {
      await deleteAccount(account.id);
      window.location.href = '/accounts';
    } catch (err: any) {
      alert('Delete failed: ' + (err?.message ?? String(err)));
    }
  }

  return (
    <div>
      <h1>Update Account</h1>
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
          {parents.filter(p => p.id !== account.id).map(p => (
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
