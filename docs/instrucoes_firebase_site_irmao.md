# Guia de Implementação de Notificações Push (Firebase) para o Site Irmão

Este documento contém todas as instruções necessárias para que você (IA Assistente) replique exatamente o sistema de notificações Web Push que construímos no projeto "OER Agenda". Siga a risca os passos abaixo.

## 1. Tratamento do Favicon (Ícone do Push)
- É obrigatório possuir uma imagem PNG de formato quadrado (ex: 192x192 ou 512x512) com fundo sólido (idealmente opaco/branco).
- Insira este arquivo em `assets/img/favicon-final.png`.
- Adicione as seguintes tags no `<head>` do `index.html`:
```html
<link rel="icon" type="image/x-icon" href="./assets/img/favicon-final.png">
<link rel="apple-touch-icon" href="./assets/img/favicon-final.png">
```

## 2. Ajuste de Segurança (Content-Security-Policy)
Para o Firebase funcionar, você precisa atualizar a tag de `<meta http-equiv="Content-Security-Policy">` no `index.html`. Permita conexões externas (script-src e connect-src) com o Google:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://firebasestorage.googleapis.com; frame-src 'self' blob:; object-src 'self'; base-uri 'self'; form-action 'self';">
```

## 3. Configuração do SDK do Firebase (`assets/js/firebase-config.js`)
Crie no projeto o arquivo `assets/js/firebase-config.js` usando exatamente o modelo abaixo. 
**NOTA PARA A OUTRA IA:** Use as chaves abaixo CASO o site irmão vá compartilhar o *mesmo banco Firebase de disparos*. Se for criar um painel Firebase do zero para ele independente, substitua as chaves:

```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

// SUBSTITUA PELOS DADOS DO FIREBASE SE FOR PROJETO NOVO
export const firebaseConfig = {
  apiKey: "AIzaSyA_exFw1oK-xGsksVaNTr1lAYHKswzYhGM",
  authDomain: "oer-agenda.firebaseapp.com",
  projectId: "oer-agenda",
  storageBucket: "oer-agenda.firebasestorage.app",
  messagingSenderId: "1020948916905",
  appId: "1:1020948916905:web:0fe90eb1fb1b7f183c17b8"
};

// VAPID KEY PÚBLICA GERADA NA ABA CLOUD MESSAGING
const VAPID_KEY = "BBAdQPGa4tQ3tJYodKvQHLqC2T8-J38SV3U4y2HGCDgKCsH6G74Jjk8lKRPXYtZ5AbzCu7baF25rm7045PJszko";

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

window.requestFirebaseNotificationPermission = async () => {
    try {
        console.log('[Firebase] Solicitando permissão para notificações...');
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('[Firebase] Permissão concedida. Registrando SW e Gerando Token...');
            
            // Registro explícito do Service Worker suportando subdiretórios (ex GitHub Pages)
            const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
                                
            const currentToken = await getToken(messaging, { 
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration 
            });
            
            if (currentToken) {
                console.log('[Firebase] Sucesso! Token gerado:', currentToken);
                alert("🎉 Pronto! Você será avisado sempre que novos cronogramas forem disponibilizados.");
                localStorage.setItem("oer_notification_responded", "true");
                return true;
            } else {
                console.warn('[Firebase] Não foi possível gerar um token.');
            }
        } else {
            localStorage.setItem("oer_notification_declined", "true");
        }
    } catch (err) {
        console.error('[Firebase] Ocorreu um erro ao inscrever dispositivo:', err);
    }
    return false;
}

