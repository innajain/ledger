'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

type BaseItem = {
  id: string;
  name: string;
  parent_id: string | null;
};

type Node<T extends BaseItem> = {
  item: T;
  children: Node<T>[];
};

type HierarchyTreeProps<T extends BaseItem> = {
  items: T[];
  totals: Record<string, number>;
  formatCurrency: (amount: number) => string;
  getItemUrl: (id: string) => string;
  renderExtraInfo?: (item: T, node: Node<T>) => React.ReactNode;
  expandAll?: boolean;
};

export function HierarchyTree<T extends BaseItem>({
  items,
  totals,
  formatCurrency,
  getItemUrl,
  renderExtraInfo,
  expandAll,
}: HierarchyTreeProps<T>) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(expandAll ? items.reduce((acc, item) => ({ ...acc, [item.id]: true }), {}) : {});
  
  React.useEffect(() => {
    if (expandAll) {
      setExpanded(items.reduce((acc, item) => ({ ...acc, [item.id]: true }), {}));
    } else {
      setExpanded({});
    }
  }, [expandAll, items]);
  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Build tree structure - memoized to avoid rebuilding on every render
  const roots = useMemo(() => {
    const nodeById = new Map<string, Node<T>>();
    for (const item of items) {
      nodeById.set(item.id, { item, children: [] });
    }

    const rootNodes: Node<T>[] = [];
    for (const node of nodeById.values()) {
      const pid = node.item.parent_id;
      if (pid && nodeById.has(pid)) {
        nodeById.get(pid)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }
    return rootNodes;
  }, [items]);

  function aggregateCurr(n: Node<T>): number {
    const own = totals[n.item.id] || 0;
    return n.children.reduce((sum, c) => sum + aggregateCurr(c), own);
  }

  function renderNode(node: Node<T>, depth: number = 0): React.ReactElement {
    const item = node.item;
    const isExpanded = !!expanded[item.id];

    const ownCurr = totals[item.id] || 0;
    const displayCurr = aggregateCurr(node);

    return (
      <li key={item.id} className="mb-2">
        <div className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${depth === 0 ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700' : ''}`}>
          {node.children.length > 0 ? (
            <button
              onClick={() => toggle(item.id)}
              aria-expanded={isExpanded}
              className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
            >
              <svg className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-5 sm:w-6 flex-shrink-0"></span>
          )}

          <div className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <Link
                href={getItemUrl(item.id)}
                className="font-medium text-sm sm:text-base text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block"
              >
                {item.name}
              </Link>
              {renderExtraInfo && node.children.length === 0 && (
                <span className="ml-2 sm:ml-3">
                  {renderExtraInfo(item, node)}
                </span>
              )}
            </div>
            <div className="flex-shrink-0 text-right">
              <span className="font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                {formatCurrency(displayCurr)}
              </span>
            </div>
          </div>
        </div>

        {node.children.length > 0 && isExpanded && (
          <ul className="mt-2 ml-4 sm:ml-6 md:ml-9 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-2 sm:pl-3 md:pl-4">
            {/* pseudo-child showing non-aggregate "self" value */}
            <li key={`${item.id}-self`} className="mb-2">
              <div className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                <span className="w-5 sm:w-6 flex-shrink-0"></span>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs sm:text-sm italic text-slate-600 dark:text-slate-400">self</span>
                    {renderExtraInfo && (
                      <span className="ml-2 sm:ml-3">
                        {renderExtraInfo(item, node)}
                      </span>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                      {formatCurrency(ownCurr)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
            {node.children.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <ul className="space-y-2">
      {roots.map(r => renderNode(r, 0))}
    </ul>
  );
}