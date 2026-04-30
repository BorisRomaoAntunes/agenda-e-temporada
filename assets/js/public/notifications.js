/**
 * notifications.js — Lógica de Notificações Push (FCM)
 * Localização: assets/js/public/
 * 
 * Responsável por:
 * 1. Registrar o Service Worker do FCM
 * 2. Solicitar permissão de notificações
 * 3. Gerar token do dispositivo
 * 4. Controlar a UI do sino de notificações
 * 5. Controlar o modal de instruções iOS
 */

import { app, VAPID_KEY } from "../firebase-config.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const messaging = getMessaging(app);
const db = getFirestore(app);

// ====== CONTROLE DE VISIBILIDADE (via Firestore em tempo real) ======

const notifContainer = document.querySelector('.notification-container');
const settingsRef = doc(db, 'config', 'settings');

// Escuta em tempo real: mostra/oculta o container do sino conforme o admin configurar
onSnapshot(settingsRef, (snap) => {
    if (!notifContainer) return;
    const enabled = snap.exists() ? (snap.data().notificationsEnabled === true) : false;
    if (enabled) {
        notifContainer.removeAttribute('hidden');
    } else {
        notifContainer.setAttribute('hidden', '');
    }
});


// ====== PERMISSÃO DE NOTIFICAÇÕES ======

