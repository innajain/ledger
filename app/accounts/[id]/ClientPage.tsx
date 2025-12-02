'use client';

import React from 'react';
import Link from 'next/link';

type LineItem = {
  id: string;
  asset_id: string;
  asset_name: string;
  is_base_currency: boolean;
  quantity: number;
  book_value: number | null;
  current_value: number;
  transaction_id: string;
  transaction_date: string;
};

type AccountForClient = {
  id: string;
  name: string;
  type: string;
  parent: { id: string; name: string } | null;
  total: number;
  line_items: LineItem[];
};

export default function ClientPage({ account, currencyLocale, currency }: { account: AccountForClient; currencyLocale: string; currency: string }) {
  const currencyFmt = new Intl.NumberFormat(currencyLocale, { style: 'currency', currency, maximumFractionDigits: 2 });

  return (
    <div>
      <h1>Account — {account.name}</h1>
      <div>
        <Link href={`/accounts/${account.id}/update`}>Edit</Link>{' '}
        <Link href="/accounts">Back to accounts</Link>
      </div>
      <div>Type: {account.type}</div>
      <div>Parent: {account.parent ? account.parent.name : '—'}</div>
      <div style={{ marginTop: 8 }}>
        <strong>Total: {currencyFmt.format(account.total)}</strong>
      </div>

      <h3 style={{ marginTop: 12 }}>Line items</h3>
      <ul>
        {account.line_items.map(li => (
          <li key={li.id} style={{ marginBottom: 6 }}>
            <div>
              <Link href={`/assets/${li.asset_id}`}>
                <strong>{li.asset_name}</strong>
              </Link>{' '}
              — {li.is_base_currency ? (
                <span>{currencyFmt.format(li.current_value)}</span>
              ) : (
                <>
                  {li.quantity} units — book: {li.book_value === null ? '—' : currencyFmt.format(li.book_value)} — current: {currencyFmt.format(li.current_value)}
                </>
              )}
              {' '}
              <small style={{ marginLeft: 8 }}>
                <Link href={`/transactions/${li.transaction_id}`}>{new Date(li.transaction_date).toLocaleString()}</Link>
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
