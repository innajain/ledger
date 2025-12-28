export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-4 w-96 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-pulse">
        <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    </div>
  );
}
