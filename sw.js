// ==========================================
// CONFIGURAÇÃO DO FIREBASE CLOUD MESSAGING (FCM)
// ==========================================
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyA_exFw1oK-xGsksVaNTr1lAYHKswzYhGM",
  authDomain: "oer-agenda.firebaseapp.com",
  projectId: "oer-agenda",
  storageBucket: "oer-agenda.firebasestorage.app",
  messagingSenderId: "1020948916905",
  appId: "1:1020948916905:web:0fe90eb1fb1b7f183c17b8"
};

// Inicializa a instância do Firebase para o modo Em Segundo Plano
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Captura as mensagens enviadas através do Console enquanto a aba do site está fechada
messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] Foi recebida uma mensagem Push em background.', payload);

  // Se a mensagem já contiver a estrutura de notificação nativa, o SO/Navegador cuidará da exibição.
  // Só exibiremos manualmente se for uma mensagem puramente de dados (data-only) para evitar duplicidade.
  const hasNotification = payload.notification || payload.webpush?.notification;

  if (!hasNotification) {
    const notificationTitle = payload.data?.title || 'Aviso OER Agenda';
    const notificationOptions = {
      body: payload.data?.body || 'Você tem uma nova atualização.',
      icon: './assets/img/favicon-final.png', 
      badge: './assets/img/favicon-final.png',
      image: payload.data?.image || payload.data?.imageUrl || undefined,
      data: {
        click_action: payload.data?.linkUrl || payload.data?.click_action || 'https://oer-agenda.web.app/'
      }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

// ====== ROTEAMENTO AO CLICAR NA NOTIFICAÇÃO ======
// Intercepta o clique ANTES do Firebase para evitar que ele abra a raiz do Github Pages (erro 404)
self.addEventListener('notificationclick', function(event) {
  event.stopImmediatePropagation(); 
  console.log('[Service Worker] Usuário clicou na notificação.');
  event.notification.close();

  // Define a URL padrão com tracking de notificação
  let targetUrl = 'https://oer-agenda.web.app/?source=notification';

  // Verifica se há uma URL personalizada no payload da notificação
  if (event.notification.data) {
    const customUrl = event.notification.data.click_action || event.notification.data.url;
    if (customUrl) {
      try {
        const urlObj = new URL(customUrl);
        urlObj.searchParams.set('source', 'notification');
        targetUrl = urlObj.toString();
      } catch (e) {
        console.error('[Service Worker] Erro ao processar URL personalizada:', e);
      }
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Faz o foco e navega para a URL de tracking se já tiver a aba do projeto aberta (seja no GitHub Pages ou Firebase Hosting)
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        const isAppTab = client.url.includes('borisromaoantunes.github.io/agenda-e-temporada') || 
                          client.url.includes('oer-agenda.web.app');
        
        if (isAppTab && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(c => c ? c.focus() : null);
          }
          return client.focus();
        }
      }
      // Ou abre aba nova com a URL correta
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ==========================================
// CONFIGURAÇÃO DO PWA & CACHE OFFLINE
// ==========================================
const CACHE_NAME = 'oer-agenda-v35';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/assets/css/public.css',
    '/assets/js/public/version-tracker.js',
    '/assets/js/public/notifications.js',
    '/assets/js/public/dynamic-links.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js'
    // NOTA: firebase-config.js, admin.html e scripts admin NÃO são cacheados para evitar
    // servir versões antigas que bloqueiam a autenticação do Firebase
];

// ==========================================
// URLs que o SW NUNCA deve interceptar
// (Firebase Auth, Firestore, instalações, tokens, etc.)
// ==========================================
const FIREBASE_BYPASS_PATTERNS = [
    'firestore.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'firebaselogging.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'fcmregistrations.googleapis.com',
    'fcm.googleapis.com',
    'firebase.googleapis.com',
    'www.googleapis.com',
    'version.json'
];

// ==========================================
// URLs de scripts dinâmicos que NUNCA devem ser cacheadas
// ==========================================
const NO_CACHE_PATTERNS = [
    '/assets/js/firebase-config.js',
    '/assets/js/admin/',
    '/admin.html',
    '/presenca.html',
    'gstatic.com/firebasejs'
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
                        console.log('[SW] Removendo cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Estratégia de Fetch com proteções de autenticação
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    const method = event.request.method;

    // 1. NUNCA interceptar requisições do Firebase (auth, firestore, instalações, tokens)
    if (FIREBASE_BYPASS_PATTERNS.some(pattern => url.includes(pattern))) {
        return; // Deixa passar direto para a rede
    }

    // 2. NUNCA cachear métodos não-GET (POST, PUT, DELETE, etc.)
    if (method !== 'GET') {
        return; // Deixa passar direto para a rede
    }

    // 3. NUNCA cachear scripts dinâmicos críticos (firebase-config, scripts admin, presenca.html)
    if (NO_CACHE_PATTERNS.some(pattern => url.includes(pattern))) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 4. Cache inteligente para PDFs do Firebase Storage
    if (url.includes('firebasestorage.googleapis.com') && url.toLowerCase().includes('.pdf')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(event.request);
                
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                try {
                    const networkResponse = await fetch(event.request);
                    if (networkResponse.status === 200) {
                        const isAgenda = url.includes('agenda');
                        const isTemporada = url.includes('temporada');
                        const typeKey = isAgenda ? 'agenda' : (isTemporada ? 'temporada' : null);

                        if (typeKey) {
                            const cachedRequests = await cache.keys();
                            for (const req of cachedRequests) {
                                if (req.url.includes('firebasestorage.googleapis.com') && 
                                    req.url.includes(typeKey) && 
                                    req.url !== url) {
                                    console.log('[SW] Removendo versão antiga do PDF do cache:', typeKey);
                                    await cache.delete(req);
                                }
                            }
                        }
                        
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

    // 5. Estratégia Stale-while-revalidate para demais ativos estáticos (apenas GET)
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchedResponse = fetch(event.request).then((networkResponse) => {
                    if (networkResponse.status === 200 && event.request.method === 'GET') {
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
