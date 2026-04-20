// ─── Service Worker — caches the app shell for offline use ───────────────────
const CACHE = 'scheme-portal-v1'

const SHELL = [
  '/',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/index.css',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Only handle GET requests
  if (e.request.method !== 'GET') return

  // For Supabase API calls — network only (data handled by IndexedDB in app)
  if (e.request.url.includes('supabase.co')) return

  // For everything else — cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(response => {
        // Cache valid responses
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE).then(cache => cache.put(e.request, clone))
        }
        return response
      }).catch(() => caches.match('/'))
    })
  )
})
