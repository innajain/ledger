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
    asset_type?: string;
    quantity: number;
    book_value: number | null;
    description?: string | null;
  }[];
};

export default function AITransactionClient() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [parsedTransaction, setParsedTransaction] = useState<ParsedTransaction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await parse_transaction_with_ai(input);
      
      if (response.success && response.transaction) {
        setParsedTransaction(response.transaction);
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
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">AI Transaction Entry</h2>
        <p className="text-sm text-slate-600 mb-6">
          Describe your transaction in natural language and let AI create the ledger entries for you.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ai-input" className="block text-sm font-medium text-slate-700 mb-2">
              Transaction Description
            </label>
            <textarea
              id="ai-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g., breakfast for 50rs using gpay"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
              rows={3}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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

        {parsedTransaction && !result && (
          <div className="mt-6 p-4 rounded-lg border border-blue-200 bg-blue-50 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Transaction Preview</h3>
              <p className="text-sm text-slate-600 mb-4">Please review the transaction before confirming:</p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-100 space-y-3">
              <div>
                <p className="text-sm text-slate-500">Description</p>
                <p className="font-medium text-slate-900">{parsedTransaction.description}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Date & Time</p>
                <p className="font-medium text-slate-900">
                  {new Date(parsedTransaction.date).toLocaleDateString()} {new Date(parsedTransaction.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="border-t pt-3">
                <p className="text-sm font-medium text-slate-700 mb-3">Line Items:</p>
                <div className="space-y-2">
                  {parsedTransaction.line_items.map((item, idx) => {
                    const colorMap: Record<string, string> = {
                      real: 'bg-purple-50 border-purple-200 text-purple-900',
                      allocation: 'bg-blue-50 border-blue-200 text-blue-900',
                      nominal: 'bg-green-50 border-green-200 text-green-900',
                    };
                    const color = colorMap[item.account_type] || 'bg-slate-50 border-slate-200 text-slate-900';

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
                className="px-4 py-3 bg-slate-200 text-slate-900 rounded-lg font-medium hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Example Inputs</h3>
        <div className="space-y-2">
          {examples.map((example, idx) => (
            <button
              key={idx}
              onClick={() => setInput(example)}
              className="w-full text-left px-4 py-2 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-slate-700"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          How it works
        </h3>
        <ul className="space-y-2 text-sm text-blue-900">
          <li className="flex items-start gap-2">
            <span className="font-medium">•</span>
            <span>
              The AI analyzes your input and creates balanced ledger entries across real accounts (payment methods), allocation
              accounts (categories), and nominal accounts (income/expenses).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium">•</span>
            <span>It learns from your existing accounts and assets to make accurate suggestions.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium">•</span>
            <span>
              If required accounts or assets don't exist, it will notify you to create them first.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
