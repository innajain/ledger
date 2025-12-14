'use client';

import { ViewPageHeader, InfoCard, EmptyState, LineItemRow } from '@/app/_components/ViewPageComponents';
import Link from 'next/link';
import { asset_type } from '@/generated/prisma/enums';
import { currency_fmt } from '@/app/_utils/currency formatter';

type LineItem = {
  id: string;
  asset_id: string;
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

type AccountForClient = {
  id: string;
  name: string;
  type: string;
  parent: { id: string; name: string } | null;
  total: number;
  breakdown: {
    asset_id: string;
    asset_name: string;
    quantity: number;
    book_value: number | null;
    current_value: number;
    asset_type: asset_type;
  }[];
  line_items: LineItem[];
};

export default function ClientPage({ account, currencyLocale, currency }: { account: AccountForClient; currencyLocale: string; currency: string }) {
  return (
    <div className="space-y-6">
      <ViewPageHeader
        backLink="/accounts"
        backText="Back to Accounts"
        title={account.name}
        description="Account details and holdings"
        editLink={`/accounts/${account.id}/update`}
        editText="Edit Account"
      />

      <InfoCard
        title="Account Information"
        fields={[
          { label: 'Account Type', value: <span className="capitalize">{account.type}</span> },
          { label: 'Parent Account', value: account.parent ? account.parent.name : '—' },
          { label: 'Total Value', value: <p className="text-2xl font-bold text-slate-900">{currency_fmt.format(account.total)}</p> },
        ]}
      />

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Holdings (aggregated by asset)</h2>
          <p className="text-sm text-slate-500 mt-1">
            {account.breakdown.filter(b => b.quantity !== 0).length} asset{account.breakdown.filter(b => b.quantity !== 0).length !== 1 ? 's' : ''}
          </p>
        </div>

        {account.breakdown.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
              {account.breakdown
                .filter(x => x.quantity !== 0)
                .map((b, i) => (
                  <div key={i} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Link href={`/assets/${b.asset_id}`} className="text-slate-900 font-semibold hover:text-blue-600 transition-colors">
                          {b.asset_name}
                        </Link>

                        <div className="mt-3 text-sm text-slate-600 space-y-2">
                          {b.asset_type === asset_type.rupees ? (
                            <div>
                              <span className="text-slate-500">Value:</span>{' '}
                              <span className="font-medium text-slate-900">{currency_fmt.format(b.current_value)}</span>
                            </div>
                          ) : (
                            <>
                              <div>
                                <span className="text-slate-500">Quantity:</span>{' '}
                                <span className="font-medium text-slate-900">{b.quantity} units</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Book:</span>{' '}
                                <span className="font-medium text-slate-900">{b.book_value === null ? '—' : currency_fmt.format(b.book_value)}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Current:</span>{' '}
                                <span className="font-medium text-slate-900">{currency_fmt.format(b.current_value)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 text-right">
                        <Link href={`/assets/${b.asset_id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
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
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Transaction Line Items</h2>
          <p className="text-sm text-slate-500 mt-1">
            {account.line_items.length} item{account.line_items.length !== 1 ? 's' : ''}
          </p>
        </div>

        {account.line_items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-200">
            {account.line_items.map(li => (
              <LineItemRow
                key={li.id}
                assetName={li.asset_name}
                assetLink={`/assets/${li.asset_id}`}
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
