import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { env } from '@/lib/env'

/**
 * Proxy.ts – follow Next.js Proxy API: export `proxy(request)`.
 * Verifies the JWT cookie and forwards the user id to downstream
 * server components / route handlers via a request-header rewrite.
 * Edge-compatible (jose, not jsonwebtoken).
 */
const PUBLIC_PATHS = ['/login', '/favicon.ico', '/robots.txt', '/sitemap.xml']

const secret = new TextEncoder().encode(env.JWT_SECRET)

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/_next/') || pathname.startsWith('/public/') || pathname.startsWith('/api/cron/')) return true
  return false
}

async function verifyToken(token: string): Promise<{ uid: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    if (typeof payload.uid !== 'string') return null
    return { uid: payload.uid }
  } catch {
    return null
  }
}

function applyBfcacheFriendlyHeaders(response: NextResponse, request: NextRequest) {
  // Mobile browsers (esp. iOS Safari) refuse bfcache for responses with `no-store`.
  // Next.js emits `no-store` for `force-dynamic` pages, which causes the tab to fully
  // reload when the user returns from another app. For HTML document navigations we
  // override Cache-Control to keep the page uncached over the network but eligible
  // for bfcache.
  if (request.headers.get('sec-fetch-dest') === 'document') {
    response.headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
  }
  return response
}

export async function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname

  // Defense in depth: strip any client-supplied x-user-id before trusting it downstream.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-user-id')

  if (isPublicPath(pathname)) {
    return applyBfcacheFriendlyHeaders(NextResponse.next({ request: { headers: requestHeaders } }), request)
  }

  const token = request.cookies.get('ledger_token')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  const verified = await verifyToken(token)
  if (!verified) return NextResponse.redirect(new URL('/login', request.url))

  requestHeaders.set('x-user-id', verified.uid)
  return applyBfcacheFriendlyHeaders(NextResponse.next({ request: { headers: requestHeaders } }), request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
