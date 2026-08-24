import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { env, isDev } from '@/lib/env'

const PUBLIC_PATHS = [
  '/login',
  '/favicon.ico',
  '/logo-256.png',
  '/robots.txt',
  '/sitemap.xml',
  '/sw.js',
  '/manifest.webmanifest',

  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
]

const secret = new TextEncoder().encode(env.JWT_SECRET)

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/_next/') || pathname.startsWith('/public/') || pathname.startsWith('/api/cron/')) return true

  if (pathname === '/api/mcp' || pathname.startsWith('/api/oauth/')) return true
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

function buildCsp(nonce: string, formAction = `form-action 'self'`): string {
  const blobSrc = env.NEXT_PUBLIC_VERCEL_BLOB_API_URL
    ? new URL(env.NEXT_PUBLIC_VERCEL_BLOB_API_URL).origin
    : 'https://vercel.com https://*.blob.vercel-storage.com'

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
    formAction,
    `object-src 'none'`,
  ].join('; ')
}

function nextWithSecurity(requestHeaders: Headers, formAction?: string): NextResponse {
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce, formAction)

  // Only x-nonce goes on the request — the full CSP would be round-tripped through
  // x-middleware-override-headers with no downstream reader.
  requestHeaders.set('x-nonce', nonce)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export async function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname

  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-user-id')
  requestHeaders.delete('x-username')
  requestHeaders.delete('x-token-iat')

  if (isPublicPath(pathname)) {
    let formAction: string | undefined
    if (pathname === '/api/oauth/authorize') {
      let origin = ''
      try {
        const ru = new URL(request.url).searchParams.get('redirect_uri')
        if (ru) origin = new URL(ru).origin
      } catch {}
      formAction = `form-action 'self'${origin ? ` ${origin}` : ' https:'}`
    }
    return nextWithSecurity(requestHeaders, formAction)
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
