/**
 * Framework-agnostic auth primitives shared by the web server actions
 * (`app/_actions/auth.ts`) and the CLI (`cli/`). Nothing here touches
 * `next/headers` or cookies, so it runs in a plain Node process too.
 */
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'

export const JWT_EXPIRY_DAYS = 7
export const JWT_EXPIRY_SECONDS = JWT_EXPIRY_DAYS * 24 * 60 * 60

const secret_bytes = new TextEncoder().encode(env.JWT_SECRET)

export async function sign_token(payload: { uid: string; username: string }): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${JWT_EXPIRY_DAYS}d`).sign(secret_bytes)
}

export async function verify_token(token: string): Promise<{ uid: string; username?: string; iat?: number }> {
  const { payload } = await jwtVerify(token, secret_bytes, { algorithms: ['HS256'] })
  if (typeof payload.uid !== 'string') throw new Error('invalid token')
  const username = typeof payload.username === 'string' ? payload.username : undefined
  const iat = typeof payload.iat === 'number' ? payload.iat : undefined
  return { uid: payload.uid, username, iat }
}

/**
 * Verify a username/password against the stored bcrypt hash. Returns the user's
 * identity on success, or null on unknown user / bad password (callers should
 * not distinguish the two — same as the web login).
 */
export async function authenticate(username: string, password: string): Promise<{ id: string; username: string } | null> {
  const rec = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, password_hash: true },
  })
  if (!rec) return null
  const ok = await bcrypt.compare(password, rec.password_hash)
  if (!ok) return null
  return { id: rec.id, username: rec.username }
}
