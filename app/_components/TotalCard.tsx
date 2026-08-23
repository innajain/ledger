type TotalCardProps = {
  title: string
  total: string
  colorScheme: 'purple' | 'green' | 'orange' | 'blue'
  icon: React.ReactNode
}

// The hue survives only in the small icon tile — the number itself sits on a quiet
// card in plain ink, like every other figure in the app.
const ICON_BG = {
  purple: 'bg-purple-600 dark:bg-purple-500',
  green: 'bg-green-600 dark:bg-green-500',
  orange: 'bg-orange-600 dark:bg-orange-500',
  blue: 'bg-blue-600 dark:bg-blue-500',
}

export function TotalCard({ title, total, colorScheme, icon }: TotalCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</h2>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-slate-100 truncate">{total}</p>
        </div>
        <div className={`w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 ${ICON_BG[colorScheme]} rounded-lg flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
