export default function Loading() {
  return (
    <div className="min-h-[400px] flex items-center justify-center px-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 sm:p-8 w-full max-w-md space-y-6 animate-pulse">
        <div className="h-8 w-24 sm:w-32 bg-slate-200 dark:bg-slate-700 rounded mx-auto" />

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-16 sm:w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>

          <div className="space-y-2">
            <div className="h-4 w-16 sm:w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>

          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>
    </div>
  )
}
