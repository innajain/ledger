'use client';

import Link from 'next/link';
import { currency_fmt } from '@/app/_utils/currency formatter';

export default function ClientPage({ transaction, deleteTransaction }: { transaction: any; deleteTransaction?: (id: string) => Promise<void> }) {
  return (
    <div>
      <h1>Transaction — {new Date(transaction.date).toLocaleString()}</h1>
      <div>
        <Link href={`/transactions/${transaction.id}/update`}>Edit</Link> <Link href="/transactions">Back to transactions</Link>{' '}
        <button
          onClick={async () => {
            if (!deleteTransaction) return alert('delete not available');
            if (!confirm('Delete this transaction? This action cannot be undone.')) return;
            try {
              await deleteTransaction(transaction.id);
              window.location.href = '/transactions';
            } catch (err: any) {
              alert('Delete failed: ' + (err?.message ?? String(err)));
            }
          }}
          style={{ marginLeft: 8 }}
        >
          Delete
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>Total: {currency_fmt.format(transaction.total)}</strong>
      </div>

      <h3 style={{ marginTop: 12 }}>Line items</h3>

      {/** Group line items by account type */}
      {(() => {
        const groups: Record<string, any[]> = { real: [], allocation: [], nominal: [] };
        for (const li of transaction.line_items) {
          const t = li.account_type ?? 'real';
          if (!groups[t]) groups[t] = [];
          groups[t].push(li);
        }

        return (
          <div>
            {(['real', 'allocation', 'nominal'] as const).map(typeKey => {
              const items = groups[typeKey] || [];
              if (!items || items.length === 0) return null;
              const heading = typeKey === 'real' ? 'Real accounts' : typeKey === 'allocation' ? 'Allocation accounts' : 'Nominal accounts';
              return (
                <section key={typeKey} style={{ marginBottom: 12 }}>
                  <h4>{heading}</h4>
                  <ul>
                    {items.map((li: any) => (
                      <li key={li.id} style={{ marginBottom: 6 }}>
                        <div>
                          <Link href={`/accounts/${li.account_id}`}>
                            <strong>{li.account_name}</strong>
                          </Link>{' '}
                          — <Link href={`/assets/${li.asset_id}`}>{li.asset_name}</Link>
                          {li.is_base_currency ? (
                            <span> — {currency_fmt.format(li.quantity)}</span>
                          ) : (
                            <span> — {li.quantity} units — book: {li.book_value === null ? '—' : currency_fmt.format(li.book_value)}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
