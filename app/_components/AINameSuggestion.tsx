'use client';

import { useState } from 'react';
import { suggest_account_name, suggest_asset_name } from '@/app/_actions/ai_suggestions';

type SuggestionProps = {
  type: 'account' | 'asset';
  accountType?: 'real' | 'nominal' | 'allocation';
  assetType?: 'rupees' | 'mf' | 'etf' | 'shares' | 'other';
  onSelect: (name: string, parent?: string, ticker?: string) => void;
  placeholder?: string;
};

export default function AINameSuggestion({ type, accountType, assetType, onSelect, placeholder }: SuggestionProps) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<string>('');
  const [parentSuggestion, setParentSuggestion] = useState<string | null>(null);
  const [tickerSuggestion, setTickerSuggestion] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleGetSuggestions = async () => {
    if (!description.trim()) return;

    setLoading(true);
    setSuggestions([]);

    try {
      let result;
      if (type === 'account' && accountType) {
        result = await suggest_account_name(description, accountType);
      } else if (type === 'asset' && assetType) {
        result = await suggest_asset_name(description, assetType);
      } else {
        return;
      }

      if (result.success && result.data) {
        setSuggestions(result.data.suggestions || []);
        setRecommended(result.data.recommended || '');
        setParentSuggestion(result.data.parentSuggestion || null);
        setTickerSuggestion(result.data.tickerSuggestion || null);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Suggestion Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (name: string) => {
    onSelect(name, parentSuggestion || undefined, tickerSuggestion || undefined);
    setShowSuggestions(false);
    setDescription('');
  };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
        <div className="flex items-start gap-2 mb-2">
          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-purple-900 dark:text-purple-100">AI Name Suggestions</p>
            <p className="text-xs text-purple-700 dark:text-purple-300">Describe what you want to create and get AI-powered name suggestions</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGetSuggestions()}
            placeholder={placeholder || `e.g., "my bank account for daily expenses"`}
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            disabled={loading}
          />
          <button
            onClick={handleGetSuggestions}
            disabled={loading || !description.trim()}
            className="px-4 py-2 text-sm bg-purple-600 dark:bg-purple-500 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              '✨ Suggest'
            )}
          </button>
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="space-y-2 animate-slide-in-up">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Suggestions:</p>
          <div className="space-y-2">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(suggestion)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                  suggestion === recommended
                    ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-100 font-medium'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:border-purple-300 dark:hover:border-purple-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm">{suggestion}</span>
                  {suggestion === recommended && (
                    <span className="text-xs bg-purple-600 dark:bg-purple-500 text-white px-2 py-0.5 rounded-full">Recommended</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {(parentSuggestion || tickerSuggestion) && (
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 mt-2">
              {parentSuggestion && <p>💡 Suggested parent: {parentSuggestion}</p>}
              {tickerSuggestion && <p>💡 Suggested ticker: {tickerSuggestion}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
