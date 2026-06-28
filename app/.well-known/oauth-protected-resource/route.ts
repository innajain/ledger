// RFC 9728 — OAuth 2.0 Protected Resource Metadata. Points MCP clients at this
// app as its own authorization server. Reached when /api/mcp answers 401 with a
// `WWW-Authenticate` header naming this URL.
import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { SUPPORTED_SCOPES } from '@/lib/mcp/oauth'

export function GET(req: Request) {
  const origin = getPublicOrigin(req)
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
    additionalMetadata: { scopes_supported: [...SUPPORTED_SCOPES] },
  })
  return Response.json(metadata, { headers: { 'Access-Control-Allow-Origin': '*' } })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
