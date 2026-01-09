'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl key combinations
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'k':
            e.preventDefault();
            // Open search (placeholder for future implementation)
            break;
          case '/':
            e.preventDefault();
            setShowHelp(prev => !prev);
            break;
        }
      }
      
      // Alt key combinations for navigation
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        switch (e.key.toLowerCase()) {
          case 'h':
            router.push('/');
            break;
          case 'a':
            router.push('/accounts');
            break;
          case 's':
            router.push('/assets');
            break;
          case 't':
            router.push('/transactions');
            break;
          case 'l':
            router.push('/allocations');
            break;
          case 'i':
            router.push('/ai-transaction');
            break;
        }
      }

      // Escape key closes help
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [router, showHelp]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowHelp(false)}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Keyboard Shortcuts</h2>
          <button
            onClick={() => setShowHelp(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Show shortcuts</span>
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm font-mono">Cmd/Ctrl + /</kbd>
          </div>
          
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Navigation</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-sm">Home</span>
                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Alt + H</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-sm">Accounts</span>
                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Alt + A</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-sm">Assets</span>
                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Alt + S</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-sm">Transactions</span>
                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Alt + T</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-sm">Allocations</span>
                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Alt + L</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-sm">AI Transaction</span>
                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Alt + I</kbd>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">Press <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">Esc</kbd> to close</p>
        </div>
      </div>
    </div>
  );
}
