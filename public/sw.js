const CACHE_NAME = 'acs-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  // Masukkan file gambar/logo kamu di bawah ini jika ada, contoh:
  // '/logo.png',
];

// 1. Install & Simpan Aset ke Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Mengarsipkan aset ke cache...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Bersihkan Cache Versi Lama saat Update
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🗑️ Menghapus cache lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Strategi Fetch (Mengambil dari Cache atau Jaringan)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
