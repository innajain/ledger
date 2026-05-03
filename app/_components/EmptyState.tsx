import Link from 'next/link'
import { Card } from './Card'

type EmptyStateProps = {
  icon: React.ReactNode
  title: string
  description: string
  actionUrl: string
  actionLabel: string
}

export function EmptyState({ icon, title, description, actionUrl, actionLabel }: EmptyStateProps) {
  return (
    <Card className="p-12 text-center animate-bounce-in">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 transition-transform hover:scale-110 hover-wiggle animate-float">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">{title}</h3>
      <p className="text-slate-600 dark:text-slate-400 mb-6">{description}</p>
      <Link
        href={actionUrl}
        className="inline-flex items-center px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all font-medium ripple hover-lift fun-button sparkle-on-hover"
      >
        {actionLabel}
      </Link>
    </Card>
  )
}
