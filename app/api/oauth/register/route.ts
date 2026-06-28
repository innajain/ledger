// RFC 7591 — OAuth 2.0 Dynamic Client Registration. MCP clients self-register
// here (no pre-shared client id needed) and get back a client_id, plus a secret
// for confidential clients. Public clients (PKCE, auth method "none") get none.
import { z } from 'zod'
import { register_client, DEFAULT_SCOPE } from '@/lib/mcp/oauth'
import { logger } from '@/lib/logger'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

const schema = z.object({
  redirect_uris: z.array(z.string().url()).min(1, 'redirect_uris is required'),
  client_name: z.string().max(255).optional(),
  scope: z.string().max(255).optional(),
  token_endpoint_auth_method: z.enum(['none', 'client_secret_post', 'client_secret_basic']).default('none'),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'invalid_client_metadata', error_description: parsed.error.issues[0].message }, { status: 400, headers: CORS })
    }
    const { client_id, client_secret } = await register_client({
      redirect_uris: parsed.data.redirect_uris,
      client_name: parsed.data.client_name,
      scope: parsed.data.scope ?? DEFAULT_SCOPE,
      token_endpoint_auth_method: parsed.data.token_endpoint_auth_method,
    })
    return Response.json(
      {
        client_id,
        ...(client_secret ? { client_secret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: parsed.data.redirect_uris,
        token_endpoint_auth_method: parsed.data.token_endpoint_auth_method,
        grant_types: parsed.data.grant_types ?? ['authorization_code', 'refresh_token'],
        response_types: parsed.data.response_types ?? ['code'],
        client_name: parsed.data.client_name,
        scope: parsed.data.scope ?? DEFAULT_SCOPE,
      },
      { status: 201, headers: CORS },
    )
  } catch (error) {
    logger.error({ err: error, action: 'oauth_register' }, 'DCR failed')
    return Response.json({ error: 'server_error' }, { status: 500, headers: CORS })
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
