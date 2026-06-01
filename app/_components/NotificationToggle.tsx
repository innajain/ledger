'use client'

import { useEffect, useState } from 'react'
import { save_push_subscription, delete_push_subscription } from '@/app/_actions/notifications'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// VAPID public key (base64url) → Uint8Array, as PushManager.subscribe expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function NotificationToggle() {
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(ok)
    if (!ok) return
    if (Notification.permission === 'denied') setDenied(true)
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setEnabled(!!sub))
      .catch(() => {})
  }, [])

  async function enable() {
    setBusy(true)
    setMsg(null)
    try {
      if (!VAPID_PUBLIC_KEY) {
        setMsg('Push notifications are not configured on the server yet.')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setDenied(perm === 'denied')
        setMsg('Permission was not granted.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
      const json = sub.toJSON()
      const r = await save_push_subscription({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      })
      if (r.success) {
        setEnabled(true)
        setMsg('Notifications enabled on this device.')
      } else {
        setMsg(r.message ?? 'Could not save subscription.')
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setMsg(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await delete_push_subscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setEnabled(false)
      setMsg('Notifications disabled on this device.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not disable notifications.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Notifications</h3>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100">Push notifications</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Get notified about approval requests, rejections, and messages from linked accounts — on this device.
          </p>
        </div>
        {supported && (
          <button
            type="button"
            onClick={enabled ? disable : enable}
            disabled={busy || denied}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              enabled
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                : 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
            }`}
          >
            {busy ? '…' : enabled ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>

      {!supported && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          This browser doesn’t support push notifications. On iPhone/iPad, add the app to your Home Screen first (Share → Add to Home Screen), then
          enable from the installed app.
        </p>
      )}
      {denied && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          Notifications are blocked for this site. Re-enable them in your browser’s site settings, then try again.
        </p>
      )}
      {msg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{msg}</p>}
    </div>
  )
}
