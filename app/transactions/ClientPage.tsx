'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { currency_fmt } from '../_utils/currency formatter';
import { PageHeader } from '../_components/PageHeader';
import { EmptyState } from '../_components/EmptyState';

type Transaction = { id: string; date: Date; description: string | null; total_book: number };

type Account = { id: string; name: string };
type Asset = { id: string; name: string };

export default function ClientPage({
  transactions,
  totalCount,
  currentPage,
  pageSize,
  searchParams,
  accounts,
  assets,
}: {
  transactions: Transaction[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
  accounts: Account[];
  assets: Asset[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.search || '');
  const [dateFrom, setDateFrom] = useState(searchParams.dateFrom || '');
  const [dateTo, setDateTo] = useState(searchParams.dateTo || '');
  const [minAmount, setMinAmount] = useState(searchParams.minAmount || '');
  const [maxAmount, setMaxAmount] = useState(searchParams.maxAmount || '');
  const [accountId, setAccountId] = useState(searchParams.accountId || '');
  const [assetId, setAssetId] = useState(searchParams.assetId || '');
  const [selectedPageSize] = useState(pageSize);

  const totalPages = Math.ceil(totalCount / pageSize);
  const isShowingAll = searchParams.pageSize === 'all';

  const changePageSize = (newSize: string) => {
    const query = new URLSearchParams(params.toString());
    query.set('pageSize', newSize);
    query.delete('page'); // Reset to page 1 when changing page size
    router.push(`/transactions?${query.toString()}`);
  };

  const applyFilters = () => {
    const query = new URLSearchParams();
    if (searchInput) query.set('search', searchInput);
    if (dateFrom) query.set('dateFrom', dateFrom);
    if (dateTo) query.set('dateTo', dateTo);
    if (minAmount) query.set('minAmount', minAmount);
    if (maxAmount) query.set('maxAmount', maxAmount);
    if (accountId) query.set('accountId', accountId);
    if (assetId) query.set('assetId', assetId);
    router.push(`/transactions?${query.toString()}`);
  };

  const clearFilters = () => {
    setSearchInput('');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setAccountId('');
    setAssetId('');
    router.push('/transactions');
  };

  const goToPage = (page: number) => {
    const query = new URLSearchParams(params.toString());
    query.set('page', page.toString());
    router.push(`/transactions?${query.toString()}`);
  };

  const hasFilters = searchParams.dateFrom || searchParams.dateTo || searchParams.minAmount || searchParams.maxAmount || searchParams.accountId || searchParams.assetId;

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="View and manage all your transactions" createUrl="/transactions/create" createLabel="+ New Transaction" />

      {/* Search and Filter Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 transition-colors">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={applyFilters}
              className="flex-1 md:flex-none px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all font-medium ripple hover-lift"
            >
              Search
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex-1 md:flex-none px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-medium hover-lift"
            >
              Filters {hasFilters && <span className="ml-1 text-blue-600 dark:text-blue-400">●</span>}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-in-up">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Min Amount</label>
              <input
                type="number"
                step="0.01"
                value={minAmount}
                onChange={e => setMinAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Amount</label>
              <input
                type="number"
                step="0.01"
                value={maxAmount}
                onChange={e => setMaxAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Account</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="">All Accounts</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Asset</label>
              <select
                value={assetId}
                onChange={e => setAssetId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="">All Assets</option>
                {assets.map(asset => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all hover:scale-105"
              >
                Clear All
              </button>
              <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all ripple hover-lift">
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {transactions.length > 0 ? (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">All Transactions</h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600 dark:text-slate-400">Show:</label>
                    <select
                      value={isShowingAll ? 'all' : selectedPageSize}
                      onChange={(e) => changePageSize(e.target.value)}
                      className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {isShowingAll ? `All ${totalCount}` : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
                  </span>
                </div>
              </div>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {transactions.map((tx, index) => (
                <li key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all stagger-item" style={{animationDelay: `${index * 0.03}s`}}>
                  <Link href={`/transactions/${tx.id}`} className="block px-6 py-4 group">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{tx.description || 'No description'}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
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
                        <span
                          className={`text-lg font-semibold transition-transform group-hover:scale-110 inline-block ${
                            tx.total_book > 0 ? 'text-green-600 dark:text-green-400' : tx.total_book < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {currency_fmt.format(tx.total_book)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Pagination */}
          {totalPages > 1 && !isShowingAll && (
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-4 transition-colors gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="hidden sm:inline">Previous</span>
                <span className="sm:hidden">Prev</span>
              </button>
              <div className="flex items-center gap-1 sm:gap-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-sm font-medium rounded-lg transition-colors min-w-[36px] ${
                        currentPage === pageNum
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
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
          title={hasFilters ? 'No matching transactions' : 'No transactions yet'}
          description={hasFilters ? 'Try adjusting your filters' : 'Get started by creating your first transaction'}
          actionUrl="/transactions/create"
          actionLabel="Create Transaction"
        />
      )}
    </div>
  );
}
