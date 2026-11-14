// Attachment storage on the local filesystem, for a single-server deployment with no Vercel Blob.
// Files live under one root directory at the pathname the app gives them (attachments/<user>/...);
// every path is resolved and checked to stay inside the root, so a crafted pathname cannot read
// or write elsewhere. Dependency-free (node:fs only) so it is unit-testable; lib/blob_store.ts
// decides when to use it.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export class FsBlobStore {
  private root: string

  constructor(root: string) {
    this.root = path.resolve(root)
  }

  private resolve(pathname: string): string {
    if (!pathname || pathname.includes('\0')) throw new Error('Invalid blob path')
    const full = path.resolve(this.root, pathname)
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid blob path')
    return full
  }

  // Writes to a temp name and renames, so a reader never sees a half-written file.
  async put(pathname: string, body: Uint8Array): Promise<void> {
    const full = this.resolve(pathname)
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 })
    const tmp = path.join(path.dirname(full), `.tmp-${randomBytes(6).toString('hex')}`)
    try {
      await fs.writeFile(tmp, body, { mode: 0o600 })
      await fs.rename(tmp, full)
    } finally {
      await fs.rm(tmp, { force: true })
    }
  }

  async read(pathname: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(pathname))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(pathname))
      return true
    } catch {
      return false
    }
  }

  async del(pathnames: string[]): Promise<void> {
    for (const p of pathnames) await fs.rm(this.resolve(p), { force: true })
  }

  async list(): Promise<{ pathname: string; uploadedAt: Date }[]> {
    const out: { pathname: string; uploadedAt: Date }[] = []
    const walk = async (dir: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
        throw e
      }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) await walk(full)
        else if (e.isFile() && !e.name.startsWith('.tmp-'))
          out.push({ pathname: path.relative(this.root, full).split(path.sep).join('/'), uploadedAt: (await fs.stat(full)).mtime })
      }
    }
    await walk(this.root)
    return out
  }
}

// A filename that is safe as one path segment: no separators, no leading dots, bounded length.
export function safe_filename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-100)
  return cleaned || 'file'
}
