import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { env, isDev } from '@/lib/env'

// `/sw.js` and the manifest must be reachable without auth — the service worker
// registers from any page (incl. /login) and the browser fetches the manifest
// pre-auth; redirecting them to /login serves HTML and breaks both.
const PUBLIC_PATHS = ['/login', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/sw.js', '/manifest.webmanifest']

const secret = new TextEncoder().encode(env.JWT_SECRET)

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/_next/') || pathname.startsWith('/public/') || pathname.startsWith('/api/cron/')) return true
  return false
}

async function verifyToken(token: string): Promise<{ uid: string; username: string | null; iat: number | null } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    if (typeof payload.uid !== 'string') return null
    const username = typeof payload.username === 'string' ? payload.username : null
    const iat = typeof payload.iat === 'number' ? payload.iat : null
    return { uid: payload.uid, username, iat }
  } catch {
    return null
  }
}

// Content-Security-Policy. A per-request nonce authorizes our one inline script
// (the theme initializer in app/layout.tsx); 'strict-dynamic' lets Next's own
// scripts load via that nonce. Enforced (not report-only) — verified free of
// violations in prod. Switch back to 'Content-Security-Policy-Report-Only' when
// trialing new directives before enforcing them.
function buildCsp(nonce: string): string {
  // The Vercel Blob client SDK uploads/downloads attachments straight from the
  // browser, hitting the blob API + store host. In prod that's vercel.com plus
  // the *.blob.vercel-storage.com store; in dev it's the local emulator origin
  // (NEXT_PUBLIC_VERCEL_BLOB_API_URL, e.g. http://localhost:3100).
  const blobSrc = env.NEXT_PUBLIC_VERCEL_BLOB_API_URL
    ? new URL(env.NEXT_PUBLIC_VERCEL_BLOB_API_URL).origin
    : 'https://vercel.com https://*.blob.vercel-storage.com'
  // React/Turbopack dev mode needs eval() for debugging features (HMR, callstack
  // reconstruction). 'unsafe-eval' is dev-only — prod uses no eval, so the strict
  // policy stays there. ('strict-dynamic' ignores host/'unsafe-inline' but not
  // 'unsafe-eval', so eval is still authorized.)
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev() ? " 'unsafe-eval'" : ''}`
  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: ${blobSrc}`,
    `font-src 'self'`,
    `connect-src 'self' ${blobSrc}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ')
}

function nextWithSecurity(requestHeaders: Headers): NextResponse {
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)
  // x-nonce is read by the layout to nonce the inline script; forwarding the CSP
  // on the request lets Next attach the same nonce to its framework scripts.
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export async function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname

  // Defense in depth: strip any client-supplied x-user-id / x-username / x-token-iat
  // before trusting them downstream (x-token-iat gates session revocation).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-user-id')
  requestHeaders.delete('x-username')
  requestHeaders.delete('x-token-iat')

  if (isPublicPath(pathname)) {
    return nextWithSecurity(requestHeaders)
  }

  const token = request.cookies.get('ledger_token')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  const verified = await verifyToken(token)
  if (!verified) return NextResponse.redirect(new URL('/login', request.url))

  requestHeaders.set('x-user-id', verified.uid)
  if (verified.username) requestHeaders.set('x-username', verified.username)
  if (verified.iat != null) requestHeaders.set('x-token-iat', String(verified.iat))
  return nextWithSecurity(requestHeaders)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
