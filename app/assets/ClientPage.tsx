'use client';

import { Prisma } from '@/generated/prisma/client';
import React, { useState } from 'react';
import Link from 'next/link';

// Lightweight shapes for client component
type LineItemNumbered = {
  id: string;
  transaction_id: string;
  account_id: string;
  asset_id: string;
  quantity: number;
  book_value: number | null;
  asset: { id: string; name: string };
};

type AssetNumbered = Prisma.assetGetPayload<{ include: { parent: true } }> & { line_items: LineItemNumbered[] };

type Props = {
  assets: AssetNumbered[];
  totals: Record<string, number>;
  grand_total: number;
};

export default function ClientPage({ assets, totals, grand_total }: Props) {
  type Node = { item: AssetNumbered; children: Node[] };

  const nodeById = new Map<string, Node>();
  for (const a of assets) nodeById.set(a.id, { item: a, children: [] });

  const roots: Node[] = [];
  for (const node of nodeById.values()) {
    const pid = node.item.parent_id;
    if (pid && nodeById.has(pid)) nodeById.get(pid)!.children.push(node);
    else roots.push(node);
  }

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  function aggregateCurr(n: Node): number {
    const own = totals[n.item.id];
    return n.children.reduce((sum, c) => sum + aggregateCurr(c), own);
  }

  function renderNode(node: Node): React.ReactElement {
    const a = node.item;
    const isExpanded = !!expanded[a.id];

    const ownCurr = totals[a.id];

    // Always show aggregate (self + descendants) regardless of expanded state
    const displayCurr = aggregateCurr(node);

    const ownQty = a.line_items.reduce((s, li) => s + (li.quantity ?? 0), 0);
    const aggregateQty = (n: Node): number => {
      const own = n.item.line_items.reduce((s, li) => s + (li.quantity ?? 0), 0);
      return n.children.reduce((sum, c) => sum + aggregateQty(c), own);
    };
    // Always show aggregate quantity as well
    const displayQty = aggregateQty(node);

    // formatters
    const currencyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
    const qtyFmt = (n: number) => n.toFixed(2);

    return (
      <li key={a.id} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {node.children.length > 0 ? (
            <button onClick={() => toggle(a.id)} aria-expanded={isExpanded} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span style={{ opacity: 0 }}>▸</span>
          )}

          <div>
            <Link href={`/assets/${a.id}`} style={{ cursor: 'pointer', display: 'inline-block' }}>
              <strong>{a.name}</strong>
            </Link>
            {node.children.length === 0 && (a.is_base_currency ? null : <span style={{ marginLeft: 8 }}>{qtyFmt(displayQty)} units</span>) }
            <span style={{ marginLeft: 8 }}>{currencyFmt.format(displayCurr)}</span>
          </div>
        </div>

        {node.children.length > 0 && isExpanded && (
          <ul style={{ marginLeft: 18 }}>
            {/* pseudo-child showing non-aggregate "self" values (italicized) */}
            <li key={`${a.id}-self`} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ opacity: 0 }}>▸</span>
                <div style={{ fontStyle: 'italic' }}>
                  <em>self</em> {a.is_base_currency ? null : <span style={{ marginLeft: 8 }}>{qtyFmt(ownQty)} units</span>}
                  <span style={{ marginLeft: 8 }}>{currencyFmt.format(ownCurr)}</span>
                </div>
              </div>
            </li>
            {node.children.map(child => renderNode(child))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div>
      <h1>Assets</h1>
      <div style={{ marginBottom: 8 }}>
        <Link href="/assets/create">Create new asset</Link>
      </div>
      <h2>Total: {grand_total}</h2>
      <ul>{roots.map(r => renderNode(r))}</ul>
    </div>
  );
}
