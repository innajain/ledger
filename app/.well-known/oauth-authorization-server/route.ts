// RFC 8414 — OAuth 2.0 Authorization Server Metadata. Advertises this app's
// authorize/token/registration endpoints so MCP clients (Claude, ChatGPT,
// Gemini) can run the authorization-code + PKCE flow against us.
import { getPublicOrigin, metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { SUPPORTED_SCOPES } from '@/lib/mcp/oauth'

export function GET(req: Request) {
  const origin = getPublicOrigin(req)
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: [...SUPPORTED_SCOPES],
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  )
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
