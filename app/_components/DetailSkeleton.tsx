export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-40 sm:w-56 skeleton rounded" />
          <div className="h-4 w-24 skeleton rounded" />
        </div>
        <div className="h-10 w-full sm:w-32 skeleton rounded" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
            <div className="h-3 w-20 skeleton rounded" />
            <div className="h-7 w-32 skeleton rounded" />
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="h-64 sm:h-80 skeleton rounded" />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="p-4 space-y-2">
            <div className="h-4 w-1/3 skeleton rounded" />
            <div className="h-3 w-1/4 skeleton rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
