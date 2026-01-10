'use client';

import { useState } from 'react';
import { search_transactions_with_ai } from '@/app/_actions/ai_search';
import { useRouter } from 'next/navigation';

type SearchResult = {
  transactions: Array<{
    id: string;
    date: Date;
    description: string | null;
    line_items: Array<{
      account_name: string;
      asset_name: string;
      quantity: number;
      book_value: number | null;
    }>;
  }>;
  parsedParams: Record<string, unknown>;
};

export default function AITransactionSearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const [showResults, setShowResults] = useState(false);
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    setExplanation('');

    try {
      const response = await search_transactions_with_ai(query);
      
      if (response.success && response.data) {
        setResult(response.data);
        setExplanation(response.message);
        setShowResults(true);
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const examples = [
    'groceries last month',
    'transactions over ₹1000',
    'all bank transactions this year',
    'expenses in July',
    'salary deposits',
  ];

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-800 dark:to-slate-900 rounded-lg shadow-sm border border-indigo-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
          <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">AI-Powered Search</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Search transactions using natural language</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="space-y-3">
        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., 'groceries last month' or 'expenses over 1000'"
            className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-indigo-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors placeholder-slate-400 dark:placeholder-slate-500"
            disabled={loading}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex-1 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Searching...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Search
              </>
            )}
          </button>
          {showResults && (
            <button
              type="button"
              onClick={() => {
                setShowResults(false);
                setResult(null);
                setQuery('');
              }}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Example queries */}
        {!showResults && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400">Try:</span>
            {examples.map((example, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuery(example)}
                className="text-xs px-2 py-1 bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Explanation */}
      {explanation && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>Interpreted as:</strong> {explanation}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
        </div>
      )}

      {/* Results */}
      {showResults && result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Found {result.transactions.length} transaction{result.transactions.length !== 1 ? 's' : ''}
            </h4>
          </div>

          {result.transactions.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {result.transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors cursor-pointer"
                  onClick={() => router.push(`/transactions/${transaction.id}`)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                      {transaction.description || 'No description'}
                    </p>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(transaction.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {transaction.line_items.slice(0, 3).map((item, idx: number) => (
                      <div key={idx} className="text-xs text-slate-600 dark:text-slate-400 flex justify-between">
                        <span>{item.account_name} • {item.asset_name}</span>
                        <span className={item.quantity > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {item.quantity > 0 ? '+' : ''}{item.quantity}
                        </span>
                      </div>
                    ))}
                    {transaction.line_items.length > 3 && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                        +{transaction.line_items.length - 3} more items
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No transactions found matching your search</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
