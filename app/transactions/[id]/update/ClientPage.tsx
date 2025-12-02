'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function ClientPage({
  transaction,
  accounts,
  assets,
  updateTransaction,
}: {
  transaction: any;
  accounts: { id: string; name: string; type: string }[];
  assets: { id: string; name: string; type: string; is_base_currency: boolean }[];
  updateTransaction: any;
}) {
  const [date, setDate] = useState(transaction.date.slice(0, 16));
  const [description, setDescription] = useState(transaction.description ?? '');
  const [items, setItems] = useState<Array<{ account_id: string; asset_id: string; quantity: string; book_value: string }>>(
    transaction.line_items.map((li: any) => ({ account_id: li.account_id, asset_id: li.asset_id, quantity: String(li.quantity ?? 0), book_value: li.book_value == null ? '' : String(li.book_value) }))
  );
  const [busy, setBusy] = useState(false);

  function addItem() {
    setItems(prev => [...prev, { account_id: accounts[0]?.id ?? '', asset_id: assets[0]?.id ?? '', quantity: '0', book_value: '' }]);
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const line_items = items.map(it => ({ account_id: it.account_id, asset_id: it.asset_id, quantity: Number(it.quantity), book_value: it.book_value === '' ? null : Number(it.book_value) }));
      await updateTransaction(transaction.id, line_items, new Date(date), description || null);
      window.location.href = `/transactions/${transaction.id}`;
    } catch (err: any) {
      alert('Failed: ' + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Edit Transaction</h1>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/transactions/${transaction.id}`}>← Back to transaction</Link>
      </div>
      <form onSubmit={onSubmit}>
        <div>
          <label>
            Date & time:
            <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
          </label>
        </div>

        <div>
          <label>
            Description:
            <input value={description} onChange={e => setDescription(e.target.value)} />
          </label>
        </div>

        <h3>Line items</h3>
        {(() => {
          const groups: Record<string, any[]> = { real: [], allocation: [], nominal: [] };
          for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            const acc = accounts.find(a => a.id === it.account_id);
            const t = acc?.type ?? 'real';
            groups[t] = groups[t] || [];
            groups[t].push({ item: it, idx });
          }

          return (
            <div>
              {(['real', 'allocation', 'nominal'] as const).map(typeKey => {
                const list = groups[typeKey] || [];
                if (list.length === 0) return null;
                const heading = typeKey === 'real' ? 'Real accounts' : typeKey === 'allocation' ? 'Allocation accounts' : 'Nominal accounts';
                return (
                  <section key={typeKey} style={{ marginBottom: 12 }}>
                    <h4>{heading}</h4>
                    {list.map(({ item: it, idx }) => {
                      const asset = assets.find(a => a.id === it.asset_id);
                      return (
                        <div key={idx} style={{ marginBottom: 8 }}>
                          <select value={it.account_id} onChange={e => setItems(prev => { const copy = [...prev]; copy[idx].account_id = e.target.value; return copy; })}>
                            {accounts.filter(a => a.type === typeKey).map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                          </select>

                          <select value={it.asset_id} onChange={e => setItems(prev => { const copy = [...prev]; copy[idx].asset_id = e.target.value; return copy; })}>
                            {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                          </select>

                          <input type="number" step="any" value={it.quantity} onChange={e => setItems(prev => { const copy = [...prev]; copy[idx].quantity = e.target.value; return copy; })} />

                          {!asset?.is_base_currency && (
                            <input type="number" step="any" placeholder="book value" value={it.book_value} onChange={e => setItems(prev => { const copy = [...prev]; copy[idx].book_value = e.target.value; return copy; })} />
                          )}

                          <button type="button" onClick={() => removeItem(idx)}>Remove</button>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          );
        })()}

        <div>
          <button type="button" onClick={addItem}>Add item</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={busy}>Update</button>
        </div>
      </form>
    </div>
  );
}
