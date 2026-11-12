// Kill switch. v0.2.0 shipped a caching service worker; this one replaces it, deletes its
// caches, unregisters itself and reloads open pages so they load straight from the network again.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
  })());
});
