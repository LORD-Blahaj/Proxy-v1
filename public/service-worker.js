self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open('proxy-pwa-v1').then((cache) => {
            return cache.addAll([
                '/',
                '/manifest.json',
                '/index.html',
                '/icon.png',
                '/icon-512.png'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
