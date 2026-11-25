import type { ReactNode } from 'react'
import { ButtonLink } from './Button'

type PageHeaderProps = {
  title: string
  description?: string

  createUrl?: string
  createLabel?: string
  /** Secondary actions, rendered to the left of the create button. */
  actions?: ReactNode
}

export function PageHeader({ title, description, createUrl, createLabel, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-3xl sm:text-4xl font-medium text-ink">{title}</h1>
        {description && <p className="text-ink-2 mt-1">{description}</p>}
      </div>
      {(actions || createUrl) && (
        <div className="flex items-center gap-2">
          {actions}
          {createUrl && (
            <ButtonLink href={createUrl} variant="primary" className="sm:whitespace-nowrap">
              {createLabel}
            </ButtonLink>
          )}
        </div>
      )}
    </div>
  )
}
