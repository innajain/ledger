'use client';

import React, { JSX, useState } from 'react';
import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';

type Props = {
  allocations: (Prisma.accountGetPayload<{ include: { parent: true } }> & {
    line_items: (Omit<Prisma.line_itemGetPayload<{ include: { asset: true } }>, 'quantity' | 'book_value'> & {
      quantity: number;
      book_value: number | null;
    })[];
  })[];
  totals: Record<string, number>;
  grand_total: number;
};

export default function ClientPage({ allocations, totals, grand_total }: Props) {
  type Node = { item: (typeof allocations)[number]; children: Node[] };

  const nodeById = new Map<string, Node>();
  for (const a of allocations) nodeById.set(a.id, { item: a, children: [] });

  const roots: Node[] = [];
  for (const node of nodeById.values()) {
    const pid = node.item.parent_id;
    if (pid && nodeById.has(pid)) nodeById.get(pid)!.children.push(node);
    else roots.push(node);
  }

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const currencyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

  function aggregateCurr(n: Node): number {
    const own = totals[n.item.id];
    return n.children.reduce((sum, c) => sum + aggregateCurr(c), own);
  }

  function renderNode(node: Node): JSX.Element {
    const acc = node.item;
    const isExpanded = !!expanded[acc.id];

    // compute own and aggregate values
    const ownCurr = totals[acc.id];

    const displayCurr = aggregateCurr(node);

    return (
      <li key={acc.id} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {node.children.length > 0 ? (
            <button
              onClick={() => toggle(acc.id)}
              aria-expanded={isExpanded}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <div style={{ width: 8 }}>{isExpanded ? '▾' : '▸'}</div>
            </button>
          ) : (
            <div style={{ width: 8 }} />
          )}
          <div>
            <Link href={`/allocations/${acc.id}`} style={{ cursor: 'pointer', display: 'inline-block' }}>
              <strong>{acc.name}</strong>
            </Link>
            <span style={{ marginLeft: 8 }}>{currencyFmt.format(displayCurr)}</span>
          </div>
        </div>

        {node.children.length > 0 && isExpanded && (
          <ul style={{ marginLeft: 18 }}>
            {/* pseudo-child showing non-aggregate "self" value */}
            <li key={`${acc.id}-self`} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8 }} />
                <div style={{ fontStyle: 'italic' }}>
                  <em>self</em> <span style={{ marginLeft: 8 }}>{currencyFmt.format(ownCurr)}</span>
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
      <h2>Allocations</h2>
      <div style={{ marginBottom: 8 }}>
        <Link href="/allocations/create">Create new allocation</Link>
      </div>
      <div>Grand total: {currencyFmt.format(grand_total)}</div>
      <ul>{roots.map(r => renderNode(r))}</ul>
    </div>
  );
}
