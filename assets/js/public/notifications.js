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
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const messaging = getMessaging(app);

// ====== PERMISSÃO DE NOTIFICAÇÕES ======

// Função global para ser chamada pelo botão "Sim"
window.requestFirebaseNotificationPermission = async () => {
    try {
        console.log('[Firebase] Solicitando permissão para notificações...');
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
                const db = getFirestore(app);
                try {
                    await setDoc(doc(db, "fcmTokens", currentToken), {
                        token: currentToken,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    console.log('[Firebase] Token salvo com sucesso no banco de dados.');
                } catch (dbError) {
                    console.error('[Firebase] Erro ao salvar token no banco:', dbError);
                }

                alert("🎉 Pronto! Você será avisado sempre que novos cronogramas forem disponibilizados.");
                
                // Grava no localStorage que o usuário já aceitou, para esconder o painel
                localStorage.setItem("oer_notification_responded", "true");
                return true;
            } else {
                console.warn('[Firebase] Não foi possível gerar um token.');
            }
        } else {
            console.warn('[Firebase] Permissão de notificação negada pelo usuário.');
            localStorage.setItem("oer_notification_declined", "true");
        }
    } catch (err) {
        console.error('[Firebase] Ocorreu um erro ao inscrever dispositivo:', err);
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

    // Se a pessoa já decidiu por Sim ou Não antes, para o tremor ao abrir a página
    if (localStorage.getItem("oer_notification_responded") || localStorage.getItem("oer_notification_declined")) {
        trigger.classList.remove('shake');
        if (badge) badge.style.display = 'none';
    }

    // Abrir/Fechar painel ao clicar no sino
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('show');
        
        // Pausar a movimentação bruta do sino quando o painel estiver aberto pra não incomodar a leitura
        if (panel.classList.contains('show')) {
            trigger.classList.add('no-anim');
        } else if (!trigger.classList.contains('shake')) {
            trigger.classList.remove('no-anim');
        }
    });

    // Fechar painel se o usuário clicar numa parte cinza/fora do balãozinho
    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && !trigger.contains(e.target)) {
            panel.classList.remove('show');
            if (!trigger.classList.contains('shake')) {
                trigger.classList.remove('no-anim'); // volta pulso normal caso já tenha resolvido a pendência
            }
        }
    });

    // Ações dos botões (Sim / Agora não)
    const handleChoice = () => {
        panel.classList.remove('show');
        trigger.classList.remove('shake');       // Finalizou tarefa: retira o shake do sino permanente
        trigger.classList.remove('no-anim');     // Retorna somente a pulsação de luz do botão
        if (badge) badge.style.display = 'none'; // Esconde a notificação "1" pendente
    };

    if (btnNo) btnNo.addEventListener('click', handleChoice);

    if (btnYes) {
        btnYes.addEventListener('click', () => {
            handleChoice(); // Sempre removemos o balãozinho e paramos o tremer do sino
            
            // Chama a solicitação real de Push Notifications do Firebase
            if (window.requestFirebaseNotificationPermission) {
                window.requestFirebaseNotificationPermission();
            } else {
                console.warn("Firebase não inicializado a tempo.");
            }
        });
    }
});
