'use server'

import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { env, isProd } from '@/lib/env'
import type { user } from '@/generated/prisma/client'
import { z } from 'zod'
import { ActionResult, ok, err } from './_result'
import { rate_limit } from '@/lib/rate_limit'
import { redis } from '@/lib/redis'

const token_name = 'ledger_token'
const JWT_EXPIRY_DAYS = 7
const JWT_EXPIRY_SECONDS = JWT_EXPIRY_DAYS * 24 * 60 * 60

function fromCatch(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return err('VALIDATION', error.issues[0].message)
  const detail = error instanceof Error ? error.message : 'Unknown error'
  return err('SERVER', isProd() ? 'Something went wrong. Please try again.' : detail)
}

// Login accepts whatever is on file — existing accounts may pre-date the policy
// below, so we only check that the fields are present.
const AuthSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

// Stricter rules for creating an account or choosing a new username/password.
const UsernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, dot, underscore and hyphen')
const StrongPasswordSchema = z.string().min(10, 'Password must be at least 10 characters').max(200, 'Password is too long')

const SignUpSchema = z.object({
  username: UsernameSchema,
  password: StrongPasswordSchema,
})

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: StrongPasswordSchema,
})

const ChangeUsernameSchema = z.object({
  new_username: UsernameSchema,
  password: z.string().min(1, 'Password is required'),
})

const secret_bytes = new TextEncoder().encode(env.JWT_SECRET)

