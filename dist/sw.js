// Naikkan versi cache (misal ke v2, v3, dst) jika kamu ingin memaksa browser clear cache aset lama
const CACHE_NAME = 'acs-cache-v2'; 

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/collector.html',
  '/admin.html',
  '/owner.html',
  '/style.css',
  '/images/logo.png',
  '/manifest.json'
];

// 1. Tahap Install: Amankan semua aset utama ke dalam cache baru
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 PWA: Mengarsipkan aset ke cache baru...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Paksa Service Worker baru langsung aktif detik ini juga tanpa menunggu
  self.skipWaiting(); 
});

// 2. Tahap Activate: Bersihkan total semua cache versi lama (Clear Cache otomatis)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // Jika ada nama cache lama yang tidak cocok dengan versi baru, ledakkan/hapus!
          if (cache !== CACHE_NAME) {
            console.log('🗑️ PWA: Menghapus cache versi lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('🚀 PWA: Cache lama bersih, versi baru siap mengambil alih!');
      // Paksa halaman web yang sedang terbuka langsung dikontrol oleh SW baru
      return self.clients.claim(); 
    })
  );
});

// 3. Tahap Fetch: Strategi Cache First / Network Fallback
self.addEventListener('fetch', (event) => {
  // Hanya tangani request dengan skema http/https (menghindari error ekstensi browser)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Jika aset ada di cache, pakai cache. Jika tidak ada, ambil dari jaringan/Vercel.
      return cachedResponse || fetch(event.request);
    })
  );
});
