import 'server-only'
import { put, del, list } from '@vercel/blob'
import { env } from '@/lib/env'
import { FsBlobStore, safe_filename } from '@/lib/blob_fs'
import { randomBytes } from 'node:crypto'

// One place that knows where attachment bytes live. Two backends:
//  - 'vercel': Vercel Blob (private access, read back with the read/write token) — the default,
//    and what the Vercel deployment uses.
//  - 'fs': files on the local disk under BLOB_FS_DIR (BLOB_STORAGE=fs), for a single-server
//    deployment. Files are served only through the authenticated /api/attachments/<id> and
//    /api/files/<pathname> routes, never directly.
// Callers deal in { url, pathname } exactly as the transaction_attachment table stores them.

export type BlobRef = { url: string; pathname: string }
export type BlobDriver = 'vercel' | 'fs'

export const blob_driver = (): BlobDriver | null => (env.BLOB_STORAGE === 'fs' ? 'fs' : env.BLOB_READ_WRITE_TOKEN ? 'vercel' : null)
export const attachments_enabled = (): boolean => blob_driver() !== null

const g = globalThis as unknown as { __blob_fs?: FsBlobStore }
const fs_store = () => (g.__blob_fs ??= new FsBlobStore(env.BLOB_FS_DIR))

const FS_URL_PREFIX = '/api/files/'
const fs_url = (pathname: string) => `${FS_URL_PREFIX}${pathname}`
// Per-user prefix: the files route can tell whose file a pathname is without a database row,
// which is what lets an upload be previewed before the attachment record exists.
export const fs_user_prefix = (user_id: string) => `attachments/${user_id}/`

export async function put_attachment(opts: { user_id: string; filename: string; body: Buffer; content_type: string }): Promise<BlobRef> {
  const driver = blob_driver()
  if (driver === 'fs') {
    const pathname = `${fs_user_prefix(opts.user_id)}${Date.now()}-${randomBytes(4).toString('hex')}-${safe_filename(opts.filename)}`
    await fs_store().put(pathname, opts.body)
    return { url: fs_url(pathname), pathname }
  }
  if (driver === 'vercel') {
    const blob = await put(`attachments/${Date.now()}-${opts.filename}`, opts.body, { access: 'private', contentType: opts.content_type })
    return { url: blob.url, pathname: blob.pathname }
  }
  throw new Error('Blob storage is not configured on this server')
}

// The URL the Vercel backend reads a private blob from, or null when the stored url is not ours.
function vercel_fetch_url(att_url: string, pathname: string): string | null {
  if (env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) return `${new URL(env.NEXT_PUBLIC_VERCEL_BLOB_API_URL).origin}/${pathname}`
  let parsed: URL
  try {
    parsed = new URL(att_url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname !== 'blob.vercel-storage.com' && !parsed.hostname.endsWith('.blob.vercel-storage.com')) return null
  return parsed.toString()
}

// The whole file, or null when it is missing or unreachable.
export async function read_attachment(ref: BlobRef): Promise<Buffer | null> {
  const driver = blob_driver()
  if (driver === 'fs') return fs_store().read(ref.pathname)
  if (driver === 'vercel') {
    const url = vercel_fetch_url(ref.url, ref.pathname)
    if (!url) return null
    const resp = await fetch(url, { headers: { authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` } })
    return resp.ok ? Buffer.from(await resp.arrayBuffer()) : null
  }
  return null
}

// A stored url -> its pathname on disk. Attachments copied over from Vercel Blob still carry their
// original https blob url (the path of that url is the pathname), newer ones carry /api/files/<pathname>.
function fs_pathname_of(u: string): string {
  if (u.startsWith(FS_URL_PREFIX)) return u.slice(FS_URL_PREFIX.length)
  if (/^https?:\/\//.test(u)) {
    try {
      return decodeURIComponent(new URL(u).pathname.slice(1))
    } catch {
      return u
    }
  }
  return u
}

// Accepts the stored url or a bare pathname (the orphan cleanup passes pathnames).
export async function delete_blobs(urls_or_pathnames: string[]): Promise<void> {
  if (urls_or_pathnames.length === 0) return
  if (blob_driver() === 'fs') {
    await fs_store().del(urls_or_pathnames.map(fs_pathname_of))
    return
  }
  await del(urls_or_pathnames)
}

export async function list_blobs(): Promise<{ pathname: string; uploadedAt: Date }[]> {
  if (blob_driver() === 'fs') return fs_store().list()
  const out: { pathname: string; uploadedAt: Date }[] = []
  let cursor: string | undefined
  do {
    const page = await list({ cursor, limit: 1000 })
    for (const b of page.blobs) out.push({ pathname: b.pathname, uploadedAt: b.uploadedAt })
    cursor = page.cursor
  } while (cursor)
  return out
}

// May this url/pathname be saved as an attachment of `user_id`? (Reference sent back by the browser.)
export async function is_trusted_blob_ref(url: string, pathname: string, user_id: string): Promise<boolean> {
  if (!pathname || pathname.includes('..')) return false
  if (blob_driver() === 'fs') {
    return pathname.startsWith(fs_user_prefix(user_id)) && url === fs_url(pathname) && (await fs_store().exists(pathname))
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) return true
  return parsed.protocol === 'https:' && (parsed.hostname === 'blob.vercel-storage.com' || parsed.hostname.endsWith('.blob.vercel-storage.com'))
}
