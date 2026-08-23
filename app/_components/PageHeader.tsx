import { ButtonLink } from './Button'

type PageHeaderProps = {
  title: string
  description?: string

  createUrl?: string
  createLabel?: string
}

export function PageHeader({ title, description, createUrl, createLabel }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {description && <p className="text-slate-600 dark:text-slate-400 mt-1">{description}</p>}
      </div>
      {createUrl && (
        <ButtonLink href={createUrl} variant="primary" className="sm:whitespace-nowrap">
          {createLabel}
        </ButtonLink>
      )}
    </div>
  )
}
