export default function Loading() {
  return (
    <div className="min-h-[400px] flex items-center justify-center px-4">
      <div className="bg-paper rounded-lg border border-rule p-6 sm:p-8 w-full max-w-md space-y-6 animate-pulse">
        <div className="h-8 w-24 sm:w-32 bg-sunken rounded mx-auto" />

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-16 sm:w-20 bg-sunken rounded" />
            <div className="h-10 bg-sunken rounded" />
          </div>

          <div className="space-y-2">
            <div className="h-4 w-16 sm:w-20 bg-sunken rounded" />
            <div className="h-10 bg-sunken rounded" />
          </div>

          <div className="h-10 bg-sunken rounded" />
        </div>
      </div>
    </div>
  )
}
