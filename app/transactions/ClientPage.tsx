'use client';

import React from 'react';
import Link from 'next/link';
import { currency_fmt } from '../_utils/currency formatter';

export default function ClientPage({
  transactions,
}: {
  transactions: { id: string; date: string; description: string | null; total_book: number }[];
}) {
  return (
    <div>
      <h1>Transactions</h1>
      <div>
        <Link href="/transactions/create">Create new</Link>
      </div>
      <ul>
        {transactions.map(tx => (
          <li key={tx.id} style={{ marginBottom: 8 }}>
            <Link href={`/transactions/${tx.id}`}>
              <strong>{new Date(tx.date).toLocaleString()}</strong>
            </Link>{' '}
            — {tx.description ?? '—'} {currency_fmt.format(tx.total_book)}
          </li>
        ))}
      </ul>
    </div>
  );
}
