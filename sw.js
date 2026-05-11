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

// Estratégia Stale-while-revalidate + Cache Inteligente para PDFs
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Ignorar requisições para o Firebase (Firestore/Auth/Functions) para evitar problemas de dados estáticos
    if (url.includes('firestore.googleapis.com') || 
        url.includes('firebaseinstallations.googleapis.com') ||
        url.includes('firebaselogging.googleapis.com')) {
        return;
    }

    // Lógica especial para PDFs do Firebase Storage
    if (url.includes('firebasestorage.googleapis.com') && url.toLowerCase().includes('.pdf')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(event.request);
                
                // Se já estiver no cache, retorna imediatamente (performance máxima)
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Se não está no cache, busca na rede
                try {
                    const networkResponse = await fetch(event.request);
                    if (networkResponse.status === 200) {
                        // Limpeza Inteligente: Remove versões antigas do mesmo tipo de PDF para economizar espaço
                        const isAgenda = url.includes('agenda');
                        const isTemporada = url.includes('temporada');
                        const typeKey = isAgenda ? 'agenda' : (isTemporada ? 'temporada' : null);

                        if (typeKey) {
                            const cachedRequests = await cache.keys();
                            for (const req of cachedRequests) {
                                // Se for do storage, do mesmo tipo (agenda/temporada) mas URL diferente (versão antiga)
                                if (req.url.includes('firebasestorage.googleapis.com') && 
                                    req.url.includes(typeKey) && 
                                    req.url !== url) {
                                    console.log('[SW] Removendo versão antiga do PDF do cache:', typeKey);
                                    await cache.delete(req);
                                }
                            }
                        }
                        
                        // Salva a nova versão no cache
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (err) {
                    console.error('[SW] Erro ao buscar PDF:', err);
                }
            })
        );
        return;
    }

    // Estratégia padrão para outros ativos: Stale-while-revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchedResponse = fetch(event.request).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => {
                    return cachedResponse;
                });

                return cachedResponse || fetchedResponse;
            });
        })
    );
});
