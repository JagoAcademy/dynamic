const CACHE_NAME = 'acs-cache-v3'; // Naikkan versi ke v3 untuk hapus sisa cache error kemarin

// Cukup daftarkan aset statis yang PASTI ada di folder public/ atau root hasil build
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/images/logo.png',
  '/manifest.json'
];

// 1. Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 PWA: Mengarsipkan aset dasar...');
      // Menggunakan return agar jika ada 1 file gagal, proses tidak langsung merusak SW
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log("PWA Cache Warning:", err));
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Hapus cache lama (Clear Cache Otomatis)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🗑️ PWA: Menghapus cache versi lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. Fetch Event: Strategi Network-First untuk Aset Dinamis Vite
// Ini kunci utamanya agar file build Vite (di dalam folder /assets/) tidak memicu error PWA
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    // Cari di jaringan dulu (Network First) agar file buatan Vite selalu yang terbaru
    fetch(event.request)
      .then((response) => {
        // Jika sukses didapat dari Vercel, simpan salinannya ke cache untuk mode offline
        if (response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Jika offline / gagal tersambung ke Vercel, baru ambil dari cache cadangan
        return caches.match(event.request);
      })
  );
});
