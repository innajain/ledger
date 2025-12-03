'use client';

import React from 'react';
import Link from 'next/link';
import { ViewPageHeader, InfoCard } from '@/app/_components/ViewPageComponents';
import { asset_type } from '@/generated/prisma/enums';

type BreakdownItem = {
  account_id: string;
  account_name: string;
  quantity: number;
  book_value: number | null;
  current_value: number;
};

type LineItem = {
  id: string;
  account_id: string;
  account_name: string;
  quantity: number;
  book_value: number | null;
  current_value: number;
  transaction_id: string;
  transaction_date: string;
  transaction_description: string | null;
  line_item_description: string | null;
};

type AssetForClient = {
  id: string;
  name: string;
  type: string;
  ticker: string | null;
  parent: { id: string; name: string } | null;
  total: number;
  breakdown: BreakdownItem[];
  line_items?: LineItem[];
};

export default function ClientPage({ asset, currencyLocale, currency }: { asset: AssetForClient; currencyLocale: string; currency: string }) {
  const currencyFmt = new Intl.NumberFormat(currencyLocale, { style: 'currency', currency, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <ViewPageHeader
        backLink="/assets"
        backText="Back to Assets"
        title={asset.name}
        description="Asset details and holdings breakdown"
        editLink={`/assets/${asset.id}/update`}
        editText="Edit Asset"
      />

      <InfoCard
        title="Asset Information"
        fields={[
          { label: 'Asset Type', value: <span className="capitalize">{asset.type}</span> },
          { label: 'Ticker', value: asset.ticker ?? '—' },
          { label: 'Parent Asset', value: asset.parent ? asset.parent.name : '—' },
        ]}
      />

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="mb-4">
          <p className="text-sm text-slate-500">Total Across Real Accounts</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{currencyFmt.format(asset.total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Holdings (aggregated by account)</h2>
          <p className="text-sm text-slate-500 mt-1">
            {asset.breakdown.length} account{asset.breakdown.length !== 1 ? 's' : ''}
          </p>
        </div>

        {asset.breakdown.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-slate-600 font-medium">No holdings yet</p>
            <p className="text-sm text-slate-500 mt-1">Holdings will appear here once transactions are recorded</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
                {asset.breakdown.map((b, i) => (
                  <div key={i} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Link href={`/accounts/${b.account_id}`} className="text-slate-900 font-semibold hover:text-blue-600 transition-colors">
                          {b.account_name}
                        </Link>

                        <div className="mt-3 text-sm text-slate-600 space-y-2">
                          {asset.type === asset_type.rupees ? (
                            <div>
                              <span className="text-slate-500">Value:</span>{' '}
                              <span className="font-medium text-slate-900">{currencyFmt.format(b.current_value)}</span>
                            </div>
                          ) : (
                            <>
                              <div>
                                <span className="text-slate-500">Quantity:</span>{' '}
                                <span className="font-medium text-slate-900">{b.quantity} units</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Book:</span>{' '}
                                <span className="font-medium text-slate-900">{b.book_value === null ? '—' : currencyFmt.format(b.book_value)}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Current:</span>{' '}
                                <span className="font-medium text-slate-900">{currencyFmt.format(b.current_value)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 text-right">
                        <Link href={`/accounts/${b.account_id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                          View Account →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Line Items (original per-transaction data) */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Transaction Line Items</h2>
          <p className="text-sm text-slate-500 mt-1">
            {(asset.line_items ?? []).length} item{(asset.line_items ?? []).length !== 1 ? 's' : ''}
          </p>
        </div>

        {(asset.line_items ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-500">No transactions for this asset</div>
        ) : (
          <div className="divide-y divide-slate-200">
            <div className="max-h-96 overflow-y-auto">
              {(asset.line_items ?? []).map((li, i) => (
                <div key={li.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Link href={`/accounts/${li.account_id}`} className="font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                          {li.account_name}
                        </Link>
                        <span>•</span>
                        <Link href={`/transactions/${li.transaction_id}`} className="text-xs text-slate-500 hover:text-blue-600">
                          {new Date(li.transaction_date).toLocaleString()}
                        </Link>
                      </div>

                      {li.line_item_description && <p className="text-sm text-slate-600 mt-1 italic">{li.line_item_description}</p>}
                      {li.transaction_description && <p className="text-xs text-slate-500 italic">Transaction: {li.transaction_description}</p>}

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {asset.type === asset_type.rupees ? (
                          <div className="text-slate-600">
                            <span className="font-medium text-slate-900">{currencyFmt.format(li.current_value)}</span>
                          </div>
                        ) : (
                          <>
                            <div className="text-slate-600">
                              <span className="text-slate-500">Quantity:</span>{' '}
                              <span className="font-medium text-slate-900">{li.quantity} units</span>
                            </div>
                            <div className="text-slate-600">
                              <span className="text-slate-500">Book:</span>{' '}
                              <span className="font-medium text-slate-900">{li.book_value === null ? '—' : currencyFmt.format(li.book_value)}</span>
                            </div>
                            <div className="text-slate-600">
                              <span className="text-slate-500">Current:</span>{' '}
                              <span className="font-medium text-slate-900">{currencyFmt.format(li.current_value)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-semibold text-slate-900">{currencyFmt.format(li.current_value)}</div>
                      <Link
                        href={`/transactions/${li.transaction_id}`}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1 inline-block"
                      >
                        View Transaction →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
