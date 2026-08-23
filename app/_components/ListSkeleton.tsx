type ListSkeletonProps = {
  itemCount?: number
  headerWidth?: string
  buttonWidth?: string
  variant?: 'hierarchy' | 'list' | 'grid'
}

export function ListSkeleton({
  itemCount = 5,
  headerWidth = 'w-24 sm:w-32',
  buttonWidth = 'w-full sm:w-40',
  variant = 'hierarchy',
}: ListSkeletonProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className={`h-8 ${headerWidth} skeleton rounded`} />
        <div className={`h-10 ${buttonWidth} skeleton rounded`} />
      </div>

      {variant === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: itemCount }, (_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <div className="h-5 w-2/3 skeleton rounded" />
              <div className="h-4 w-1/2 skeleton rounded" />
              <div className="h-6 w-3/4 skeleton rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: itemCount }, (_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {variant === 'hierarchy' && <div className="h-6 w-6 skeleton rounded shrink-0" />}
                  <div className="h-5 w-full max-w-48 sm:max-w-xs skeleton rounded" />
                </div>
                <div className="h-6 w-20 sm:w-32 skeleton rounded shrink-0" />
              </div>
              {variant === 'list' && (
                <>
                  <div className="h-4 w-full skeleton rounded mt-2" />
                  <div className="h-4 w-2/3 skeleton rounded mt-2" />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
