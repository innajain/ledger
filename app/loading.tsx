export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-24 sm:w-32 bg-sunken rounded animate-pulse mx-auto" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-paper rounded-lg border border-rule p-4 sm:p-6 space-y-3 animate-pulse">
            <div className="h-5 w-24 sm:w-32 bg-sunken rounded" />
            <div className="h-8 w-20 sm:w-24 bg-sunken rounded" />
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-4 mt-8">
        <div className="h-10 w-24 sm:w-32 bg-sunken rounded animate-pulse" />
        <div className="h-10 w-24 sm:w-32 bg-sunken rounded animate-pulse" />
      </div>
    </div>
  )
}
