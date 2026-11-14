import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FsBlobStore, safe_filename } from './blob_fs'

let dir: string
let store: FsBlobStore

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'blob-fs-'))
  store = new FsBlobStore(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('FsBlobStore', () => {
  it('writes, reads, lists and deletes', async () => {
    await store.put('attachments/u1/a.txt', Buffer.from('hello'))
    await store.put('attachments/u2/b.txt', Buffer.from('x'))
    expect((await store.read('attachments/u1/a.txt'))?.toString()).toBe('hello')
    expect(await store.exists('attachments/u1/a.txt')).toBe(true)
    const listed = (await store.list()).map(b => b.pathname).sort()
    expect(listed).toEqual(['attachments/u1/a.txt', 'attachments/u2/b.txt'])
    await store.del(['attachments/u1/a.txt', 'attachments/missing.txt'])
    expect(await store.read('attachments/u1/a.txt')).toBeNull()
    expect(await store.exists('attachments/u1/a.txt')).toBe(false)
  })

  it('overwrites without leaving temp files behind', async () => {
    await store.put('attachments/u/a.txt', Buffer.from('1'))
    await store.put('attachments/u/a.txt', Buffer.from('2'))
    expect((await store.read('attachments/u/a.txt'))?.toString()).toBe('2')
    expect(readdirSync(path.join(dir, 'attachments/u'))).toEqual(['a.txt'])
  })

  it('refuses paths that escape the root', async () => {
    await expect(store.put('../escape.txt', Buffer.from('x'))).rejects.toThrow('Invalid blob path')
    await expect(store.read('attachments/../../etc/passwd')).rejects.toThrow('Invalid blob path')
    await expect(store.read('/etc/passwd')).rejects.toThrow('Invalid blob path')
    await expect(store.del(['../x'])).rejects.toThrow('Invalid blob path')
    await expect(store.read('')).rejects.toThrow('Invalid blob path')
    await expect(store.read('a\0b')).rejects.toThrow('Invalid blob path')
    expect(existsSync(path.join(dir, '..', 'escape.txt'))).toBe(false)
  })

  it('lists nothing for a root that does not exist yet', async () => {
    expect(await new FsBlobStore(path.join(dir, 'nope')).list()).toEqual([])
  })
})

describe('safe_filename', () => {
  it('keeps ordinary names', () => {
    expect(safe_filename('statement-oct_2026.pdf')).toBe('statement-oct_2026.pdf')
  })
  it('drops directories, odd characters and leading dots', () => {
    expect(safe_filename('../../etc/passwd')).toBe('passwd')
    expect(safe_filename('C:\\Users\\me\\bill (1).pdf')).toBe('bill_1_.pdf')
    expect(safe_filename('.hidden')).toBe('hidden')
    expect(safe_filename('')).toBe('file')
    expect(safe_filename('///')).toBe('file')
  })
  it('bounds the length, keeping the extension end', () => {
    const out = safe_filename('a'.repeat(300) + '.pdf')
    expect(out.length).toBe(100)
    expect(out.endsWith('.pdf')).toBe(true)
  })
})
