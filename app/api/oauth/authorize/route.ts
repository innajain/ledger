import { randomBytes } from 'node:crypto'
import { verify_token } from '@/app/_core/auth_core'
import { get_client, create_auth_code, DEFAULT_SCOPE } from '@/lib/mcp/oauth'
import { isProd } from '@/lib/env'
import { logger } from '@/lib/logger'

const CSRF_COOKIE = 'mcp_oauth_csrf'

function parse_cookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

async function current_user(req: Request): Promise<{ uid: string; username?: string } | null> {
  const token = parse_cookies(req.headers.get('cookie'))['ledger_token']
  if (!token) return null
  try {
    const { uid, username } = await verify_token(token)
    return { uid, username }
  } catch {
    return null
  }
}

function error_redirect(redirect_uri: string, error: string, state: string | null, description?: string) {
  const u = new URL(redirect_uri)
  u.searchParams.set('error', error)
  if (description) u.searchParams.set('error_description', description)
  if (state) u.searchParams.set('state', state)
  return Response.redirect(u.toString(), 302)
}

function bad_request(message: string) {
  return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } })
}

async function validate(params: URLSearchParams) {
  const client_id = params.get('client_id') ?? ''
  const redirect_uri = params.get('redirect_uri') ?? ''
  const response_type = params.get('response_type') ?? ''
  const code_challenge = params.get('code_challenge') ?? ''
  const code_challenge_method = params.get('code_challenge_method') ?? 'S256'
  const state = params.get('state')
  const scope = params.get('scope') || DEFAULT_SCOPE

  if (!client_id || !redirect_uri) return { error: bad_request('Missing client_id or redirect_uri') }
  const client = await get_client(client_id)
  if (!client) return { error: bad_request('Unknown client_id') }

  if (!client.redirect_uris.includes(redirect_uri)) return { error: bad_request('redirect_uri not registered for this client') }

  if (response_type !== 'code') return { error: error_redirect(redirect_uri, 'unsupported_response_type', state) }
  if (!code_challenge) return { error: error_redirect(redirect_uri, 'invalid_request', state, 'code_challenge required (PKCE)') }
  if (code_challenge_method !== 'S256') return { error: error_redirect(redirect_uri, 'invalid_request', state, 'only S256 supported') }

  return { client, redirect_uri, code_challenge, code_challenge_method, state, scope }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const v = await validate(url.searchParams)
  if ('error' in v) return v.error

  const user = await current_user(req)
  if (!user) {
    const next = encodeURIComponent(url.pathname + url.search)
    return Response.redirect(new URL(`/login?next=${next}`, url.origin).toString(), 302)
  }

  const csrf = randomBytes(16).toString('hex')
  const clientName = v.client.client_name || 'An application'
  const hidden = (name: string, value: string | null) => (value == null ? '' : `<input type="hidden" name="${name}" value="${escape_html(value)}">`)

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize ${escape_html(clientName)}</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:420px;width:100%;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px">
  <h1 style="font-size:18px;margin:0 0 8px">Connect to your ledger</h1>
  <p style="color:#94a3b8;font-size:14px;line-height:1.5;margin:0 0 16px">
    <strong style="color:#e2e8f0">${escape_html(clientName)}</strong> wants to access your ledger as
    <strong style="color:#e2e8f0">${escape_html(user.username ?? user.uid)}</strong>. It will be able to
    <strong style="color:#e2e8f0">read and modify</strong> your transactions, balances and reference data.
  </p>
  <form method="post" action="/api/oauth/authorize">
    ${hidden('client_id', url.searchParams.get('client_id'))}
    ${hidden('redirect_uri', v.redirect_uri)}
    ${hidden('response_type', 'code')}
    ${hidden('code_challenge', v.code_challenge)}
    ${hidden('code_challenge_method', v.code_challenge_method)}
    ${hidden('state', v.state)}
    ${hidden('scope', v.scope)}
    ${hidden('csrf', csrf)}
    <div style="display:flex;gap:10px;margin-top:8px">
      <button type="submit" name="decision" value="deny" style="flex:1;padding:11px;border-radius:10px;border:1px solid #334155;background:transparent;color:#e2e8f0;font-size:14px;cursor:pointer">Cancel</button>
      <button type="submit" name="decision" value="approve" style="flex:1;padding:11px;border-radius:10px;border:0;background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Approve</button>
    </div>
  </form>
</div></body></html>`

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': `${CSRF_COOKIE}=${csrf}; Path=/api/oauth/authorize; HttpOnly; SameSite=Lax; Max-Age=600${isProd() ? '; Secure' : ''}`,
    },
  })
}

export async function POST(req: Request) {
  const form = await req.formData()
  const params = new URLSearchParams()
  for (const [k, val] of form.entries()) if (typeof val === 'string') params.set(k, val)

  const v = await validate(params)
  if ('error' in v) return v.error

  const user = await current_user(req)
  if (!user) return new Response('Session expired — please retry', { status: 401 })

  const cookieCsrf = parse_cookies(req.headers.get('cookie'))[CSRF_COOKIE]
  const formCsrf = params.get('csrf')
  if (!cookieCsrf || !formCsrf || cookieCsrf !== formCsrf) return new Response('Invalid CSRF token', { status: 403 })

  if (params.get('decision') !== 'approve') return error_redirect(v.redirect_uri, 'access_denied', v.state)

  try {
    const code = await create_auth_code({
      client_id: v.client.client_id,
      user_id: user.uid,
      redirect_uri: v.redirect_uri,
      code_challenge: v.code_challenge,
      code_challenge_method: v.code_challenge_method,
      scope: v.scope,
    })
    const u = new URL(v.redirect_uri)
    u.searchParams.set('code', code)
    if (v.state) u.searchParams.set('state', v.state)
    return Response.redirect(u.toString(), 302)
  } catch (error) {
    logger.error({ err: error, action: 'oauth_authorize' }, 'Failed to issue auth code')
    return error_redirect(v.redirect_uri, 'server_error', v.state)
  }
}

function escape_html(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
