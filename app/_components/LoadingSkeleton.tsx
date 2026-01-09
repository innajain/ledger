export function LoadingSkeleton({ type = 'card' }: { type?: 'card' | 'list' | 'table' }) {
  if (type === 'card') {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="skeleton h-6 w-3/4 rounded"></div>
        <div className="skeleton h-4 w-full rounded"></div>
        <div className="skeleton h-4 w-5/6 rounded"></div>
        <div className="skeleton h-10 w-1/3 rounded"></div>
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
            <div className="skeleton h-12 w-12 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-1/3 rounded"></div>
              <div className="skeleton h-3 w-1/2 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="skeleton h-6 w-1/4 rounded"></div>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="p-4 flex gap-4">
              <div className="skeleton h-4 w-1/4 rounded"></div>
              <div className="skeleton h-4 w-1/4 rounded"></div>
              <div className="skeleton h-4 w-1/4 rounded"></div>
              <div className="skeleton h-4 w-1/4 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
