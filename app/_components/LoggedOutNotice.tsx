import Link from 'next/link'

/**
 * Styled fallback for server pages rendered without a user. The proxy normally redirects
 * unauthenticated visitors to /login before these render, so this is a belt-and-braces
 * surface — but when it does show, it should still look like the app.
 */
export function LoggedOutNotice({ title }: { title: string }) {
  return (
    <div className="max-w-md mx-auto mt-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-8 text-center">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-slate-600 dark:text-slate-400 mt-2">Log in to see this page.</p>
      <Link
        href="/login"
        className="inline-block mt-6 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium"
      >
        Log in
      </Link>
    </div>
  )
}
