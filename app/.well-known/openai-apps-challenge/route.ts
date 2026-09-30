import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

// Domain verification for the ChatGPT app directory: the submission portal issues a
// token and fetches it back from this path on the MCP host. It must be the bare
// token as text/plain — not JSON — so nothing wraps it. With no token configured the
// path 404s, like any other unknown URL.
export function GET() {
  const token = env.OPENAI_APPS_CHALLENGE_TOKEN
  if (!token) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return new Response(token, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
