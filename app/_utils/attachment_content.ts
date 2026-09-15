// Content-type verification for uploaded attachments.
//
// The MCP upload endpoint is reached with a one-time capability token rather
// than a session, and the uploader declares its own content type up front. A
// declared type is therefore a claim, not a fact — so before anything lands in
// blob storage we check the bytes themselves. Pure and unit-tested; the route
// only wires it up.

export const ATTACHMENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  txt: 'text/plain',
  json: 'application/json',
}

export const ALLOWED_ATTACHMENT_TYPES = new Set(Object.values(ATTACHMENT_TYPE_BY_EXT))

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

// Beyond roughly this much, base64 in a tool argument stops being something a
// model can emit reliably — every byte has to pass through its output, and one
// wrong character yields a corrupt file that still uploads cleanly. add_attachment
// refuses past this and points at the upload-URL flow instead.
export const MAX_INLINE_ATTACHMENT_BYTES = 64 * 1024

export function content_type_for_filename(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ATTACHMENT_TYPE_BY_EXT[ext]
}

function starts_with(buf: Uint8Array, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false
  return bytes.every((b, i) => buf[i] === b)
}

function ascii_at(buf: Uint8Array, offset: number, literal: string): boolean {
  if (buf.length < offset + literal.length) return false
  for (let i = 0; i < literal.length; i++) {
    if (buf[offset + i] !== literal.charCodeAt(i)) return false
  }
  return true
}

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']

// Returns the binary type the bytes actually are, or null when they carry no
// signature (text/plain and application/json have none — those are validated by
// decoding instead, in verify_attachment_bytes).
export function sniff_binary_type(buf: Uint8Array): string | null {
  if (starts_with(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf' // %PDF-
  if (starts_with(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts_with(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii_at(buf, 0, 'GIF87a') || ascii_at(buf, 0, 'GIF89a')) return 'image/gif'
  if (ascii_at(buf, 0, 'RIFF') && ascii_at(buf, 8, 'WEBP')) return 'image/webp'
  if (ascii_at(buf, 4, 'ftyp') && HEIC_BRANDS.some(brand => ascii_at(buf, 8, brand))) return 'image/heic'
  return null
}

export type AttachmentCheck = { ok: true; content_type: string } | { ok: false; error: string }

// `declared` is whatever the caller claimed (header or filename extension).
// The bytes decide; the claim only has to agree with them.
export function verify_attachment_bytes(buf: Uint8Array, declared: string): AttachmentCheck {
  if (buf.length === 0) return { ok: false, error: 'Attachment content is empty' }
  if (buf.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'Attachment too large (max 10 MB)' }
  if (!ALLOWED_ATTACHMENT_TYPES.has(declared)) {
    return { ok: false, error: `Unsupported attachment type "${declared}" — allowed: ${[...ALLOWED_ATTACHMENT_TYPES].join(', ')}` }
  }

  const sniffed = sniff_binary_type(buf)

  if (sniffed) {
    if (sniffed !== declared) return { ok: false, error: `Content is ${sniffed}, but ${declared} was declared` }
    return { ok: true, content_type: sniffed }
  }

  // No signature: only the two text types may legitimately look like this, and
  // they still have to decode. Anything else declared here is lying about
  // itself (a .pdf that is not a PDF, say).
  if (declared !== 'text/plain' && declared !== 'application/json') {
    return { ok: false, error: `Content does not look like ${declared}` }
  }

  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return { ok: false, error: `Content is not valid UTF-8, so it cannot be ${declared}` }
  }

  if (declared === 'application/json') {
    try {
      JSON.parse(decoded)
    } catch {
      return { ok: false, error: 'Content is not valid JSON' }
    }
  }

  return { ok: true, content_type: declared }
}
