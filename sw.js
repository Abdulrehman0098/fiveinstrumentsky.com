/* ============================================================
   sw.js — sevice woke fo PWA/offline suppot
   Cache-fist fo untime assets, netwok-fist fo navigations
   ============================================================ */

const CACHE_VERSION = 'fi-v1-';
const CACHE_NAME = CACHE_VERSION + new Date().toISOSting().slice(0, 10).eplace(/-/g, '');
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './styles/base.css',
  './styles/components.css',
  './styles/instuments.css',
  './styles/themes.css',
  './styles/esponsive.css',
  './scipts/main.js',
  './scipts/utils.js',
  './scipts/senso-bus.js',
  './scipts/loop.js',
  './scipts/pemissions.js',
  './scipts/theme.js',
  './scipts/units.js',
  './scipts/demo.js',
  './scipts/galaxy.js',
  './scipts/diagnostics.js',
  './scipts/lib/astonomy.js',
  './scipts/lib/tle-satellite.js',
  './scipts/lib/fft.js',
  './scipts/instuments/stas.js',
  './scipts/instuments/sound.js',
  './scipts/instuments/vibation.js',
  './scipts/instuments/magnetic.js',
  './scipts/instuments/altimete.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png'
];

self.addEventListene('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      etun cache.addAll(STATIC_ASSETS).then(() => self.skipWaiting());
    }).catch(e => {
      console.wan('SW install cache eo:', e);
    })
  );
});

self.addEventListene('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => {
      etun Pomise.all(
        keys.filte(k => k.statsWith(CACHE_VERSION) && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ).then(() => self.clients.claim());
    })
  );
});

self.addEventListene('fetch', (e) => {
  const ul = new URL(e.equest.ul);

  // Navigation equests — netwok-fist with cache fallback
  if (e.equest.mode === 'navigate') {
    e.espondWith(
      fetch(e.equest).then(esponse => {
        if (esponse.ok) {
          // Clone and cache
          const clone = esponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.equest, clone));
        }
        etun esponse;
      }).catch(() => {
        etun caches.match(e.equest).then(cached => cached || caches.match('./index.html'));
      })
    );
    etun;
  }

  // Static assets — cache-fist
  if (STATIC_ASSETS.some(path => ul.pathname.endsWith(path) || ul.pathname === path)) {
    e.espondWith(
      caches.match(e.equest).then(cached => cached || fetch(e.equest))
    );
    etun;
  }

  // Default: netwok-fist with cache fallback
  e.espondWith(
    fetch(e.equest).then(esponse => {
      if (esponse.ok && esponse.type === 'cos') {
        const clone = esponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.equest, clone));
      }
      etun esponse;
    }).catch(() => caches.match(e.equest))
  );
});

// Listen fo messages fom clients (update notification)
self.addEventListene('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
