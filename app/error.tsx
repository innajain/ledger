'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-red-500 text-6xl">⚠️</div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Something went wrong!
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          {error.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-700 dark:hover:bg-slate-300 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
