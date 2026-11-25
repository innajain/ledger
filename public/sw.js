// Delivery receipt for push_delivery tracking. Never let a failed receipt
// break showing or opening the notification.
function ack(token, event) {
  if (!token) return Promise.resolve()
  return fetch('/api/push/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, event }),
    keepalive: true,
  }).catch(() => {})
}

self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Ledger', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Ledger'
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/', delivery: data.delivery || null },
  }
  if (data.tag) options.tag = data.tag

  // Ack inside waitUntil so the OS (iOS especially) doesn't kill the worker first.
  event.waitUntil(self.registration.showNotification(title, options).then(() => ack(data.delivery, 'delivered')))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  const delivery = event.notification.data && event.notification.data.delivery

  event.waitUntil(Promise.all([ack(delivery, 'opened'), focus_or_open(url)]))
})

function focus_or_open(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    for (const client of clientList) {
      if ('focus' in client) {
        client.focus()
        if ('navigate' in client) client.navigate(url).catch(() => {})
        return
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })
}

// Offline fallback: a page load that can't reach the server gets public/offline.html
// instead of the browser's error screen. That one static page is the only thing cached —
// never app pages or API responses, which carry ledger data. Bump the version whenever
// offline.html changes so installed apps replace their copy.
const OFFLINE_CACHE = 'ledger-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', event => {
  // A failed cache fill must never stop the worker installing: push delivery depends on it.
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then(cache => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ledger-offline-') && k !== OFFLINE_CACHE).map(k => caches.delete(k)))),
      // Start the page request in parallel with booting this worker, so routing navigations
      // through it costs no extra latency online.
      self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => {}) : null,
    ]).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  // Only full page loads; POSTs (the OAuth consent form) and every subresource, RSC and
  // server-action request go straight to the network untouched.
  if (req.mode !== 'navigate' || req.method !== 'GET') return
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse
        if (preloaded) return preloaded
        return await fetch(req)
      } catch {
        // Only a network failure lands here; a 4xx/5xx from the server is passed through.
        return (await caches.match(OFFLINE_URL)) || Response.error()
      }
    })(),
  )
})
