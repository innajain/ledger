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

const token_name = 'ledger_token'
const JWT_EXPIRY_DAYS = 7
const JWT_EXPIRY_SECONDS = JWT_EXPIRY_DAYS * 24 * 60 * 60

function fromCatch(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return err('VALIDATION', error.issues[0].message)
  return err('SERVER', error instanceof Error ? error.message : 'Unknown error')
}

const AuthSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
})

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(1, 'New password is required')
})

const ChangeUsernameSchema = z.object({
  new_username: z.string().min(1, 'New username is required'),
  password: z.string().min(1, 'Password is required')
})

const secret_bytes = new TextEncoder().encode(env.JWT_SECRET)

async function sign_token(payload: { uid: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${JWT_EXPIRY_DAYS}d`)
    .sign(secret_bytes)
}

async function verify_token(token: string): Promise<{ uid: string }> {
  const { payload } = await jwtVerify(token, secret_bytes)
  if (typeof payload.uid !== 'string') throw new Error('invalid token')
  return { uid: payload.uid }
}

export async function sign_up(payload: z.infer<typeof AuthSchema>): Promise<ActionResult> {
  try {
    const { username, password } = AuthSchema.parse(payload)

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

    const token = await sign_token({ uid: created.id })
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

    return ok(undefined, 'Account created successfully')
  } catch (error) {
    return fromCatch(error)
  }
}

export async function log_in(payload: z.infer<typeof AuthSchema>): Promise<ActionResult> {
  try {
    const { username, password } = AuthSchema.parse(payload)

    const userRec = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, password_hash: true },
    })
    if (!userRec) return err('UNAUTHORIZED', 'invalid credentials')

    const passwordOk = await bcrypt.compare(password, userRec.password_hash)
    if (!passwordOk) return err('UNAUTHORIZED', 'invalid credentials')

    const token = await sign_token({ uid: userRec.id })
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
  const headerUid = (await headers()).get('x-user-id')
  if (headerUid) return headerUid

  const cookie = (await cookies()).get(token_name)?.value
  if (!cookie) return null
  try {
    return (await verify_token(cookie)).uid
  } catch {
    return null
  }
})

// Cache the current user (full record) for the duration of the request.
// Use this only when callers need username/etc. — for ownership scoping,
// prefer `get_current_user_id`.
export const get_current_user = cache(async (): Promise<user | null> => {
  const id = await get_current_user_id()
  if (!id) return null
  const userRec = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true },
  })
  return userRec as user | null
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

    return ok(undefined, 'Username changed successfully')
  } catch (error) {
    return fromCatch(error)
  }
}
