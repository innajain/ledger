import Link from 'next/link'
import { Card } from './Card'

type EmptyStateProps = {
  icon: React.ReactNode
  title: string
  description: string

  actionUrl?: string
  actionLabel?: string
  /** Render without the Card wrapper — for empty regions inside an existing card. */
  embedded?: boolean
}

/**
 * The one empty state. Page-level empties get the Card wrapper; sections inside a card
 * pass `embedded`. The description is the teaching moment — say what the thing is and
 * what creating one does, not just that the list is empty.
 */
export function EmptyState({ icon, title, description, actionUrl, actionLabel, embedded = false }: EmptyStateProps) {
  const body = (
    <>
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">{title}</h3>
      <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">{description}</p>
      {actionUrl && (
        <Link
          href={actionUrl}
          className="inline-flex items-center px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium"
        >
          {actionLabel}
        </Link>
      )}
    </>
  )
  if (embedded) return <div className="p-8 text-center">{body}</div>
  return <Card className="p-12 text-center">{body}</Card>
}