async function sign_token(payload: { uid: string; username: string }): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${JWT_EXPIRY_DAYS}d`).sign(secret_bytes)
}

async function verify_token(token: string): Promise<{ uid: string; username?: string; iat?: number }> {
  const { payload } = await jwtVerify(token, secret_bytes, { algorithms: ['HS256'] })
  if (typeof payload.uid !== 'string') throw new Error('invalid token')
  const username = typeof payload.username === 'string' ? payload.username : undefined
  const iat = typeof payload.iat === 'number' ? payload.iat : undefined
  return { uid: payload.uid, username, iat }
}

// --- Session revocation -------------------------------------------------------
// Tokens for a user whose issued-at (`iat`) predates `auth:revoke_before:<uid>`
// (unix seconds) are treated as logged out. Set on password change (and any future
// "sign out everywhere"). Stored in Redis with a TTL equal to the max token
// lifetime — past that, every pre-cutoff token has already expired on its own.
const revoke_key = (uid: string) => `auth:revoke_before:${uid}`

async function revoke_sessions_before(uid: string, when_seconds: number): Promise<void> {
  await redis.setex(revoke_key(uid), JWT_EXPIRY_SECONDS, String(when_seconds))
}

// Cached per request (deduped across get_current_user_id / get_current_user).
// Fails open on a Redis error: an outage shouldn't lock everyone out — it just
// suspends revocation enforcement until Redis is reachable again.
const is_token_revoked = cache(async (uid: string, iat: number | undefined): Promise<boolean> => {
  if (!iat) return false // legacy token without an iat — can't evaluate; it expires within JWT_EXPIRY_DAYS anyway
  try {
    const cutoff = await redis.get(revoke_key(uid))
    return cutoff !== null && iat < Number(cutoff)
  } catch {
    return false
  }
})

async function set_session_cookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set({
    name: token_name,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProd(),
    maxAge: JWT_EXPIRY_SECONDS,
  })
}

export async function sign_up(payload: z.infer<typeof SignUpSchema>): Promise<ActionResult> {
  try {
    const { username, password } = SignUpSchema.parse(payload)

    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!(await rate_limit(`signup:ip:${ip}`, 5, 60 * 60))) return err('VALIDATION', 'Too many sign-ups from this network. Please try again later.')

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (existing) return err('VALIDATION', 'user already exists')

    const password_hash = await bcrypt.hash(password, 10)
    const created = await prisma.user.create({
      data: { username, password_hash },
      select: { id: true, username: true },
    })

    const token = await sign_token({ uid: created.id, username: created.username })
    await set_session_cookie(token)

    return ok(undefined, 'Account created successfully')
  } catch (error) {
    return fromCatch(error)
  }
}

export async function log_in(payload: z.infer<typeof AuthSchema>): Promise<ActionResult> {
  try {
    const { username, password } = AuthSchema.parse(payload)

    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const within_ip = await rate_limit(`login:ip:${ip}`, 10, 60)
    const within_user = await rate_limit(`login:user:${username.toLowerCase()}`, 5, 5 * 60)
    if (!within_ip || !within_user) return err('UNAUTHORIZED', 'Too many attempts. Please wait a minute and try again.')

    const userRec = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, password_hash: true },
    })
    if (!userRec) return err('UNAUTHORIZED', 'invalid credentials')

    const passwordOk = await bcrypt.compare(password, userRec.password_hash)
    if (!passwordOk) return err('UNAUTHORIZED', 'invalid credentials')

    const token = await sign_token({ uid: userRec.id, username: userRec.username })
    await set_session_cookie(token)

    return ok(undefined, 'Logged in successfully')
  } catch (error) {
    return fromCatch(error)
  }
}

export async function log_out(): Promise<ActionResult> {
  try {
    const cookieStore = await cookies()
    cookieStore.set({
      name: token_name,
      value: '',
      path: '/',
      expires: new Date(0),
    })
    return ok(undefined, 'Logged out successfully')
  } catch (error) {
    return fromCatch(error)
  }
}

// Resolve the current user id without touching the DB.
// Trusts x-user-id set by the proxy (the proxy strips any client-supplied value
// before re-setting it from a verified JWT). Falls back to verifying the cookie
// for paths the proxy doesn't cover.
export const get_current_user_id = cache(async (): Promise<string | null> => {
  const h = await headers()
  const headerUid = h.get('x-user-id')
  if (headerUid) {
    const iat = Number(h.get('x-token-iat')) || undefined
    if (await is_token_revoked(headerUid, iat)) return null
    return headerUid
  }

  const cookie = (await cookies()).get(token_name)?.value
  if (!cookie) return null
  try {
    const { uid, iat } = await verify_token(cookie)
    if (await is_token_revoked(uid, iat)) return null
    return uid
  } catch {
    return null
  }
})

// Cache the current user (full record) for the duration of the request.
// Use this only when callers need username/etc. — for ownership scoping,
// prefer `get_current_user_id`.
//
// Reads uid+username from the proxy-set headers when available to avoid a DB
// round-trip on every authenticated render. Falls back to verifying the cookie
// (and, for tokens issued before username was embedded, a one-time DB lookup).
export const get_current_user = cache(async (): Promise<Pick<user, 'id' | 'username'> | null> => {
  const h = await headers()
  const headerUid = h.get('x-user-id')
  const headerUsername = h.get('x-username')
  if (headerUid && headerUsername) {
    const iat = Number(h.get('x-token-iat')) || undefined
    if (await is_token_revoked(headerUid, iat)) return null
    return { id: headerUid, username: headerUsername }
  }

  const cookie = (await cookies()).get(token_name)?.value
  if (!cookie) return null
  let payload: { uid: string; username?: string; iat?: number }
  try {
    payload = await verify_token(cookie)
  } catch {
    return null
  }
  if (await is_token_revoked(payload.uid, payload.iat)) return null
  if (payload.username) return { id: payload.uid, username: payload.username }

  const userRec = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, username: true },
  })
  return userRec
})

// Whether the current user is an admin. Costs one indexed-PK lookup; cached for
// the request. Use for UI affordances — server actions must still call
// `require_admin` to enforce access.
export const is_current_user_admin = cache(async (): Promise<boolean> => {
  const uid = await get_current_user_id()
  if (!uid) return false
  const rec = await prisma.user.findUnique({ where: { id: uid }, select: { is_admin: true } })
  return !!rec?.is_admin
})

/**
 * Throw unless the current user has `is_admin = true`. Returns the user id
 * on success so callers can use it for downstream queries.
 */
export async function require_admin(): Promise<string> {
  const id = await get_current_user_id()
  if (!id) throw new Error('unauthorized')
  const user = await prisma.user.findUnique({
    where: { id },
    select: { is_admin: true },
  })
  if (!user?.is_admin) throw new Error('admin only')
  return id
}

export async function change_password(payload: z.infer<typeof ChangePasswordSchema>): Promise<ActionResult> {
  try {
    const { current_password, new_password } = ChangePasswordSchema.parse(payload)

    const user = await get_current_user()
    if (!user) return err('UNAUTHORIZED', 'not authenticated')

    const userRec = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, password_hash: true },
    })
    if (!userRec) return err('NOT_FOUND', 'user not found')

    const isValid = await bcrypt.compare(current_password, userRec.password_hash)
    if (!isValid) return err('UNAUTHORIZED', 'current password is incorrect')

    const new_password_hash = await bcrypt.hash(new_password, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash: new_password_hash },
    })

    // Invalidate every existing session (all devices), then re-issue this device's
    // cookie so the user who just changed their password stays logged in here. The
    // fresh token's iat is >= the cutoff, so it survives the revocation check.
    await revoke_sessions_before(user.id, Math.floor(Date.now() / 1000))
    const token = await sign_token({ uid: user.id, username: user.username })
    await set_session_cookie(token)

    return ok(undefined, 'Password changed successfully')
  } catch (error) {
    return fromCatch(error)
  }
}

export async function change_username(payload: z.infer<typeof ChangeUsernameSchema>): Promise<ActionResult> {
  try {
    const { new_username, password } = ChangeUsernameSchema.parse(payload)

    const user = await get_current_user()
    if (!user) return err('UNAUTHORIZED', 'not authenticated')

    const userRec = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, username: true, password_hash: true },
    })
    if (!userRec) return err('NOT_FOUND', 'user not found')

    const isValid = await bcrypt.compare(password, userRec.password_hash)
    if (!isValid) return err('UNAUTHORIZED', 'password is incorrect')

    const existing = await prisma.user.findUnique({
      where: { username: new_username },
      select: { id: true },
    })
    if (existing && existing.id !== user.id) {
      return err('VALIDATION', 'username already taken')
    }

    if (userRec.username === new_username) {
      return err('VALIDATION', 'new username must be different from current username')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { username: new_username },
    })

    // Re-issue the cookie so the JWT payload (and proxy-set x-username header)
    // reflects the new username instead of the stale one until the next login.
    const token = await sign_token({ uid: user.id, username: new_username })
    await set_session_cookie(token)

    return ok(undefined, 'Username changed successfully')
  } catch (error) {
    return fromCatch(error)
  }
}
