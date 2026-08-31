const CACHE = 'esencial-fc-v5' // Subido a v5 para limpiar cualquier copia vieja atascada en los celulares

const ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png'
]

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
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
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)

  // No cachear Firebase — siempre en vivo
  if (url.hostname.includes('firestore') || url.hostname.includes('firebase')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })))
    return
  }

  // La navegación (abrir o recargar la página) SIEMPRE se pide primero a la
  // red, para que el celular sepa cuál es el paquete de JS más reciente que
  // debe cargar. Sin esto, una copia vieja de la página queda apuntando a
  // archivos que ya no existen después de cada despliegue nuevo (esto era la
  // causa de la pantalla en blanco). Solo si de verdad no hay señal se usa la
  // copia guardada como respaldo.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return response
        })
        .catch(async () => {
          const cached = await caches.match(e.request)
          return cached || (await caches.match('/index.html')) || new Response('Sin conexión', { status: 503 })
        })
    )
    return
  }

  // Resto de archivos (imágenes, CSS, JS ya con nombre único por versión):
  // se sirven de la copia guardada al instante si existe, y se actualiza de
  // fondo. Si no hay copia guardada Y falla la red, se devuelve un error real
  // en vez de "nada" — eso era lo que rompía el navegador con el segundo error.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return response
        })
        .catch(() => cached || new Response('', { status: 504 }))
      return cached || fetchPromise
    })
  )
})
