import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { env } from '@/lib/env'

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

export async function proxy(request: NextRequest) {
  const pathname = new URL(request.url).pathname

  // Defense in depth: strip any client-supplied x-user-id before trusting it downstream.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-user-id')

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const token = request.cookies.get('ledger_token')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  const verified = await verifyToken(token)
  if (!verified) return NextResponse.redirect(new URL('/login', request.url))

  requestHeaders.set('x-user-id', verified.uid)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
