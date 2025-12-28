'use server';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import type { user } from '@/generated/prisma/client';

const token_name = 'ledger_token';
const JWT_EXPIRY_DAYS = 7;
const JWT_EXPIRY_SECONDS = JWT_EXPIRY_DAYS * 24 * 60 * 60;

function get_secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

async function sign_token(payload: { uid: string }): Promise<string> {
  return jwt.sign(payload, get_secret(), { expiresIn: `${JWT_EXPIRY_DAYS}d` });
}

function verify_token(token: string): { uid: string } {
  return jwt.verify(token, get_secret()) as { uid: string };
}

export async function sign_up(payload: { username: string; password: string }): Promise<void> {
  const username = String(payload.username ?? '');
  const password = String(payload.password ?? '');
  if (!username || !password) throw new Error('username and password required');

  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) throw new Error('user already exists');

  const password_hash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: { username, password_hash },
    select: { id: true, username: true },
  });

  const token = await sign_token({ uid: created.id });
  const cookieStore = await cookies();
  cookieStore.set({
    name: token_name,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: JWT_EXPIRY_SECONDS,
  });

  // no return value — form action expected to return void
  return;
}

export async function log_in(payload: { username: string; password: string }): Promise<void> {
  const username = String(payload.username ?? '');
  const password = String(payload.password ?? '');
  if (!username || !password) throw new Error('username and password required');

  const userRec = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, password_hash: true },
  });
  if (!userRec) throw new Error('invalid credentials');

  const ok = await bcrypt.compare(password, userRec.password_hash);
  if (!ok) throw new Error('invalid credentials');

  const token = await sign_token({ uid: userRec.id });
  const cookieStore = await cookies();
  cookieStore.set({
    name: token_name,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: JWT_EXPIRY_SECONDS,
  });

  // no return value — form action expected to return void
  return;
}

export async function log_out(): Promise<void> {
  // expire the cookie
  const cookieStore = await cookies();
  cookieStore.set({ name: token_name, value: '', path: '/', expires: new Date(0) });
}

export async function get_current_user(): Promise<user | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(token_name)?.value;
  if (!cookie) return null;
  try {
    const payload = verify_token(cookie);
    const userRec = await prisma.user.findUnique({ where: { id: payload.uid }, select: { id: true, username: true } });
    return userRec as user | null;
  } catch {
    return null;
  }
}
