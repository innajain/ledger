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

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
