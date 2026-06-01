'use client'

import { useEffect } from 'react'

// Registers the push service worker once on the client. Rendered globally in
// the layout so any browser that visits has the SW ready to receive pushes.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
