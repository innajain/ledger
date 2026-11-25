import type { MetadataRoute } from 'next'

// Icons live in public/icons and are whitelisted in proxy.ts, since a phone fetches them
// while installing — possibly before anyone has signed in.
const ICON_192 = { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Ledger',
    short_name: 'Ledger',
    description: 'Personal finance — triple-entry bookkeeping',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#191713',
    theme_color: '#191713',
    categories: ['finance'],
    icons: [
      { ...ICON_192, purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Art kept inside the central 80% circle, on an opaque tile, so Android's launcher
      // can crop it to any shape without clipping the coins.
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press on the home-screen icon (Android; ignored on iOS).
    shortcuts: [
      { name: 'New transaction', short_name: 'New', url: '/transactions/create', icons: [ICON_192] },
      { name: 'Requests', url: '/requests', icons: [ICON_192] },
      { name: 'Transactions', url: '/transactions', icons: [ICON_192] },
    ],
  }
}
