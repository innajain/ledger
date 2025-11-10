'use client';

import { useState, useMemo } from 'react';
import { Search, Filter, X, Calendar, TrendingUp, TrendingDown, ArrowRightLeft, Repeat, ChevronDown, ArrowRight } from 'lucide-react';
import { Prisma } from '@/generated/prisma';
import Link from 'next/link';

type Transaction = Prisma.transactionGetPayload<{
  include: {
    income_txn: { include: { account: true; asset: true } };
    expense_txn: { include: { account: true; purpose_bucket: true; asset: true } };
    self_transfer_or_refundable_or_refund_txn: { include: { from_account: true; to_account: true; asset: true } };
    asset_trade_txn: { include: { credit_account: true; credit_asset: true; debit_account: true; debit_asset: true } };
  };
}>;

export default function ClientPage({ transactions }: { transactions: Transaction[] }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [textQuery, setTextQuery] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;

      if (fromDate && tx.date) {
        const txd = tx.date;
        const fd = new Date(fromDate);
        if (txd < fd) return false;
      }
      if (toDate && tx.date) {
        const txd = tx.date;
        const td = new Date(toDate);
        td.setHours(23, 59, 59, 999);
        if (txd > td) return false;
      }

      let quantity = 0;
      if (tx.income_txn) quantity = tx.income_txn.quantity;
      else if (tx.expense_txn) quantity = tx.expense_txn.quantity;
      else if (tx.self_transfer_or_refundable_or_refund_txn) quantity = tx.self_transfer_or_refundable_or_refund_txn.quantity;
      else if (tx.asset_trade_txn) quantity = tx.asset_trade_txn.debit_quantity;

      if (amountMin && quantity < Number(amountMin)) return false;
      if (amountMax && quantity > Number(amountMax)) return false;

      if (textQuery) {
        const q = textQuery.toLowerCase();
        let searchText = tx.description || '';

        if (tx.income_txn) {
          searchText += ` ${tx.income_txn.asset.name} ${tx.income_txn.account.name}`;
        } else if (tx.expense_txn) {
          searchText += ` ${tx.expense_txn.asset.name} ${tx.expense_txn.account.name} ${tx.expense_txn.purpose_bucket.name}`;
        } else if (tx.self_transfer_or_refundable_or_refund_txn) {
          const t = tx.self_transfer_or_refundable_or_refund_txn;
          searchText += ` ${t.asset.name} ${t.from_account.name} ${t.to_account.name}`;
        } else if (tx.asset_trade_txn) {
          const t = tx.asset_trade_txn;
          searchText += ` ${t.debit_asset.name} ${t.credit_asset.name} ${t.debit_account.name} ${t.credit_account.name}`;
        }

        if (!searchText.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [transactions, typeFilter, fromDate, toDate, amountMin, amountMax, textQuery]);

  const types = ['income', 'expense', 'self_transfer', 'refundable', 'refund', 'asset_trade'];

  function clearFilters() {
    setTypeFilter('all');
    setFromDate('');
    setToDate('');
    setAmountMin('');
    setAmountMax('');
    setTextQuery('');
  }

  function formatDate(date: Date) {
    return date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatQuantity(quantity: number) {
    return quantity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const getTransactionDetails = (txn: Transaction) => {
    switch (txn.type) {
      case 'income':
        if (txn.income_txn) {
          return {
            type: 'Income',
            icon: <TrendingUp className="w-5 h-5" />,
            typeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            iconColor: 'text-emerald-600',
            account: txn.income_txn.account.name,
            asset: txn.income_txn.asset.name,
            quantity: `+${txn.income_txn.quantity}`,
            quantityColor: 'text-emerald-600',
            details: null,
          };
        }
        break;

      case 'expense':
        if (txn.expense_txn) {
          return {
            type: 'Expense',
            icon: <TrendingDown className="w-5 h-5" />,
            typeColor: 'bg-rose-50 text-rose-700 border-rose-200',
            iconColor: 'text-rose-600',
            account: txn.expense_txn.account.name,
            asset: txn.expense_txn.asset.name,
            quantity: `-${txn.expense_txn.quantity}`,
            quantityColor: 'text-rose-600',
            details: txn.expense_txn.purpose_bucket.name,
          };
        }
        break;

      case 'self_transfer':
      case 'refundable':
      case 'refund':
        if (txn.self_transfer_or_refundable_or_refund_txn) {
          const t = txn.self_transfer_or_refundable_or_refund_txn;
          return {
            type: txn.type === 'self_transfer' ? 'Transfer' : txn.type === 'refundable' ? 'Refundable' : 'Refund',
            icon: <ArrowRightLeft className="w-5 h-5" />,
            typeColor: 'bg-blue-50 text-blue-700 border-blue-200',
            iconColor: 'text-blue-600',
            // provide parts so we can render an icon between them instead of a unicode arrow
            accountParts: [t.from_account.name, t.to_account.name],
            asset: t.asset.name,
            quantity: String(t.quantity),
            quantityColor: 'text-gray-900',
            details: null,
          };
        }
        break;

      case 'asset_trade':
        if (txn.asset_trade_txn) {
          const t = txn.asset_trade_txn;
          return {
            type: 'Trade',
            icon: <Repeat className="w-5 h-5" />,
            typeColor: 'bg-purple-50 text-purple-700 border-purple-200',
            iconColor: 'text-purple-600',
            // keep parts so we can render ArrowRight between them
            accountParts: [t.debit_account.name, t.credit_account.name],
            assetParts: [t.debit_asset.name, t.credit_asset.name],
            quantityParts: [String(t.debit_quantity), String(t.credit_quantity)],
            quantityColor: 'text-gray-900',
            details: null,
          };
        }
        break;
    }

    return null;
  };

  const activeFiltersCount = [typeFilter !== 'all', fromDate, toDate, amountMin, amountMax, textQuery].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Transactions</h1>
          <p className="text-gray-600">Track and manage all your financial transactions</p>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search Input */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={textQuery}
                  onChange={e => setTextQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              {/* Filter Button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium"
              >
                <Filter className="w-5 h-5" />
                Filters
                {activeFiltersCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {/* New Transaction Button */}
              <Link href={"transactions/create"} className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-sm hover:shadow-md hover:from-blue-700 hover:to-indigo-700 transition font-medium">
                <span className="text-lg">+</span>
                New Transaction
              </Link>
            </div>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    {types.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Amount Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount Range</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Min"
                      value={amountMin}
                      onChange={e => setAmountMin(e.target.value)}
                      className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Max"
                      value={amountMax}
                      onChange={e => setAmountMax(e.target.value)}
                      className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Filter Actions */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{filteredTransactions.length}</span> of{' '}
                  <span className="font-semibold text-gray-900">{transactions.length}</span> transactions
                </div>
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
                >
                  <X className="w-4 h-4" />
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Transactions List */}
        <div className="space-y-3">
          {filteredTransactions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No transactions found</h3>
              <p className="text-gray-600">Try adjusting your filters or search query</p>
            </div>
          ) : (
            filteredTransactions.map(tx => {
              const details = getTransactionDetails(tx);
              if (!details) return null;

              return (
                <div
                  key={tx.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
                >
                  <Link href={`transactions/${tx.id}`} className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center ${details.typeColor}`}>
                      {details.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${details.typeColor}`}>
                              {details.type}
                            </span>
                            {tx.date && (
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(tx.date)}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate transition">
                            {tx.description || <span className="text-gray-400 font-normal">(No description)</span>}
                          </h3>
                        </div>

                        {/* Amount */}
                        <div className={`text-right shrink-0 text-xl font-bold ${details.quantityColor}`}>
                          {Array.isArray((details as any).assetParts) ? (
                            // For asset trades: show debit_quantity -> credit_quantity on top, and debit_asset -> credit_asset below
                            <div className="min-w-[8rem]">
                              <div>
                                {(details as any).quantityParts[0]} <ArrowRight className="inline-block w-4 h-4 mx-1 text-gray-400" /> {(details as any).quantityParts[1]}
                              </div>
                              <div className="text-sm font-medium text-gray-600 mt-1">
                                {(details as any).assetParts[0]} <ArrowRight className="inline-block w-3 h-3 mx-1 text-gray-400" /> {(details as any).assetParts[1]}
                              </div>
                            </div>
                          ) : (
                            // For single-asset transactions show quantity on top and asset below
                            <>
                              <div>{Array.isArray((details as any).quantityParts) ? (details as any).quantityParts[0] : (details as any).quantity}</div>
                              {(details as any).asset && (
                                <div className="text-sm font-medium text-gray-600 mt-1">{(details as any).asset}</div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                        {Array.isArray((details as any).accountParts) ? (
                          <span className="font-medium">
                            {(details as any).accountParts[0]} <ArrowRight className="inline-block w-3 h-3 mx-1 text-gray-400" />{' '}
                            {(details as any).accountParts[1]}
                          </span>
                        ) : (
                          <span className="font-medium">{(details as any).account}</span>
                        )}

                        {Array.isArray((details as any).assetParts) && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span>
                              {(details as any).assetParts[0]} <ArrowRight className="inline-block w-3 h-3 mx-1 text-gray-400" />{' '}
                              {(details as any).assetParts[1]}
                            </span>
                          </>
                        )}
                        {details.details && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="bg-gray-100 px-2 py-0.5 rounded-md text-xs font-medium">{details.details}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
