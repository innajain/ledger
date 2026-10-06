import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { random_token, hash_token } from '@/lib/mcp/tokens'

export const AUTH_CODE_TTL_MS = 5 * 60 * 1000
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

export const SUPPORTED_SCOPES = ['ledger'] as const
export const DEFAULT_SCOPE = 'ledger'

// Re-exported so existing callers keep importing these from oauth.
export { random_token, hash_token }

export function verify_pkce(code_verifier: string, code_challenge: string): boolean {
  const computed = createHash('sha256').update(code_verifier).digest('base64url')
  const a = Buffer.from(computed)
  const b = Buffer.from(code_challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function register_client(input: {
  redirect_uris: string[]
  client_name?: string | null
  scope?: string | null
  token_endpoint_auth_method: string
}): Promise<{ client_id: string; client_secret: string | null }> {
  const client_id = `mcp_${random_token(16)}`
  const isPublic = input.token_endpoint_auth_method === 'none'
  const client_secret = isPublic ? null : random_token(32)
  await prisma.mcp_oauth_client.create({
    data: {
      client_id,
      client_secret: client_secret ? await bcrypt.hash(client_secret, 10) : null,
      client_name: input.client_name ?? null,
      redirect_uris: input.redirect_uris,
      scope: input.scope ?? DEFAULT_SCOPE,
    },
  })
  return { client_id, client_secret }
}

export function get_client(client_id: string) {
  return prisma.mcp_oauth_client.findUnique({ where: { client_id } })
}

export async function verify_client_secret(client_id: string, secret: string | null): Promise<boolean> {
  const client = await get_client(client_id)
  if (!client) return false
  if (!client.client_secret) return true
  if (!secret) return false
  return bcrypt.compare(secret, client.client_secret)
}

export async function create_auth_code(input: {
  client_id: string
  user_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  scope: string
}): Promise<string> {
  const code = random_token(32)
  await prisma.mcp_oauth_code.create({
    data: {
      code_hash: hash_token(code),
      client_id: input.client_id,
      user_id: input.user_id,
      redirect_uri: input.redirect_uri,
      code_challenge: input.code_challenge,
      code_challenge_method: input.code_challenge_method,
      scope: input.scope,
      expires_at: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  })
  return code
}

export async function consume_auth_code(code: string) {
  const code_hash = hash_token(code)
  const row = await prisma.mcp_oauth_code.findUnique({ where: { code_hash } })
  if (!row || row.used || row.expires_at.getTime() < Date.now()) return null

  const flipped = await prisma.mcp_oauth_code.updateMany({ where: { code_hash, used: false }, data: { used: true } })
  if (flipped.count === 0) return null
  return row
}

export type IssuedTokens = { access_token: string; refresh_token: string; expires_in: number; scope: string }

export async function issue_tokens(input: { client_id: string; user_id: string; scope: string }): Promise<IssuedTokens> {
  const access_token = random_token(32)
  const refresh_token = random_token(32)
  await prisma.mcp_access_token.create({
    data: {
      token_hash: hash_token(access_token),
      refresh_token_hash: hash_token(refresh_token),
      client_id: input.client_id,
      user_id: input.user_id,
      scope: input.scope,
      expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      refresh_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  })
  return { access_token, refresh_token, expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000), scope: input.scope }
}

export type RefreshVerdict = 'ok' | 'invalid' | 'reused'

// A refresh token is single-use: rotation revokes it. Seeing a revoked one again
// means two parties hold it — the client and whoever copied it — and we can't tell
// which is which, so OAuth 2.1 (§4.3.1) says to kill every token in the grant.
// Wrong client or expired is just invalid: nothing suggests the token leaked.
export function classify_refresh(
  row: { revoked: boolean; client_id: string; refresh_expires_at: Date | null } | null,
  client_id: string,
  now: number,
): RefreshVerdict {
  if (!row || row.client_id !== client_id) return 'invalid'
  if (row.revoked) return 'reused'
  if (row.refresh_expires_at && row.refresh_expires_at.getTime() < now) return 'invalid'
  return 'ok'
}

async function revoke_grant(user_id: string, client_id: string): Promise<void> {
  const { count } = await prisma.mcp_access_token.updateMany({ where: { user_id, client_id, revoked: false }, data: { revoked: true } })
  logger.warn({ event: 'security.refresh_token_reuse', action: 'mcp.token_refresh', revoked_count: count }, 'MCP refresh token reused; grant revoked')
}

export async function rotate_refresh_token(client_id: string, refresh_token: string): Promise<IssuedTokens | null> {
  const row = await prisma.mcp_access_token.findUnique({ where: { refresh_token_hash: hash_token(refresh_token) } })
  const verdict = classify_refresh(row, client_id, Date.now())
  if (verdict === 'invalid' || !row) return null
  if (verdict === 'reused') {
    await revoke_grant(row.user_id, client_id)
    return null
  }
  // Claim atomically: of two concurrent refreshes with the same token only one may
  // win, and the loser is indistinguishable from a replay.
  const claimed = await prisma.mcp_access_token.updateMany({ where: { id: row.id, revoked: false }, data: { revoked: true } })
  if (claimed.count === 0) {
    await revoke_grant(row.user_id, client_id)
    return null
  }
  return issue_tokens({ client_id, user_id: row.user_id, scope: row.scope ?? DEFAULT_SCOPE })
}

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000

export async function resolve_access_token(access_token: string): Promise<{ user_id: string; client_id: string; scope: string } | null> {
  const row = await prisma.mcp_access_token.findUnique({ where: { token_hash: hash_token(access_token) } })
  if (!row || row.revoked || row.expires_at.getTime() < Date.now()) return null
  // last_used_at is a coarse display value, not an expiry input — throttle the
  // write so a busy agent session doesn't turn every read into row churn.
  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > LAST_USED_WRITE_INTERVAL_MS)
    void prisma.mcp_access_token
      .update({ where: { id: row.id }, data: { last_used_at: new Date() } })
      .catch(error => logger.warn({ err: error, event: 'operation.degraded', action: 'mcp.token_touch' }, 'failed to update MCP token usage'))
  return { user_id: row.user_id, client_id: row.client_id, scope: row.scope ?? DEFAULT_SCOPE }
}
