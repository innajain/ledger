'use client';

import React from 'react';
import Link from 'next/link';

type BreakdownItem = {
  account_name: string;
  quantity: number;
  book_value: number | null;
  current_value: number;
  transaction_id: string;
  transaction_date: string;
};

type AssetForClient = {
  id: string;
  name: string;
  type: string;
  ticker: string | null;
  parent: { id: string; name: string } | null;
  total: number;
  breakdown: BreakdownItem[];
};

export default function ClientPage({ asset, currencyLocale, currency }: { asset: AssetForClient; currencyLocale: string; currency: string }) {
  const currencyFmt = new Intl.NumberFormat(currencyLocale, { style: 'currency', currency, maximumFractionDigits: 2 });

  return (
    <div>
      <h1>Asset — {asset.name}</h1>
      <div>
        <Link href={`/assets/${asset.id}/update`}>Edit</Link> <Link href="/assets">Back to assets</Link>
      </div>
      <div>Type: {asset.type}</div>
      <div>Ticker: {asset.ticker ?? '—'}</div>
      <div>Parent: {asset.parent ? asset.parent.name : '—'}</div>
      <div style={{ marginTop: 8 }}>
        <strong>Total across real accounts: {currencyFmt.format(asset.total)}</strong>
      </div>

      <h3 style={{ marginTop: 12 }}>Holdings (by account)</h3>
      <ul>
        {asset.breakdown.map((b, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <div>
              <strong>{b.account_name}</strong> —{' '}
              {asset.type === 'rupees' ? (
                <span>{currencyFmt.format(b.current_value)}</span>
              ) : (
                <>
                  {b.quantity} units — book: {b.book_value === null ? '—' : currencyFmt.format(b.book_value)} — current:{' '}
                  {currencyFmt.format(b.current_value)}
                </>
              )}{' '}
              <small style={{ marginLeft: 8 }}>
                <Link href={`/transactions/${b.transaction_id}`}>{new Date(b.transaction_date).toLocaleString()}</Link>
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
