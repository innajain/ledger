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
