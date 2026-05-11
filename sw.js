const CACHE_NAME = 'oer-agenda-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/admin.html',
    '/assets/css/public.css',
    '/assets/js/public/version-tracker.js',
    '/assets/js/public/notifications.js',
    '/assets/js/public/dynamic-links.js',
    '/assets/js/admin/admin.js',
    '/assets/js/firebase-config.js',
    '/manifest.json',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js'
];

// Instalação: Cacheia os ativos estáticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Estratégia Stale-while-revalidate
self.addEventListener('fetch', (event) => {
    // Ignorar requisições para o Firebase (Firestore/Auth/Functions) para evitar problemas de dados estáticos
    if (event.request.url.includes('firestore.googleapis.com') || 
        event.request.url.includes('firebaseinstallations.googleapis.com') ||
        event.request.url.includes('firebaselogging.googleapis.com')) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchedResponse = fetch(event.request).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => {
                    // Se falhar a rede (offline), retorna o que está no cache
                    return cachedResponse;
                });

                return cachedResponse || fetchedResponse;
            });
        })
    );
});
