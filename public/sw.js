const CACHE_NAME = 'acs-fast-cache-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/images/logo.png',
  '/manifest.json'
];

// 1. Tahap Install: Kunci aset utama di memori HP
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('🚀 ACS PWA: Mempersiapkan instalasi super cepat...');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log("Cache Alert:", err));
    })
  );
  self.skipWaiting();
});

// 2. Tahap Aktivasi: Bersihkan total sisa cache lemot versi v4 kemarin
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🗑️ ACS PWA: Membuang cache usang:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. Tahap Fetch: Strategi Stale-While-Revalidate (Kunci Kecepatan Instan)
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Jika aset ada di cache HP, langsung tampilkan saat itu juga (Instan!)
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // 2. Di latar belakang, cek ke Vercel apakah ada update baru. Jika ada, perbarui cache-nya.
        if (networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback jika benar-benar tidak ada internet
        console.log("ACS PWA berjalan penuh dalam mode offline.");
      });

      // Tampilkan cache dulu agar loading screen hilang sekejap mata, baru disusul proses fetch latar belakang
      return cachedResponse || fetchPromise;
    })
  );
});
