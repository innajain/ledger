import Link from 'next/link'

type PageHeaderProps = {
  title: string
  description: string
  // Optional — omit (e.g. for non-admins on global resources) to hide the button.
  createUrl?: string
  createLabel?: string
}

export function PageHeader({ title, description, createUrl, createLabel }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-slide-in-up">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">{description}</p>
      </div>
      {createUrl && (
        <Link
          href={createUrl}
          className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all font-medium shadow-sm text-center sm:whitespace-nowrap ripple hover-lift"
        >
          {createLabel}
        </Link>
      )}
    </div>
  )
}
