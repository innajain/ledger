import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

// Opaque-token primitives shared by every MCP credential (OAuth codes, access
// and refresh tokens, one-time attachment upload grants). Kept free of env and
// logger imports so the modules that only need hashing don't drag the whole
// server bootstrap — and stay unit-testable without a database.

export function random_token(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hash_token(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}
