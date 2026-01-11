'use client';

import { ViewPageHeader, InfoCard, EmptyState, LineItemRow } from '@/app/_components/ViewPageComponents';
import Link from 'next/link';
import { asset_type } from '@/generated/prisma/enums';
import { currency_fmt } from '@/app/_utils/currency formatter';

type LineItem = {
  id: string;
  asset_id?: string;
  asset_name: string;
  quantity: number;
  book_value: number | null;
  current_value: number;
  transaction_id: string;
  transaction_date: string;
  transaction_description: string | null;
  line_item_description: string | null;
  asset_type: asset_type;
};

type AllocationForClient = {
  id: string;
  name: string;
  type: string;
  parent: { id: string; name: string } | null;
  total: number;
  breakdown: { asset_id: string; asset_name: string; asset_type: asset_type; quantity: number; book_value: number | null; current_value: number }[];
  line_items: LineItem[];
};

export default function ClientPage({
  allocation,
}: {
  allocation: AllocationForClient;
}) {
  return (
    <div className="space-y-6">
      <ViewPageHeader
        backLink="/allocations"
        backText="Back to Allocations"
        title={allocation.name}
        description="Allocation details and holdings"
        editLink={`/allocations/${allocation.id}/update`}
        editText="Edit Allocation"
      />

      <InfoCard
        title="Allocation Information"
        fields={[
          { label: 'Allocation Type', value: <span className="capitalize">{allocation.type}</span> },
          { label: 'Parent Allocation', value: allocation.parent ? allocation.parent.name : '—' },
          { label: 'Total Value', value: <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{currency_fmt.format(allocation.total)}</p> },
        ]}
      />

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Holdings (aggregated by asset)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {allocation.breakdown.length} asset
            {allocation.breakdown.length !== 1 ? 's' : ''}
          </p>
        </div>

        {allocation.breakdown.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
              {allocation.breakdown
                .map((b, i) => (
                  <div key={i} className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600 shadow-sm transition-colors">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Link href={`/assets/${b.asset_id}`} className="text-slate-900 dark:text-slate-100 font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          {b.asset_name}
                        </Link>

                        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                          {b.asset_type === asset_type.rupees ? (
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Value:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(b.current_value)}</span>
                            </div>
                          ) : (
                            <>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Quantity:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{b.quantity} units</span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Book:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{b.book_value === null ? '—' : currency_fmt.format(b.book_value)}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Current:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(b.current_value)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 text-right">
                        <Link href={`/assets/${b.asset_id}`} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                          View Asset →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Line items section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Holdings</h2>
          <p className="text-sm text-slate-500 mt-1">
            {allocation.line_items.length} item{allocation.line_items.length !== 1 ? 's' : ''}
          </p>
        </div>

        {allocation.line_items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
            {allocation.line_items.map(li => (
              <LineItemRow
                key={li.id}
                assetName={li.asset_name}
                assetLink={li.asset_id ? `/assets/${li.asset_id}` : undefined}
                quantity={li.quantity}
                bookValue={li.book_value}
                currentValue={li.current_value}
                transactionId={li.transaction_id}
                transactionDate={li.transaction_date}
                transactionDescription={li.transaction_description}
                lineItemDescription={li.line_item_description}
                assetType={li.asset_type}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
