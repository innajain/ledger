// Dependency-free so the browser's notification toggle can use it.

/**
 * Decodes a VAPID public key (base64url, as web-push generates it) into the bytes
 * `pushManager.subscribe` wants, or null when it is not a usable key: a P-256 public key
 * is 65 bytes starting 0x04. Checked up front so a missing or mangled key reads as "not
 * configured" instead of surfacing atob's "string is not correctly encoded".
 */
export function decode_vapid_public_key(key: string | null | undefined): Uint8Array | null {
  if (!key || !/^[A-Za-z0-9_-]+={0,2}$/.test(key)) return null
  const unpadded = key.replace(/=+$/, '')
  const base64 = (unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  let raw: string
  try {
    raw = atob(base64)
  } catch {
    return null
  }
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.length === 65 && bytes[0] === 0x04 ? bytes : null
}

/**
 * Whether a push subscription was made with this key. A subscription is bound to the
 * key it was created with, so after a key change the old one can never be delivered to
 * and has to be replaced.
 */
export function subscription_uses_key(subscription_key: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!subscription_key) return false
  const a = new Uint8Array(subscription_key)
  return a.length === key.length && a.every((b, i) => b === key[i])
}