// Deteção se é iOS e se está instalado na Home Screen
function isIOS() {
    return [
      'iPad Simulator', 'iPhone Simulator', 'iPod Simulator',
      'iPad', 'iPhone', 'iPod'
    ].includes(navigator.platform)
    || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function isStandalone() {
    return ('standalone' in window.navigator) && (window.navigator.standalone);
}

// Função global para ser chamada pelo botão "Sim"
window.requestFirebaseNotificationPermission = async () => {
    try {
        console.log('[Firebase] Solicitando permissão para notificações...');
        
        // Verifica se API de notificação é suportada
        if (!("Notification" in window)) {
            alert("⚠️ Seu navegador atual não suporta notificações web.");
            return false;
        }

        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('[Firebase] Permissão concedida. Gerando Token...');
            
            // Registra o Service Worker explicitamente com o caminho correto do projeto!
            const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');

            // O VapidKey liga o navegador ao Firebase Console, usando nosso Service Worker customizado
            const currentToken = await getToken(messaging, { 
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });
            
            if (currentToken) {
                console.log('[Firebase] Sucesso! Token gerado:', currentToken);
                
                // Salva o token no Firestore para conseguirmos enviar mensagens para ele depois
                try {
                    await setDoc(doc(db, "fcmTokens", currentToken), {
                        token: currentToken,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    console.log('[Firebase] Token salvo com sucesso no banco de dados.');
                } catch (dbError) {
                    console.error('[Firebase] Erro ao salvar token no banco:', dbError);
                }

                alert("🎉 Tudo certo! Você receberá notificação a partir de agora quando saírem novos cronogramas.");
                
                // Grava no localStorage que o usuário já aceitou, para esconder o painel
                localStorage.setItem("oer_notification_responded", "true");
                return true;
            } else {
                console.warn('[Firebase] Não foi possível gerar um token.');
                alert("⚠️ Não conseguimos configurar as notificações. Tente novamente.");
            }
        } else {
            console.warn('[Firebase] Permissão de notificação negada pelo usuário.');
            alert("⚠️ Você negou a permissão. Para receber alertas, ative nas configurações do seu navegador.");
            localStorage.setItem("oer_notification_declined", "true");
        }
    } catch (err) {
        console.error('[Firebase] Ocorreu um erro ao inscrever dispositivo:', err);
        alert("⚠️ Houve um erro ao configurar notificações. (Tente adicionar o site à Tela de Início primeiro)");
    }
    return false;
}

// Receptor para caso a notificação chegue E o site esteja aberto na tela
onMessage(messaging, (payload) => {
    console.log('[Firebase] Mensagem recebida com o site aberto: ', payload);
    // Como o site está aberto, podemos mostrar um alerta com o título da atualização
    alert(`Novo Aviso: ${payload.notification.title}\n\n${payload.notification.body}`);
});

// ====== UI DO SINO DE NOTIFICAÇÕES ======

document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('btnNotificationTrigger');
    const panel = document.getElementById('notificationPanel');
    const btnYes = document.getElementById('btnNotifYes');
    const btnNo = document.getElementById('btnNotifNo');
    const badge = document.getElementById('notificationBadge');

    if (!trigger || !panel) return;

    // Função centralizada para verificar o estado e parar a animação
    const updateNotificationBellState = () => {
        // Verifica se a API Notification é suportada
        const hasNotificationApi = "Notification" in window;
        const permission = hasNotificationApi ? Notification.permission : "default";

        // Paramos a animação (tremor e pulso) se o usuário:
        // 1. Já concedeu permissão nativa
        // 2. Já negou a permissão nativa
        // 3. Já clicou em "Não" na nossa UI (salvo no localStorage)
        // 4. Já clicou em "Sim" na nossa UI e finalizou o fluxo (salvo no localStorage)
        if (
            permission === "granted" ||
            permission === "denied" ||
            localStorage.getItem("oer_notification_responded") ||
            localStorage.getItem("oer_notification_declined")
        ) {
            trigger.classList.remove('shake');
            trigger.classList.add('no-anim'); // Remove também o pulso, deixando "paradinho"
            if (badge) badge.style.display = 'none';
        }
    };

    // Aplica o estado ao carregar a página
    updateNotificationBellState();

    // Abrir/Fechar painel ao clicar no sino
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Se já está com "no-anim" permanente (porque já aceitou/recusou), não precisamos mexer nisso.
        // Só mexemos se ele ainda não tomou a decisão (ou seja, tá tremendo/pulsando).
        const isAlreadyStatic = trigger.classList.contains('no-anim') && !panel.classList.contains('show');

        panel.classList.toggle('show');
        
        // Pausar a movimentação bruta do sino quando o painel estiver aberto pra não incomodar a leitura
        if (!isAlreadyStatic) {
            if (panel.classList.contains('show')) {
                trigger.classList.add('no-anim');
            } else {
                trigger.classList.remove('no-anim');
            }
        }
    });

    // Fechar painel se o usuário clicar numa parte cinza/fora do balãozinho
    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && !trigger.contains(e.target)) {
            panel.classList.remove('show');
            // Se fechou clicando fora, a gente precisa voltar a animação caso não tenha resolvido a pendência
            if (!trigger.classList.contains('shake') && !localStorage.getItem("oer_notification_responded") && !localStorage.getItem("oer_notification_declined") && (!("Notification" in window) || Notification.permission === "default")) {
                 trigger.classList.remove('no-anim'); 
            }
        }
    });

    // Ações dos botões (Sim / Agora não)
    const handleChoice = () => {
        panel.classList.remove('show');
        updateNotificationBellState(); // Aplica a lógica de estado estático
    };

    if (btnNo) btnNo.addEventListener('click', handleChoice);

    if (btnYes) {
        btnYes.addEventListener('click', async () => {
            // Se for iPhone/iPad E não estiver instalado como app (PWA), mostra o passo-a-passo
            if (isIOS() && !isStandalone()) {
                document.getElementById('notif-step-1').style.display = 'none';
                document.getElementById('notif-ios-guide').style.display = 'block';
                return; // Bloqueia a execução do Notification request
            }

            handleChoice(); // Sempre removemos o balãozinho e paramos o tremer do sino
            
            // Chama a solicitação real de Push Notifications do Firebase
            if (window.requestFirebaseNotificationPermission) {
                await window.requestFirebaseNotificationPermission();
            } else {
                console.warn("Firebase não inicializado a tempo.");
                alert("⚠️ Ocorreu um erro interno. Recarregue a página.");
            }
        });
    }

    // Botão de Entendi do iOS
    const btnCloseIos = document.getElementById('btnNotifCloseIos');
    if (btnCloseIos) {
        btnCloseIos.addEventListener('click', () => {
            panel.classList.remove('show');
            trigger.classList.remove('shake');
        });
    }
});
