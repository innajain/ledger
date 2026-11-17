import { describe, expect, it } from 'vitest'
import { decode_vapid_public_key, subscription_uses_key } from './vapid_key'

// A throwaway key from web-push's generateVAPIDKeys(); its private half was never kept.
const KEY = 'BLKvSZnxI94yHOwAjytOdkZYxprBQDkXH2Epd5JzGZfuuQw6RQV-JK3bq1bIgkYOXDYGfKnH8DN3V8ujhfkXYhQ'

describe('decode_vapid_public_key', () => {
  it('decodes a web-push public key to its 65 bytes', () => {
    const bytes = decode_vapid_public_key(KEY)
    expect(bytes).not.toBeNull()
    expect(bytes!.length).toBe(65)
    expect(bytes![0]).toBe(0x04)
  })

  it('accepts the padded form too', () => {
    expect(decode_vapid_public_key(KEY + '=')).toEqual(decode_vapid_public_key(KEY))
  })

  it('rejects missing, placeholder and mangled values instead of throwing', () => {
    for (const bad of [
      undefined,
      null,
      '',
      '[SENSITIVE]',
      '"' + KEY + '"',
      'your_vapid_public_key',
      KEY.slice(0, 40),
      KEY + 'AAAA',
      'B' + KEY.slice(1).replace(/./g, '*'),
    ])
      expect(decode_vapid_public_key(bad)).toBeNull()
  })
})

describe('subscription_uses_key', () => {
  const key = decode_vapid_public_key(KEY)!

  it('matches the key a subscription was made with', () => {
    expect(subscription_uses_key(key.slice().buffer, key)).toBe(true)
  })

  it('does not match a different key or none', () => {
    const other = key.slice()
    other[10] ^= 0xff
    expect(subscription_uses_key(other.buffer, key)).toBe(false)
    expect(subscription_uses_key(null, key)).toBe(false)
    expect(subscription_uses_key(new Uint8Array(10).buffer, key)).toBe(false)
  })
})
