// The Vercel deployment has been retired: the ledger now runs on its own server, and this build
// only forwards visitors there so nobody keeps adding data to a database that is no longer the
// live one. It applies only when running on Vercel (the platform sets VERCEL=1), so the
// self-hosted deployment, which runs this same code, never redirects to itself.
//
// 308 keeps the method and body, and the path and query are carried over so old bookmarks and
// deep links land on the same page. Pure and dependency-free so it can be unit-tested; proxy.ts
// does the actual redirect, ahead of auth.
export const MOVED_TO = 'https://ledger.161-118-160-206.sslip.io'

export function moved_redirect_url(request_url: string, on_vercel: boolean, target: string = MOVED_TO): string | null {
  if (!on_vercel) return null
  const u = new URL(request_url)
  // Set path and query on the target URL rather than resolving them against it: resolving
  // "//evil.test/x" would treat it as protocol-relative and leave this host (an open redirect).
  const out = new URL(target)
  out.pathname = u.pathname
  out.search = u.search
  return out.toString()
}
