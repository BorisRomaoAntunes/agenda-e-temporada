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
import { getFirestore, doc, setDoc, onSnapshot, collection, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const messaging = getMessaging(app);
const db = getFirestore(app);

const notifContainer = document.querySelector('.notification-container');
const settingsRef = doc(db, 'config', 'settings');

// Variável para rastrear o estado global do admin
let lastAdminSettings = {};

// Função centralizada para verificar o estado e visibilidade
window.updateNotificationBellState = () => {
    const trigger = document.getElementById('btnNotificationTrigger');
    const badge = document.getElementById('notificationBadge');
    if (!notifContainer || !trigger) return;

    const adminEnabled = lastAdminSettings.notificationsEnabled === true;
    const hasNotificationApi = "Notification" in window;
    const userGranted = hasNotificationApi && Notification.permission === "granted";

    // O botão (container) só deve aparecer se o admin habilitou E o usuário NÃO habilitou ainda
    if (adminEnabled && !userGranted) {
        notifContainer.removeAttribute('hidden');
        notifContainer.style.display = 'block';

        // Garante que as animações e badge estejam ativos (conforme pedido: balançando e widget +1)
        trigger.classList.remove('no-anim');
        trigger.classList.add('shake');
        if (badge) {
            badge.style.display = 'flex';
            badge.textContent = '1';
        }
    } else {
        // Se o admin desligou OU o usuário já habilitou, escondemos tudo
        notifContainer.setAttribute('hidden', '');
        notifContainer.style.display = 'none';
    }
};

// Escuta em tempo real: mostra/oculta elementos conforme o admin configurar
onSnapshot(settingsRef, (snap) => {
    lastAdminSettings = snap.exists() ? snap.data() : {};
    
    // 1. Controle do Botão de Notificação (Sino)
    window.updateNotificationBellState();

    // 2. Controle do Letreiro de Comunicados e Painel de Histórico
    const newsTicker = document.getElementById('newsTicker');
    const historyPanel = document.getElementById('historyPanel');
    const tickerEnabled = lastAdminSettings.tickerEnabled === true;

    if (newsTicker) {
        newsTicker.style.display = tickerEnabled ? 'flex' : 'none';
    }
    
    if (historyPanel) {
        // Se o administrador desativar o letreiro, fechamos o painel de histórico
        if (!tickerEnabled) {
            historyPanel.classList.remove('open');
        }
    }
});

// ====== LETREIRO E HISTÓRICO DE NOTIFICAÇÕES ======
const notificationsRef = collection(db, 'adminNotifications');
const qNotifications = query(notificationsRef, orderBy('createdAt', 'desc'), limit(10));

onSnapshot(qNotifications, (snapshot) => {
    const tickerText = document.getElementById('tickerText');
    const tickerTextClone = document.getElementById('tickerTextClone');
    const historyList = document.getElementById('historyList');

    if (!tickerText || !historyList) return;

    if (snapshot.empty) {
        const emptyMsg = "Nenhum comunicado no momento.";
        tickerText.textContent = emptyMsg;
        if (tickerTextClone) tickerTextClone.textContent = emptyMsg;
        historyList.innerHTML = '<div class="history-empty">Nenhum aviso encontrado.</div>';
        return;
    }

    const notifications = [];
    snapshot.forEach((doc) => {
        notifications.push(doc.data());
    });

    // 1. Atualiza o Letreiro com a notificação mais recente
    const latest = notifications[0];
    const shortMessage = latest.message ? (latest.message.length > 80 ? latest.message.substring(0, 80) + "..." : latest.message) : "";
    
    // Ícone de imagem se houver imageUrl
    const imageIconHtml = latest.imageUrl ? `
        <span class="ticker-image-icon" title="Contém imagem">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                <circle cx="9" cy="9" r="2"></circle>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
            </svg>
        </span>
    ` : '';

    const tickerHtml = `<strong>${latest.title}</strong>${shortMessage ? ': ' + shortMessage : ''}${imageIconHtml}`;
    
    tickerText.innerHTML = tickerHtml;
    if (tickerTextClone) tickerTextClone.innerHTML = tickerHtml;

    // 2. Preenche o Histórico
    historyList.innerHTML = ''; // Limpa o estado de "Carregando..."
    notifications.forEach(notif => {
        const card = document.createElement('div');
        card.className = 'history-card';
        
        // Formatar data
        let dateStr = "Data não informada";
        if (notif.createdAt) {
            let dateObj;
            if (typeof notif.createdAt.toDate === 'function') {
                dateObj = notif.createdAt.toDate();
            } else {
                dateObj = new Date(notif.createdAt);
            }
            dateStr = dateObj.toLocaleDateString('pt-BR') + ' às ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }

        const imageHtml = notif.imageUrl ? `
            <div class="history-card-image-container" onclick="openImageModal('${notif.imageUrl}')">
                <img src="${notif.imageUrl}${notif.imageUrl.includes('?') ? '&' : '?'}v=${Date.now()}" alt="Imagem do aviso">
            </div>
        ` : '';

        card.innerHTML = `
            <div class="history-card-meta">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${dateStr}
            </div>
            <div class="history-card-content">
                ${imageHtml}
                <div class="history-card-text">
                    <div class="history-card-title">${notif.title || 'Aviso'}</div>
                    <div class="history-card-body">${notif.message || ''}</div>
                </div>
            </div>
        `;
        historyList.appendChild(card);
    });
}, (error) => {
    console.error("[Firebase] Erro ao buscar histórico de notificações:", error);
    const historyList = document.getElementById('historyList');
    if(historyList) {
        historyList.innerHTML = '<div class="history-empty" style="color: red;">Erro ao carregar avisos. Tente novamente mais tarde.</div>';
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

                // Faz o botão desaparecer imediatamente
                if (window.updateNotificationBellState) window.updateNotificationBellState();
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

    // ====== INTERAÇÃO DO PAINEL DE HISTÓRICO ======
    const newsTicker = document.getElementById('newsTicker');
    const historyPanel = document.getElementById('historyPanel');
    const btnCloseHistory = document.getElementById('btnCloseHistory');

    if (newsTicker && historyPanel && btnCloseHistory) {
        // Alternar visibilidade (Toggle)
        newsTicker.addEventListener('click', () => {
            historyPanel.classList.toggle('open');
        });

        // Fechar o painel (botão X)
        btnCloseHistory.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita reativar o letreiro ao fechar
            historyPanel.classList.remove('open');
        });
    }

    // ====== LÓGICA DO SINO DE NOTIFICAÇÕES ======

    // Aplica o estado ao carregar a página
    if (window.updateNotificationBellState) window.updateNotificationBellState();

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
        if (window.updateNotificationBellState) window.updateNotificationBellState(); // Aplica a lógica de estado
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

    // ====== LÓGICA DO MODAL DE IMAGEM ======
    
    if (!document.getElementById('imageModal')) {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'imageModal';
        modalDiv.className = 'image-modal';
        modalDiv.innerHTML = `
            <div class="image-modal-content">
                <button class="image-modal-close" id="closeImageModal" aria-label="Fechar visualização">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <img id="modalImage" src="" alt="Imagem ampliada">
            </div>
        `;
        document.body.appendChild(modalDiv);
        
        // Tenta criar os ícones (caso existam outros na página), mas sem travar
        try {
            if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
                lucide.createIcons();
            }
        } catch (e) {
            // Silencioso
        }
        
        // Fechar no botão X ou clicando no fundo escuro
        const closeModal = () => {
            modalDiv.classList.remove('show');
            // Pequeno delay para a animação de fade
            setTimeout(() => {
                if (!modalDiv.classList.contains('show')) {
                    modalDiv.style.display = 'none';
                }
            }, 300);
        };

        document.getElementById('closeImageModal').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        });

        modalDiv.addEventListener('click', (e) => {
            // Se clicar no overlay (fundo) ou no container (se a imagem falhar), fecha
            if (e.target === modalDiv || e.target.id === 'imageModal') {
                closeModal();
            }
        });

        // Fechar com a tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalDiv.classList.contains('show')) {
                closeModal();
            }
        });
    }
});

// Função global para abrir o modal
window.openImageModal = (url) => {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (modal && modalImg) {
        modal.style.display = 'flex';
        // Força reflow para animação
        modal.offsetHeight;
        modalImg.src = url;
        modal.classList.add('show');
    }
};
