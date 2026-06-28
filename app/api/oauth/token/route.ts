// OAuth 2.1 token endpoint. Exchanges an authorization code (with PKCE proof)
// for an access + refresh token, and rotates refresh tokens. Returns errors in
// the RFC 6749 §5.2 shape so MCP clients can react.
import { consume_auth_code, issue_tokens, rotate_refresh_token, verify_client_secret, verify_pkce } from '@/lib/mcp/oauth'
import { logger } from '@/lib/logger'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function oauth_error(error: string, description?: string, status = 400) {
  return Response.json({ error, ...(description ? { error_description: description } : {}) }, { status, headers: CORS })
}

function token_response(t: { access_token: string; refresh_token: string; expires_in: number; scope: string }) {
  return Response.json(
    { access_token: t.access_token, token_type: 'Bearer', expires_in: t.expires_in, refresh_token: t.refresh_token, scope: t.scope },
    { headers: { ...CORS, 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
  )
}

/** Read params from a form-encoded or JSON body, plus client creds from Basic auth. */
async function read_params(req: Request): Promise<{ params: URLSearchParams; basic?: { id: string; secret: string } }> {
  const params = new URLSearchParams()
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({}))
    for (const [k, v] of Object.entries(body ?? {})) if (typeof v === 'string') params.set(k, v)
  } else {
    const form = await req.formData()
    for (const [k, v] of form.entries()) if (typeof v === 'string') params.set(k, v)
  }
  let basic: { id: string; secret: string } | undefined
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')
    if (id) basic = { id, secret: secret ?? '' }
  }
  return { params, basic }
}

export async function POST(req: Request) {
  try {
    const { params, basic } = await read_params(req)
    const grant_type = params.get('grant_type')
    const client_id = basic?.id ?? params.get('client_id') ?? ''
    const client_secret = basic?.secret ?? params.get('client_secret') ?? null
    if (!client_id) return oauth_error('invalid_client', 'client_id required', 401)
    if (!(await verify_client_secret(client_id, client_secret))) return oauth_error('invalid_client', 'client authentication failed', 401)

    if (grant_type === 'authorization_code') {
      const code = params.get('code')
      const redirect_uri = params.get('redirect_uri')
      const code_verifier = params.get('code_verifier')
      if (!code || !redirect_uri || !code_verifier) return oauth_error('invalid_request', 'code, redirect_uri and code_verifier required')

      const row = await consume_auth_code(code)
      if (!row) return oauth_error('invalid_grant', 'code is invalid, expired or already used')
      if (row.client_id !== client_id) return oauth_error('invalid_grant', 'code was issued to a different client')
      if (row.redirect_uri !== redirect_uri) return oauth_error('invalid_grant', 'redirect_uri mismatch')
      if (!verify_pkce(code_verifier, row.code_challenge)) return oauth_error('invalid_grant', 'PKCE verification failed')

      return token_response(await issue_tokens({ client_id, user_id: row.user_id, scope: row.scope ?? 'ledger' }))
    }

    if (grant_type === 'refresh_token') {
      const refresh_token = params.get('refresh_token')
      if (!refresh_token) return oauth_error('invalid_request', 'refresh_token required')
      const rotated = await rotate_refresh_token(client_id, refresh_token)
      if (!rotated) return oauth_error('invalid_grant', 'refresh_token is invalid or expired')
      return token_response(rotated)
    }

    return oauth_error('unsupported_grant_type', `grant_type "${grant_type}" not supported`)
  } catch (error) {
    logger.error({ err: error, action: 'oauth_token' }, 'Token endpoint failed')
    return oauth_error('server_error', undefined, 500)
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
