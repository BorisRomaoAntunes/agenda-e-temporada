// ====== ROTEAMENTO AO CLICAR NA NOTIFICAÇÃO ======
// Intercepta o clique ANTES do Firebase para evitar que ele abra a raiz do Github Pages (erro 404)
self.addEventListener('notificationclick', function(event) {
  event.stopImmediatePropagation(); 
  console.log('[Service Worker] Usuário clicou na notificação.');
  event.notification.close();

  // Define a URL exata que o usuário quer que seja aberta
  const targetUrl = 'https://borisromaoantunes.github.io/agenda-e-temporada/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Faz o foco se já tiver a aba do projeto específico aberta
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('borisromaoantunes.github.io/agenda-e-temporada') && 'focus' in client) {
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

// Scripts obrigatórios e compatíveis para rodar o Service Worker em segundo plano
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// ====== CONFIGURAÇÃO DO FIREBASE (DEVEM SER IGUAIS AOS DO firebase-config.js) ======
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

  // O SDK do Firebase gera Notificações automaticamente em segundo plano 
  // caso o payload contenha o objeto "notification" (Padrão do Console do Firebase).
  // Portanto, para evitar duplicatas, nós só vamos exibir uma notificação manual 
  // se a mensagem enviada for PURAMENTE DADOS (data payload sem o objeto 'notification')
  if (!payload.notification) {
    const notificationTitle = payload.data?.title || 'Aviso OER Agenda';
    const notificationOptions = {
      body: payload.data?.body || 'Você tem uma nova mensagem.',
      icon: './assets/img/favicon-final.png', 
      badge: './assets/img/favicon-final.png',
      data: {
        click_action: payload.data?.click_action || 'https://borisromaoantunes.github.io/agenda-e-temporada/'
      }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});
