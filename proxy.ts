import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

/**
 * Proxy.ts – follow Next.js Proxy API: export `proxy(request)`.
 * This performs a lightweight, fast check of the JWT cookie and, when
 * present and valid, sets an `x-user-id` response header for downstream
 * server components or edge handlers to observe.
 *
 * Note: Proxy is not intended for slow DB calls; keep logic minimal.
 */
const PUBLIC_PATHS = ['/login', '/favicon.ico', '/robots.txt', '/sitemap.xml']

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  // allow public assets under /public or next internals
  if (pathname.startsWith('/_next/') || pathname.startsWith('/public/')) return true
  return false
}

function verifyTokenCached(token: string): { uid: string } | null {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  try {
    const payload = jwt.verify(token, secret) as { uid: string; exp?: number }
    return { uid: payload.uid }
  } catch {
    return null
  }
}

export function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname

  // Fast short-circuit for public pages: don't even check cookies
  if (isPublicPath(pathname)) return NextResponse.next()

  const token = request.cookies.get('ledger_token')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  const verified = verifyTokenCached(token)
  if (!verified) return NextResponse.redirect(new URL('/login', request.url))

  const res = NextResponse.next()
  res.headers.set('x-user-id', verified.uid)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
