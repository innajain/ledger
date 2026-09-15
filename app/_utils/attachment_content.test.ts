import { describe, it, expect } from 'vitest'
import {
  sniff_binary_type,
  verify_attachment_bytes,
  content_type_for_filename,
  MAX_ATTACHMENT_BYTES,
  MAX_INLINE_ATTACHMENT_BYTES,
} from './attachment_content'

const bytes = (...xs: number[]) => Uint8Array.from(xs)
const ascii = (s: string) => new TextEncoder().encode(s)
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const PDF = ascii('%PDF-1.7\nstuff')
const PNG = concat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ascii('rest'))
const JPEG = concat(bytes(0xff, 0xd8, 0xff, 0xe0), ascii('rest'))
const GIF = ascii('GIF89a....')
const WEBP = concat(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WEBPVP8 '))
const HEIC = concat(bytes(0, 0, 0, 0x18), ascii('ftyp'), ascii('heic'), ascii('rest'))

describe('content_type_for_filename', () => {
  it('maps known extensions case-insensitively', () => {
    expect(content_type_for_filename('note.pdf')).toBe('application/pdf')
    expect(content_type_for_filename('Contract_Note_15-Sep-2026.PDF')).toBe('application/pdf')
    expect(content_type_for_filename('shot.JPEG')).toBe('image/jpeg')
  })

  it('returns undefined for unknown or missing extensions', () => {
    expect(content_type_for_filename('archive.zip')).toBeUndefined()
    expect(content_type_for_filename('noextension')).toBeUndefined()
  })
})

describe('sniff_binary_type', () => {
  it('recognises each allowed binary format', () => {
    expect(sniff_binary_type(PDF)).toBe('application/pdf')
    expect(sniff_binary_type(PNG)).toBe('image/png')
    expect(sniff_binary_type(JPEG)).toBe('image/jpeg')
    expect(sniff_binary_type(GIF)).toBe('image/gif')
    expect(sniff_binary_type(WEBP)).toBe('image/webp')
    expect(sniff_binary_type(HEIC)).toBe('image/heic')
  })

  it('returns null for text, which carries no signature', () => {
    expect(sniff_binary_type(ascii('just some notes'))).toBeNull()
    expect(sniff_binary_type(ascii('{"a":1}'))).toBeNull()
  })

  it('does not over-read a buffer shorter than the signature', () => {
    expect(sniff_binary_type(ascii('%PD'))).toBeNull()
    expect(sniff_binary_type(new Uint8Array(0))).toBeNull()
    expect(sniff_binary_type(ascii('RIFF'))).toBeNull() // no WEBP tag at offset 8
  })

  it('does not mistake a non-HEIC ftyp box for HEIC', () => {
    const mp4 = concat(bytes(0, 0, 0, 0x18), ascii('ftyp'), ascii('isom'), ascii('rest'))
    expect(sniff_binary_type(mp4)).toBeNull()
  })
})

describe('verify_attachment_bytes', () => {
  it('accepts bytes matching the declared type', () => {
    expect(verify_attachment_bytes(PDF, 'application/pdf')).toEqual({ ok: true, content_type: 'application/pdf' })
    expect(verify_attachment_bytes(PNG, 'image/png')).toEqual({ ok: true, content_type: 'image/png' })
  })

  it('rejects a file whose bytes contradict the declared type', () => {
    const res = verify_attachment_bytes(PNG, 'application/pdf')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Content is image\/png, but application\/pdf was declared/)
  })

  it('rejects arbitrary bytes dressed up as a PDF', () => {
    const res = verify_attachment_bytes(bytes(0x00, 0x01, 0x02, 0x03, 0xff), 'application/pdf')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/does not look like application\/pdf/)
  })

  it('rejects an empty body', () => {
    const res = verify_attachment_bytes(new Uint8Array(0), 'application/pdf')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/empty/)
  })

  it('rejects a disallowed declared type outright', () => {
    const res = verify_attachment_bytes(PDF, 'application/zip')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Unsupported attachment type/)
  })

  it('rejects anything over the 10 MB ceiling', () => {
    const huge = concat(PDF, new Uint8Array(MAX_ATTACHMENT_BYTES))
    const res = verify_attachment_bytes(huge, 'application/pdf')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/too large/i)
  })

  describe('text types, which have no signature to check', () => {
    it('accepts valid UTF-8 as text/plain', () => {
      expect(verify_attachment_bytes(ascii('hello — ₹1,234'), 'text/plain')).toEqual({ ok: true, content_type: 'text/plain' })
    })

    it('rejects invalid UTF-8 claiming to be text', () => {
      const res = verify_attachment_bytes(bytes(0xc3, 0x28), 'text/plain')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toMatch(/not valid UTF-8/)
    })

    it('accepts parseable JSON', () => {
      expect(verify_attachment_bytes(ascii('{"amount": 99763.63}'), 'application/json')).toEqual({
        ok: true,
        content_type: 'application/json',
      })
    })

    it('rejects JSON that does not parse', () => {
      const res = verify_attachment_bytes(ascii('{not json'), 'application/json')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toMatch(/not valid JSON/)
    })

    it('rejects a binary blob smuggled in as text/plain', () => {
      const res = verify_attachment_bytes(PNG, 'text/plain')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toMatch(/Content is image\/png, but text\/plain was declared/)
    })
  })

  it('keeps the inline ceiling well under the hard ceiling', () => {
    // add_attachment refuses past the inline limit and redirects to the upload
    // URL; that only makes sense while it is the stricter of the two.
    expect(MAX_INLINE_ATTACHMENT_BYTES).toBeLessThan(MAX_ATTACHMENT_BYTES)
  })
})
