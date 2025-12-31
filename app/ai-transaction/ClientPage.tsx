'use client';

import { useState } from 'react';
import { parse_transaction_with_ai } from '@/app/_actions/ai_transaction';
import { confirm_and_create_transaction } from '@/app/_actions/confirm_transaction';
import { useRouter } from 'next/navigation';

type ParsedTransaction = {
  description?: string;
  date: string;
  line_items: {
    account_name: string;
    account_type: string;
    asset_name: string;
    asset_type?: string | null;
    quantity: number;
    book_value: number | null;
    description?: string | null;
  }[];
};

type UsageInfo = {
  patternCuration: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  transactionParsing: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  contextFromCache: boolean;
  fullContextSent: boolean;
};

export default function AITransactionClient() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [parsedTransaction, setParsedTransaction] = useState<ParsedTransaction | null>(null);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setResult(null);
    setUsageInfo(null);

    try {
      const response = await parse_transaction_with_ai(input);
      
      if (response.success && response.transaction) {
        setParsedTransaction(response.transaction);
        setUsageInfo(response.usage || null);
      } else {
        // Show error message
        setResult({
          success: false,
          message: response.message,
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsedTransaction) return;

    setConfirming(true);
    try {
      const confirmResult = await confirm_and_create_transaction(
        parsedTransaction.description ?? '',
        parsedTransaction.date,
        parsedTransaction.line_items
      );

      setResult(confirmResult);
      if (confirmResult.success) {
        setParsedTransaction(null);
        setInput('');
        router.refresh();
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create transaction',
      });
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = () => {
    setParsedTransaction(null);
    setUsageInfo(null);
    setResult(null);
    setInput('');
  };

  const examples = [
    'breakfast for 50rs using gpay',
    'uber ride 200 from wallet',
    'salary 50000 deposited to bank',
    'bought groceries for 1500 using credit card',
    'electricity bill 2000 from bank account',
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">AI Transaction Entry</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Describe your transaction in natural language and let AI create the ledger entries for you.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ai-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Transaction Description
            </label>
            <textarea
              id="ai-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g., breakfast for 50rs using gpay"
              className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 transition-colors resize-none"
              rows={3}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Parse with AI
              </>
            )}
          </button>
        </form>

        {usageInfo && parsedTransaction && !result && (
          <div className="mt-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">API Usage Statistics</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Context Status:</span>
                <span className={`font-medium px-2 py-1 rounded ${usageInfo.contextFromCache ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'}`}>
                  {usageInfo.contextFromCache ? '✓ From Cache' : '⟳ Fresh Load'}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Full Context Sent:</span>
                <span className={`font-medium px-2 py-1 rounded ${!usageInfo.fullContextSent ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'}`}>
                  {usageInfo.fullContextSent ? '📤 Yes (First/Changed)' : '⚡ No (Remembered)'}
                </span>
              </div>
              
              {usageInfo.patternCuration && (
                <div className="pt-2 border-t dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Pattern Curation:</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <div className="text-slate-500 dark:text-slate-400">Input</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{usageInfo.patternCuration.prompt_tokens.toLocaleString()}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <div className="text-slate-500 dark:text-slate-400">Output</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{usageInfo.patternCuration.completion_tokens.toLocaleString()}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <div className="text-slate-500 dark:text-slate-400">Total</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{usageInfo.patternCuration.total_tokens.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}
              
              {usageInfo.transactionParsing && (
                <div className="pt-2 border-t dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Transaction Parsing:</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <div className="text-slate-500 dark:text-slate-400">Input</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{usageInfo.transactionParsing.prompt_tokens.toLocaleString()}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <div className="text-slate-500 dark:text-slate-400">Output</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{usageInfo.transactionParsing.completion_tokens.toLocaleString()}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <div className="text-slate-500 dark:text-slate-400">Total</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{usageInfo.transactionParsing.total_tokens.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="pt-2 border-t dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>Grand Total:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {((usageInfo.patternCuration?.total_tokens || 0) + (usageInfo.transactionParsing?.total_tokens || 0)).toLocaleString()} tokens
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {parsedTransaction && !result && (
          <div className="mt-6 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Transaction Preview</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Please review the transaction before confirming:</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-blue-100 dark:border-blue-900 space-y-3">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Description</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{parsedTransaction.description}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Date & Time</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {new Date(parsedTransaction.date).toLocaleDateString()} {new Date(parsedTransaction.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="border-t dark:border-slate-700 pt-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Line Items:</p>
                <div className="space-y-2">
                  {parsedTransaction.line_items.map((item, idx) => {
                    const colorMap: Record<string, string> = {
                      real: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100',
                      allocation: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
                      nominal: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
                    };
                    const color = colorMap[item.account_type] || 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100';

                    return (
                      <div key={idx} className={`p-3 rounded border ${color} text-sm`}>
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <p className="font-medium">{item.account_name}</p>
                              <p className="text-xs opacity-75 mt-0.5">{item.asset_name}</p>
                              {item.asset_type && <p className="text-xs opacity-75">{item.asset_type}</p>}
                            </div>
                            <div className="text-right whitespace-nowrap">
                              <p className="font-semibold">{item.quantity}</p>
                              {item.book_value !== null && <p className="text-xs opacity-75">₹{item.book_value.toFixed(2)}</p>}
                            </div>
                          </div>
                          {item.description && (
                            <p className="text-xs opacity-75 border-t pt-2">
                              <span className="font-medium">Note:</span> {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {confirming ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Confirming...
                  </>
                ) : (
                  'Confirm Transaction'
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={confirming}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {result && (
          <div
            className={`mt-4 p-4 rounded-lg border ${
              result.success
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-start gap-2">
              {result.success ? (
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <div className="flex-1">
                <p className="font-medium">{result.success ? 'Success!' : 'Error'}</p>
                <p className="text-sm mt-1 whitespace-pre-line">{result.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Example Inputs</h3>
        <div className="space-y-2">
          {examples.map((example, idx) => (
            <button
              key={idx}
              onClick={() => setInput(example)}
              className="w-full text-left px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm text-slate-700 dark:text-slate-300"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
