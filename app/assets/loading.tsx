export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-10 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3 animate-pulse">
            <div className="h-5 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
