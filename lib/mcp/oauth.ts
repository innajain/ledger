import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// Lifetimes. Access tokens are short; refresh tokens are long-lived so a
// connected client keeps working without re-consent. Auth codes are single-use
// and expire fast (OAuth 2.1 recommends <= 10 min).
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000 // 1h
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90d

export const SUPPORTED_SCOPES = ['ledger'] as const
export const DEFAULT_SCOPE = 'ledger'

/** A high-entropy URL-safe random string for codes/tokens/client ids. */
export function random_token(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** sha256 → hex. Codes/tokens are high-entropy, so a fast hash is appropriate. */
export function hash_token(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** PKCE S256: BASE64URL(SHA256(verifier)) must equal the stored challenge. */
export function verify_pkce(code_verifier: string, code_challenge: string): boolean {
  const computed = createHash('sha256').update(code_verifier).digest('base64url')
  const a = Buffer.from(computed)
  const b = Buffer.from(code_challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Clients (Dynamic Client Registration)
// ---------------------------------------------------------------------------

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

/** Confidential clients must present a matching secret; public (PKCE) clients don't. */
export async function verify_client_secret(client_id: string, secret: string | null): Promise<boolean> {
  const client = await get_client(client_id)
  if (!client) return false
  if (!client.client_secret) return true // public client — PKCE is the proof
  if (!secret) return false
  return bcrypt.compare(secret, client.client_secret)
}

// ---------------------------------------------------------------------------
// Authorization codes
// ---------------------------------------------------------------------------

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

/**
 * Single-use redemption of an auth code. Marks it used inside the same query so
 * a replayed code can't mint a second token. Returns the row, or null if the
 * code is unknown / already used / expired.
 */
export async function consume_auth_code(code: string) {
  const code_hash = hash_token(code)
  const row = await prisma.mcp_oauth_code.findUnique({ where: { code_hash } })
  if (!row || row.used || row.expires_at.getTime() < Date.now()) return null
  // Atomic flip: updateMany on the not-yet-used row; 0 affected ⇒ lost the race.
  const flipped = await prisma.mcp_oauth_code.updateMany({ where: { code_hash, used: false }, data: { used: true } })
  if (flipped.count === 0) return null
  return row
}

// ---------------------------------------------------------------------------
// Access / refresh tokens
// ---------------------------------------------------------------------------

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

/** Rotate a refresh token: revoke the old access-token row, issue a fresh pair. */
export async function rotate_refresh_token(client_id: string, refresh_token: string): Promise<IssuedTokens | null> {
  const row = await prisma.mcp_access_token.findUnique({ where: { refresh_token_hash: hash_token(refresh_token) } })
  if (!row || row.revoked || row.client_id !== client_id) return null
  if (row.refresh_expires_at && row.refresh_expires_at.getTime() < Date.now()) return null
  await prisma.mcp_access_token.update({ where: { id: row.id }, data: { revoked: true } })
  return issue_tokens({ client_id, user_id: row.user_id, scope: row.scope ?? DEFAULT_SCOPE })
}

/**
 * Resolve a bearer access token to its owner. Returns null when unknown,
 * revoked, or expired. Touches last_used_at (best-effort) for visibility.
 */
export async function resolve_access_token(access_token: string): Promise<{ user_id: string; client_id: string; scope: string } | null> {
  const row = await prisma.mcp_access_token.findUnique({ where: { token_hash: hash_token(access_token) } })
  if (!row || row.revoked || row.expires_at.getTime() < Date.now()) return null
  void prisma.mcp_access_token.update({ where: { id: row.id }, data: { last_used_at: new Date() } }).catch(() => {})
  return { user_id: row.user_id, client_id: row.client_id, scope: row.scope ?? DEFAULT_SCOPE }
}
