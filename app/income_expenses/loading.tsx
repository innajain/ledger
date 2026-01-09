export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="h-8 w-36 sm:w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-10 w-full sm:w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
      
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 animate-pulse">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded flex-shrink-0" />
                <div className="h-5 w-full max-w-[14rem] sm:max-w-sm bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="h-6 w-20 sm:w-32 bg-slate-200 dark:bg-slate-700 rounded flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
