// SERVICE WORKER KAMIKAZE (BOM BUNUH DIRI)
self.addEventListener('install', (e) => {
    // Paksa aktif detik ini juga tanpa nunggu
    self.skipWaiting(); 
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        // 1. Hapus SEMUA cache yang pernah dibikin sama versi lama
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    console.log("💣 Meledakkan cache:", cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            // 2. Bunuh diri (Unregister) dari browser
            console.log("💀 Service Worker Kamikaze sukses hancur!");
            return self.registration.unregister();
        })
    );
});