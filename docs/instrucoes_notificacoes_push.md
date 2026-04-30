# Guia de Implementação — Notificações Push (Firebase Cloud Messaging)

Instruções extraídas e filtradas do guia original (`instrucoes_firebase_site_irmao.md`).
Contém **somente** os itens necessários para implantar o sistema de notificações Web Push com Firebase.

---

## 1. Ícone da Notificação (Favicon)

- Ter uma imagem PNG quadrada (192×192 ou 512×512) com fundo sólido/opaco.
- Salvar em `assets/img/favicon-final.png`.
- Adicionar no `<head>` do `index.html`:

```html
<link rel="icon" type="image/x-icon" href="./assets/img/favicon-final.png">
<link rel="apple-touch-icon" href="./assets/img/favicon-final.png">
```

---

## 2. Content-Security-Policy (Permitir Firebase)

Atualizar a tag `<meta http-equiv="Content-Security-Policy">` no `index.html` para permitir conexões com os servidores do Google/Firebase:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://firebasestorage.googleapis.com; frame-src 'self' blob:; object-src 'self'; base-uri 'self'; form-action 'self';">
```

---

## 3. Configuração do SDK Firebase (`assets/js/firebase-config.js`)

Criar o arquivo `assets/js/firebase-config.js`:

> **IMPORTANTE:** Substitua as chaves abaixo pelas do seu projeto Firebase se for independente. Se compartilhar o mesmo banco de disparos, use as mesmas.

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

Referenciar no HTML como módulo:
```html
<script type="module" src="./assets/js/firebase-config.js"></script>
```

---

## 4. Service Worker Background (`firebase-messaging-sw.js`)

Criar na **RAIZ** do projeto o arquivo `firebase-messaging-sw.js`:

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
  // Evita duplicatas: só exibe notificação manual se for data-only (sem objeto 'notification')
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

  // Prevenção extra caso o Console do Firebase force a raiz do domínio
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

---

## 5. Suporte iOS — PWA Obrigatório

No iOS, notificações push **só funcionam** se o site for adicionado como PWA na tela inicial.

### 5.1 Meta Tags Apple (no `<head>` do `index.html`)

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="OER Agenda"> <!-- Troque para o nome desejado -->
```

### 5.2 Lógica de Detecção iOS no Front-End

Implementar a seguinte lógica ao solicitar permissão:

1. Detectar se é iOS: `/iPad|iPhone|iPod/.test(userAgent)`
2. Detectar se está em modo Standalone (PWA): `window.navigator.standalone`
3. Dois cenários:
   - **iOS + NÃO Standalone (Safari comum):** Exibir modal com 4 passos:
     1. Tocar no botão de *Compartilhar* (ícone quadrado ou "Três pontinhos")
     2. Escolher *"Adicionar à Tela de Início"*
     3. Sair do navegador e abrir o app gerado na tela inicial
     4. **Dentro do app novo**, clicar novamente no botão de notificações e conceder permissão
   - **Qualquer outro caso** (Android, Desktop, PWA iOS): Disparar `window.requestFirebaseNotificationPermission()`

### 5.3 Persistência Visual do Sino (UI)

Impedir que o sino continue balançando após o usuário já ter respondido:

```javascript
document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('btnNotificationTrigger');
    const badge = document.getElementById('notificationBadge');

    if (!trigger) return;

    // Se o usuário já respondeu (opt-in ou opt-out)
    if (localStorage.getItem("oer_notification_responded") || localStorage.getItem("oer_notification_declined")) {
        trigger.classList.remove('shake');
        if (badge) badge.style.display = 'none';
    }
});
```

---

## Checklist Resumido

- [ ] Favicon PNG quadrado em `assets/img/favicon-final.png`
- [ ] Content-Security-Policy atualizada no `index.html`
- [ ] `assets/js/firebase-config.js` criado e referenciado como `<script type="module">`
- [ ] `firebase-messaging-sw.js` criado na **raiz** do projeto
- [ ] Meta tags Apple adicionadas no `<head>`
- [ ] Lógica de detecção iOS implementada (modal de instrução)
- [ ] Persistência visual do sino no `localStorage`
- [ ] URLs placeholder (`link-oficial-do-seu-novo-site.com`) substituídas pela URL real
