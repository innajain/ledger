export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
      
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-5 w-56 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