// Receptor Foreground (Quando site está na aba aberta ativa)
onMessage(messaging, (payload) => {
    alert(`Novo Aviso: ${payload.notification.title}\n\n${payload.notification.body}`);
});
```

Não se esqueça de referenciar este script como 'module' no HTML (`<script type="module" src="./assets/js/firebase-config.js"></script>`).

## 4. O Service Worker Background (`firebase-messaging-sw.js`)
Crie na **RAIZ** do projeto o arquivo `firebase-messaging-sw.js` exatamente como abaixo para garantir que cliques nas notificações reabram o site na aba correta.

```javascript
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

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // O SDK do Firebase gera Notificações automaticamente em segundo plano 
  // caso o payload contenha o objeto "notification" (Padrão do Console do Firebase).
  // Portanto, para evitar duplicatas, nós só vamos exibir uma notificação manual 
  // se a mensagem enviada for PURAMENTE DADOS (data payload sem o objeto 'notification')
  if (!payload.notification) {
    const notificationTitle = payload.data?.title || 'Aviso Agenda';
    const notificationOptions = {
      body: payload.data?.body || 'Você tem uma nova mensagem.',
      icon: './assets/img/favicon-final.png', 
      badge: './assets/img/favicon-final.png',
      data: {
        click_action: payload.data?.click_action || 'https://link-oficial-do-seu-novo-site.com'
      }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // Define a URL padrão do app
  let targetUrl = 'https://link-oficial-do-seu-novo-site.com/';

  // Tenta pegar a URL de redirecionamento, se fornecida no payload ou fcmOptions
  if (event.notification.data && event.notification.data.click_action) {
      targetUrl = event.notification.data.click_action;
  } else if (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.notification && event.notification.data.FCM_MSG.notification.click_action) {
      targetUrl = event.notification.data.FCM_MSG.notification.click_action;
  }

  // Prevenção extra caso o Console do Firebase force a raiz do domínio (comum no Github Pages)
  if (targetUrl === 'https://seu-dominio-raiz-aqui.com' || targetUrl === 'https://seu-dominio-raiz-aqui.com/') {
      targetUrl = 'https://link-oficial-do-seu-novo-site.com/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('link-oficial-do-seu-novo-site.com') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
```

## 5. Restrição do iOS e Configuração do Front-End

Para que as notificações funcionem de maneira adequada nos aparelhos da Apple (iPhone/iPad), há algumas regras estritas da plataforma (somente funciona se o site for adicionado como aplicativo PWA na tela inicial do dispositivo). Implemente o seguinte:

### 5.1 Configuração Visual Nível Sistema (HTML)
No arquivo `index.html`, abaixo dos favicons ou tags de meta globais, inclua estas configurações nativas da Apple. É isto que garante que, ao usuário clicar em "Adicionar à Tela de Início", um nome curto e limpo já venha pré-preenchido para o seu aplicativo:
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="OER Agenda"> <!-- Troque para o nome real desejado -->
```

### 5.2 Lógica do Backend e Gatilho (Front-End)
Ao gerenciar em que momento solicitar de fato a permissão, implemente a seguinte detecção:

1. Detecte se é dispositivo iOS analisando o `userAgent` (`/iPad|iPhone|iPod/.test(userAgent)`).
2. Detecte se ele está no "Modo Aplicativo" da tela de início (Standalone) usando `window.navigator.standalone`.
3. Assinale a ação de notificação (o clique para assinar/aceitar) lidando com dois cenários:
   - **Se for iOS e NÃO FOR Standalone:** Isso significa que o usuário usou o site padrão (Safari via Link). Você deve exibir um Modal Customizado na tela que ensina que a Apple exige um passo a mais.
   - **Neste modal, alerte o usuário explicitamente os seguintes 4 passos:**
      1. Tocar no botão de *Compartilhar* (ícone quadrado ou "Três pontinhos") da barra do Safari.
      2. Escolher *"Adicionar à Tela de Início"*.
      3. Sair do navegador, abrir a Tela Inicial do aparelho e **abrir o aplicativo novo gerado**. 
      4. **Dentro desse aplicativo novo**, indicar que ele deve *clicar novamente no botão que assina notificações* e conceder a permissão final no prompt nativo da Apple. (Esse é o passo que as pessoas mais se esquecem).
   - **Qualquer outro cenário:** (Android, Desktop, ou se for PWA em iOS), dispare o script do Firebase: `window.requestFirebaseNotificationPermission()` para subir a requisição nativa.

### 5.3 Persistência da Animação do Sino (UI)
Se você estiver utilizando um sino ou botão que balança para chamar a atenção, precisa garantir que ele pare de balançar se o usuário recarregar a página e já tiver lidado com isso. Adicione a seguinte checagem antes de disparar seus eventos visuais do Sino:

```javascript
document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('btnNotificationTrigger');
    const badge = document.getElementById('notificationBadge');

    if (!trigger) return;

    // Se o usuário tem no localStorage o aviso de opt-in ou opt-out registrado
    if (localStorage.getItem("oer_notification_responded") || localStorage.getItem("oer_notification_declined")) {
        trigger.classList.remove('shake'); // ou sua-classe-de-balanco
        if (badge) badge.style.display = 'none'; // Esconde a bolinha '1'
    }
});
```
