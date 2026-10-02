import { ButtonLink } from './Button'

type NotFoundProps = {
  title?: string
  description?: string
  /** Where the way-out link goes — the list the missing thing would have lived in. */
  backHref?: string
  backLabel?: string
  /**
   * Show the "404" eyebrow. Only the root `not-found.tsx` passes it: that is the one place
   * the response really is a 404 — the entity pages render this card with a 200.
   */
  showStatus?: boolean
}

/**
 * The one "nothing here" view: the root `not-found.tsx` for unknown routes, and every
 * detail/edit page whose id doesn't resolve (deleted, another user's, or a stale link).
 * Pages pass the entity-specific title and the list to go back to.
 */
export function NotFound({
  title = 'Page not found',
  description = 'It may have been deleted, or the link is stale.',
  backHref = '/',
  backLabel = 'Go home',
  showStatus = false,
}: NotFoundProps) {
  return (
    <div className="max-w-md mx-auto mt-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-8 text-center">
      {showStatus && <p className="text-sm font-medium text-slate-500 dark:text-slate-400 tabular-nums mb-1">404</p>}
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-slate-600 dark:text-slate-400 mt-2">{description}</p>
      <ButtonLink href={backHref} variant="primary" className="mt-6">
        {backLabel}
      </ButtonLink>
    </div>
  )
}
