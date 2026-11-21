/*
 * sw.js — Service worker : permet d'ouvrir l'application sans connexion.
 * Les fichiers de l'application sont mis en cache ; vos données financières,
 * elles, restent dans le stockage local du téléphone et ne passent jamais ici.
 *
 * Après une mise à jour du code, augmentez le numéro de version ci-dessous.
 */
const CACHE = 'budget-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './calc.js',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stratégie « cache d'abord, mise à jour en arrière-plan » :
// l'app s'ouvre instantanément (même hors ligne) et récupère les nouvelles versions discrètement.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(key, { ignoreSearch: true }).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(key, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
