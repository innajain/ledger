import Link from 'next/link'

/**
 * Styled fallback for server pages rendered without a user. The proxy normally redirects
 * unauthenticated visitors to /login before these render, so this is a belt-and-braces
 * surface — but when it does show, it should still look like the app.
 */
export function LoggedOutNotice({ title }: { title: string }) {
  return (
    <div className="max-w-md mx-auto mt-16 bg-paper border border-rule rounded-lg shadow-sm p-8 text-center">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="text-ink-2 mt-2">Log in to see this page.</p>
      <Link
        href="/login"
        className="inline-block mt-6 px-4 py-2 bg-accent text-on-accent rounded-lg hover:bg-accent-hover transition-colors font-medium"
      >
        Log in
      </Link>
    </div>
  )
}
