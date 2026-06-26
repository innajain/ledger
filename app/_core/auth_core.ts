/**
 * Framework-agnostic auth primitives shared by the web server actions
 * (`app/_actions/auth.ts`) and the CLI (`cli/`). Nothing here touches
 * `next/headers` or cookies, so it runs in a plain Node process too.
 */
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { redis } from '@/lib/redis'
import { ActionResult, ok, err, fromError } from '@/app/_actions/_result'

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
  const matched = await bcrypt.compare(password, rec.password_hash)
  if (!matched) return null
  return { id: rec.id, username: rec.username }
}

// --- Credential schemas (shared so web + CLI enforce the same rules) ----------

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, dot, underscore and hyphen')
export const StrongPasswordSchema = z.string().min(10, 'Password must be at least 10 characters').max(200, 'Password is too long')

const SignUpSchema = z.object({ username: UsernameSchema, password: StrongPasswordSchema })
const ChangePasswordSchema = z.object({ current_password: z.string().min(1, 'Current password is required'), new_password: StrongPasswordSchema })
const ChangeUsernameSchema = z.object({ new_username: UsernameSchema, password: z.string().min(1, 'Password is required') })

// --- Session revocation -------------------------------------------------------
// Tokens for a user whose issued-at predates `auth:revoke_before:<uid>` (unix
// seconds) are treated as logged out. Set on password change.
export const revoke_key = (uid: string) => `auth:revoke_before:${uid}`

export async function revoke_sessions_before(uid: string, when_seconds: number): Promise<void> {
  await redis.setex(revoke_key(uid), JWT_EXPIRY_SECONDS, String(when_seconds))
}

/** Create a new user (with the strong credential policy). Returns the new identity. */
export async function sign_up_core(payload: { username: string; password: string }): Promise<ActionResult<{ id: string; username: string }>> {
  try {
    const parsed = SignUpSchema.safeParse(payload)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    const { username, password } = parsed.data

    const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (existing) return err('VALIDATION', 'user already exists')

    const password_hash = await bcrypt.hash(password, 10)
    const created = await prisma.user.create({ data: { username, password_hash }, select: { id: true, username: true } })
    return ok(created, 'Account created successfully')
  } catch (error) {
    return fromError(error)
  }
}

/** Verify the current password, set a new one, and revoke all existing sessions. */
export async function change_password_core(user_id: string, payload: { current_password: string; new_password: string }): Promise<ActionResult> {
  try {
    const parsed = ChangePasswordSchema.safeParse(payload)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    const { current_password, new_password } = parsed.data

    const userRec = await prisma.user.findUnique({ where: { id: user_id }, select: { id: true, password_hash: true } })
    if (!userRec) return err('NOT_FOUND', 'user not found')

    if (!(await bcrypt.compare(current_password, userRec.password_hash))) return err('UNAUTHORIZED', 'current password is incorrect')

    const new_password_hash = await bcrypt.hash(new_password, 10)
    await prisma.user.update({ where: { id: user_id }, data: { password_hash: new_password_hash } })

    // Invalidate every existing session (all devices). Callers that want to stay
    // logged in re-issue a fresh token afterwards (its iat survives the cutoff).
    await revoke_sessions_before(user_id, Math.floor(Date.now() / 1000))
    return ok(undefined, 'Password changed successfully')
  } catch (error) {
    return fromError(error)
  }
}

/** Verify the password and change the username (must be unique and different). */
export async function change_username_core(
  user_id: string,
  payload: { new_username: string; password: string },
): Promise<ActionResult<{ username: string }>> {
  try {
    const parsed = ChangeUsernameSchema.safeParse(payload)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    const { new_username, password } = parsed.data

    const userRec = await prisma.user.findUnique({ where: { id: user_id }, select: { id: true, username: true, password_hash: true } })
    if (!userRec) return err('NOT_FOUND', 'user not found')

    if (!(await bcrypt.compare(password, userRec.password_hash))) return err('UNAUTHORIZED', 'password is incorrect')

    const existing = await prisma.user.findUnique({ where: { username: new_username }, select: { id: true } })
    if (existing && existing.id !== user_id) return err('VALIDATION', 'username already taken')
    if (userRec.username === new_username) return err('VALIDATION', 'new username must be different from current username')

    await prisma.user.update({ where: { id: user_id }, data: { username: new_username } })
    return ok({ username: new_username }, 'Username changed successfully')
  } catch (error) {
    return fromError(error)
  }
}
