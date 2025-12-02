'use client';

import React from 'react';
import Link from 'next/link';
import { currency_fmt } from '../_utils/currency formatter';
import { PageHeader } from '../_components/PageHeader';
import { EmptyState } from '../_components/EmptyState';

export default function ClientPage({ transactions }: { transactions: { id: string; date: Date; description: string | null; total_book: number }[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="View and manage all your transactions"
        createUrl="/transactions/create"
        createLabel="+ New Transaction"
      />

      {transactions.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-900">All Transactions</h2>
          </div>
          <ul className="divide-y divide-slate-200">
            {transactions.map(tx => (
              <li key={tx.id} className="hover:bg-slate-50 transition-colors">
                <Link href={`/transactions/${tx.id}`} className="block px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{tx.description || 'No description'}</p>
                          <p className="text-sm text-slate-500">
                            {tx.date.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <span className={`text-lg font-semibold ${tx.total_book >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {currency_fmt.format(tx.total_book)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
          title="No transactions yet"
          description="Get started by creating your first transaction"
          actionUrl="/transactions/create"
          actionLabel="Create Transaction"
        />
      )}
    </div>
  );
}
