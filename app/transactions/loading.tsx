export default function Loading() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="h-8 w-32 sm:w-40 skeleton rounded" />
        <div className="h-10 w-full sm:w-48 skeleton rounded" />
      </div>
      
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2 stagger-item">
            <div className="flex items-center justify-between gap-3">
              <div className="h-5 w-full max-w-[12rem] sm:max-w-xs skeleton rounded" />
              <div className="h-4 w-16 sm:w-24 skeleton rounded flex-shrink-0" />
            </div>
            <div className="h-4 w-full skeleton rounded" />
            <div className="h-4 w-2/3 skeleton rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
