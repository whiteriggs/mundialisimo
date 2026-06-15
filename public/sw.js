const CACHE = 'mundialisimo-v58';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Only handle same-origin requests. Cross-origin (UFWC data, Worker, Firestore)
  // siempre va directo a la red para no quedar atrapado en caché.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST para el código y las páginas (HTML, JS, CSS, JSON y datos):
  // así el usuario SIEMPRE recibe la última versión y nunca se queda con un
  // bundle viejo (causa de "no veo los cambios" pese a recargar). La caché solo
  // se usa como respaldo si no hay red (modo offline).
  const isCodeOrData =
    event.request.mode === 'navigate' ||
    /\.(?:html|js|css|json)$/.test(url.pathname) ||
    url.pathname.startsWith('/_next/');

  if (isCodeOrData) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CACHE-FIRST (stale-while-revalidate) para assets estáticos (imágenes,
  // fuentes, iconos): rara vez cambian y conviene servirlos rápido.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? fetchPromise;
    })
  );
});

// ── Notificaciones push ──────────────────────────────────────────────────
// El payload llega cifrado y lo descifra el navegador; aquí solo mostramos la
// notificación. Si el usuario ya tiene la app enfocada, no molestamos.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = { title: 'Mundialísimo', body: '', url: '/', tag: 'mundialisimo' };
    try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* payload no-JSON */ }

    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appFocused = clientsList.some((c) => c.focused || c.visibilityState === 'visible');
    if (appFocused) return; // está usando la app: no notificar

    const base = self.location.pathname.replace(/sw\.js$/, '');
    await self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: `${base}icons/icon-192x192.png`,
      badge: `${base}icons/icon-192x192.png`,
      data: { url: data.url },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = (event.notification.data && event.notification.data.url) || '/';
  const base = self.location.pathname.replace(/sw\.js$/, '');
  const targetUrl = new URL(targetPath.replace(/^\//, ''), self.location.origin + base).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.navigate(targetUrl).catch(() => {}); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});

