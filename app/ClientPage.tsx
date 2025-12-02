"use client";

import React, { useState } from 'react';
import Link from 'next/link';

export default function ClientPage({ allocations = [], currencyLocale = 'en-IN', currency = 'INR', flushRedis, logOut }: { allocations?: { id: string; name: string; total: number }[]; currencyLocale?: string; currency?: string; flushRedis?: () => Promise<any>; logOut?: () => Promise<any> }) {
  const [busy, setBusy] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const fmt = new Intl.NumberFormat(currencyLocale, { style: 'currency', currency, maximumFractionDigits: 2 });

  // pick commonly named allocations if present
  const invest = allocations.find(a => /invest/i.test(a.name));
  const savings = allocations.find(a => /saving/i.test(a.name));

  return (
    <div style={{ padding: 20 }}>
      <h1>Home</h1>
      <div style={{ marginBottom: 8 }}>
        <button onClick={async () => {
          if (!flushRedis) return alert('Flush not available');
          if (!confirm('Flush Redis cache? This clears all cached prices.')) return;
          setBusy(true);
          try {
            const res = await flushRedis();
            alert(res?.ok ? 'Redis flushed' : 'Flush returned: ' + JSON.stringify(res));
          } catch (err: any) {
            alert('Flush failed: ' + (err?.message ?? String(err)));
          } finally {
            setBusy(false);
          }
        }} disabled={busy}>Flush Redis</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <button onClick={async () => {
          if (!logOut) return alert('Logout not available');
          if (!confirm('Log out?')) return;
          setBusyLogout(true);
          try {
            await logOut();
            // reload to reflect logged-out state
            window.location.reload();
          } catch (err: any) {
            alert('Logout failed: ' + (err?.message ?? String(err)));
          } finally {
            setBusyLogout(false);
          }
        }} disabled={busyLogout}>Logout</button>
      </div>
      <section>
        <ul>
          <li>
            <strong>Investment Allocation:</strong>{' '}
            {invest ? (
              <Link href={`/allocations/${invest.id}`}>{fmt.format(invest.total)}</Link>
            ) : (
              <span>—</span>
            )}
          </li>
          <li>
            <strong>Savings Allocation:</strong>{' '}
            {savings ? (
              <Link href={`/allocations/${savings.id}`}>{fmt.format(savings.total)}</Link>
            ) : (
              <span>—</span>
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}
