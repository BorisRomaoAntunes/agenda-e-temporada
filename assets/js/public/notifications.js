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
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, query, orderBy, limit, getDocs, startAfter } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let messaging = null;
try {
    messaging = getMessaging(app);
} catch (e) {
    console.warn('[Notifications] Firebase Messaging não suportado neste navegador:', e.message);
}
const db = getFirestore(app);

const notifContainer = document.querySelector('.notification-container');
const settingsRef = doc(db, 'config', 'settings');

// ====== NOVAS FUNÇÕES: NOTIFICAÇÃO IN-APP, PLATAFORMA E RENOVAÇÃO DE TOKEN ======
const style = document.createElement('style');
style.textContent = `
    .in-app-notification {
        position: fixed;
        top: -100px;
        left: 50%;
        transform: translateX(-50%);
        background-color: darkred;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        transition: top 0.4s ease-in-out;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 90%;
        width: 400px;
        cursor: pointer;
    }
    .in-app-notification.show {
        top: 20px;
    }
    .in-app-notification-content {
        flex-grow: 1;
    }
    .in-app-notification-title {
        font-weight: bold;
        margin-bottom: 4px;
        font-size: 15px;
    }
    .in-app-notification-body {
        font-size: 13px;
        opacity: 0.9;
    }
    .in-app-notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
    }
`;
document.head.appendChild(style);

function showInAppNotification(title, body, linkUrl) {
    const div = document.createElement('div');
    div.className = 'in-app-notification';
    
    const content = document.createElement('div');
    content.className = 'in-app-notification-content';
    content.innerHTML = \`<div class="in-app-notification-title">\${title}</div><div class="in-app-notification-body">\${body}</div>\`;
    
    if (linkUrl) {
        div.addEventListener('click', () => window.open(linkUrl, '_blank'));
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'in-app-notification-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        div.classList.remove('show');
        setTimeout(() => div.remove(), 400);
    };
    
    div.appendChild(content);
    div.appendChild(closeBtn);
    document.body.appendChild(div);
    
    setTimeout(() => div.classList.add('show'), 100);
    
    setTimeout(() => {
        if (document.body.contains(div)) {
            div.classList.remove('show');
            setTimeout(() => div.remove(), 400);
        }
    }, 8000);
}

function detectPlatform() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document)) return 'iOS';
    if (/android/i.test(ua)) return 'Android';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
}

function detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
    return 'Unknown';
}

async function refreshTokenIfNeeded() {
    if (!messaging) return;
    if (!("Notification" in window) || Notification.permission !== 'granted') return;
    
    try {
        const registration = await navigator.serviceWorker.ready;
        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        if (!currentToken) return;

        const oldToken = localStorage.getItem('oer_fcm_token');
        if (oldToken && oldToken !== currentToken) {
            try {
                await deleteDoc(doc(db, "fcmTokens", oldToken));
            } catch (e) {
                console.error('Erro ao deletar token antigo', e);
            }
        }

        await setDoc(doc(db, "fcmTokens", currentToken), {
            token: currentToken,
            updatedAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            platform: detectPlatform(),
            browser: detectBrowser()
        }, { merge: true });

        localStorage.setItem('oer_fcm_token', currentToken);
    } catch (e) {
        console.error("Erro ao renovar token no carregamento", e);
    }
}

refreshTokenIfNeeded();

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
    const userDenied = hasNotificationApi && Notification.permission === "denied";

    // O botão (container) só deve aparecer se o admin habilitou E o usuário NÃO habilitou ainda e não bloqueou
    if (adminEnabled && !userGranted && !userDenied) {
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

        if (adminEnabled && userDenied && !sessionStorage.getItem('oer_notif_denied_banner_shown')) {
            const banner = document.createElement('div');
            banner.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(51, 51, 51, 0.95); color: #fff; padding: 12px 20px; border-radius: 8px; z-index: 9999; display: flex; gap: 10px; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 14px; max-width: 90%; text-align: left;';
            banner.innerHTML = `
                <span>Você desativou as notificações. Para receber os comunicados, ative nas configurações do navegador.</span>
                <button style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; line-height: 1; padding: 0 5px;">&times;</button>
            `;
            banner.querySelector('button').onclick = () => banner.remove();
            document.body.appendChild(banner);
            sessionStorage.setItem('oer_notif_denied_banner_shown', 'true');
        }
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

// ====== LETREIRO (OUVINTE OTIMIZADO COM SUPORTE A TEMPORÁRIOS 24H) ======
const latestNoticeRef = doc(db, 'config', 'latestNotice');
let temporaryTickerTimeout = null;

function renderTickerNotice(noticeData) {
    const tickerText = document.getElementById('tickerText');
    const tickerTextClone = document.getElementById('tickerTextClone');
    if (!tickerText) return;

    if (!noticeData || !noticeData.title) {
        const emptyMsg = "Nenhum comunicado no momento.";
        tickerText.textContent = emptyMsg;
        if (tickerTextClone) tickerTextClone.textContent = emptyMsg;
        return;
    }

    const shortMessage = noticeData.message ? (noticeData.message.length > 80 ? noticeData.message.substring(0, 80) + "..." : noticeData.message) : "";
    
    const imageIconHtml = noticeData.imageUrl ? `
        <span class="ticker-image-icon" title="Contém imagem">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                <circle cx="9" cy="9" r="2"></circle>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
            </svg>
        </span>
    ` : '';

    const linkIconHtml = (noticeData.linkUrl || noticeData.pdfUrl) ? `
        <span class="ticker-link-icon" title="Contém link">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
        </span>
    ` : '';

    const tickerHtml = `<strong>${noticeData.title}</strong>${shortMessage ? ': ' + shortMessage : ''}${imageIconHtml}${linkIconHtml}`;
    
    tickerText.innerHTML = tickerHtml;
    if (tickerTextClone) tickerTextClone.innerHTML = tickerHtml;
}

async function resolveExpiredTickerNotice(expiredNotice) {
    if (expiredNotice && expiredNotice.previousNotice) {
        renderTickerNotice(expiredNotice.previousNotice);
        return;
    }
    
    // Fallback: busca o último aviso manual no histórico
    try {
        const notificationsRef = collection(db, 'adminNotifications');
        const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(10));
        const snapshot = await getDocs(q);
        const validDoc = snapshot.docs.find(d => {
            const data = d.data();
            return !data.isTemporary && !data.isSystemNotice && data.showInTicker !== false;
        });

        if (validDoc) {
            renderTickerNotice(validDoc.data());
        } else {
            renderTickerNotice(null);
        }
    } catch (e) {
        console.warn("[Ticker] Erro ao resolver aviso expirado:", e);
        renderTickerNotice(null);
    }
}

onSnapshot(latestNoticeRef, (snap) => {
    if (temporaryTickerTimeout) {
        clearTimeout(temporaryTickerTimeout);
        temporaryTickerTimeout = null;
    }

    if (!snap.exists()) {
        renderTickerNotice(null);
        return;
    }

    const latest = snap.data();

    // Se for um aviso temporário (ex: 24h)
    if (latest.isTemporary && latest.expiresAt) {
        const expireTime = new Date(latest.expiresAt).getTime();
        const now = Date.now();
        const remainingMs = expireTime - now;

        if (remainingMs > 0) {
            // Válido dentro da janela de 24h
            renderTickerNotice(latest);

            // Agenda a reversão suave caso o usuário esteja com a página aberta
            temporaryTickerTimeout = setTimeout(() => {
                console.log("[Ticker] Aviso temporário de 24h expirou. Restaurando comunicado anterior...");
                resolveExpiredTickerNotice(latest);
            }, remainingMs);
        } else {
            // Prazo já venceu
            resolveExpiredTickerNotice(latest);
        }
    } else {
        // Comunicado normal / permanente
        renderTickerNotice(latest);
    }
});

// ====== HISTÓRICO DE NOTIFICAÇÕES (CARREGAMENTO SOB DEMANDA / PAGINAÇÃO) ======
let lastHistoryDoc = null;
let isHistoryLoading = false;
let hasMoreHistory = true;
let historyObserver = null;

let allHistoryCache = null;
let isFetchingHistoryForSearch = false;
let activeHistorySearchQuery = '';

function normalizeStr(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function buildHistoryCardElement(notif) {
    const card = document.createElement('div');
    card.className = 'history-card animate-fade-in';
    
    let dateStr = "Data não informada";
    if (notif.createdAt) {
        let dateObj = typeof notif.createdAt.toDate === 'function' ? notif.createdAt.toDate() : new Date(notif.createdAt);
        dateStr = dateObj.toLocaleDateString('pt-BR') + ' às ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    const imageHtml = notif.imageUrl ? `
        <div class="history-card-image-container" onclick="openImageModal('${notif.imageUrl}')">
            <img src="${notif.imageUrl}${notif.imageUrl.includes('?') ? '&' : '?'}v=${Date.now()}" alt="Imagem do aviso">
        </div>
    ` : '';

    const linkBtnHtml = notif.linkUrl ? `
        <a href="${notif.linkUrl}" target="_blank" class="btn-notif-link" title="Acessar Link">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6"></path>
                <path d="M10 14 21 3"></path>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            </svg>
            <span>Acessar Link</span>
        </a>
    ` : '';

    const leftColumnHtml = (imageHtml || linkBtnHtml) ? `
        <div class="history-card-left">
            ${imageHtml}
            ${linkBtnHtml}
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
            ${leftColumnHtml}
            <div class="history-card-text">
                <div class="history-card-title">${notif.title || 'Aviso'}</div>
                <div class="history-card-body">${notif.message || ''}</div>
            </div>
        </div>
    `;
    return card;
}

window.loadNotificationHistory = async (isInitial = true) => {
    // Bloqueia se já estiver carregando ou se não houver mais e for scroll
    if (isHistoryLoading) return;
    if (!hasMoreHistory && !isInitial) return;
    if (activeHistorySearchQuery && !isInitial) return; // Se estiver buscando, ignora scroll
    
    const historyList = document.getElementById('historyList');
    let sentinel = document.getElementById('historySentinel');
    let statusIndicator = document.getElementById('historyLoadStatus');
    
    if (!historyList) return;

    // Garantia de existência e posicionamento do sentinela
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'historySentinel';
        sentinel.style.height = '10px';
        sentinel.style.marginTop = '10px';
        historyList.appendChild(sentinel);
    }

    // Garantia de existência do indicador de status (spinner)
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.id = 'historyLoadStatus';
        statusIndicator.className = 'history-load-more-status';
        statusIndicator.innerHTML = '<div class="spinner"></div><span>Carregando mais...</span>';
        historyList.insertBefore(statusIndicator, sentinel);
    }

    // Função auxiliar para limpar conteúdo mantendo os elementos de controle
    const clearContent = () => {
        Array.from(historyList.childNodes).forEach(node => {
            if (node !== sentinel && node !== statusIndicator) {
                node.remove();
            }
        });
    };

    isHistoryLoading = true;

    // Se for o carregamento inicial, limpamos a lista e mostramos feedback
    if (isInitial) {
        clearContent();
        
        // Injeta Skeletons (3 itens)
        for (let i = 0; i < 3; i++) {
            const skel = document.createElement('div');
            skel.className = 'history-card skeleton-item';
            skel.innerHTML = `
                <div class="history-card-meta skeleton-box" style="width: 120px; height: 14px; border-radius: 4px;"></div>
                <div class="history-card-content">
                    <div class="history-card-text" style="width: 100%;">
                        <div class="history-card-title skeleton-box" style="width: 60%; height: 20px; border-radius: 4px; margin-bottom: 8px;"></div>
                        <div class="history-card-body skeleton-box" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 4px;"></div>
                        <div class="history-card-body skeleton-box" style="width: 80%; height: 16px; border-radius: 4px;"></div>
                    </div>
                </div>
            `;
            historyList.insertBefore(skel, statusIndicator);
        }

        lastHistoryDoc = null;
        hasMoreHistory = true;
    }

    statusIndicator.classList.remove('hidden');

    // Remove o convite de scroll se existir
    const oldHint = document.getElementById('historyScrollHint');
    if (oldHint) oldHint.remove();

    try {
        const notificationsRef = collection(db, 'adminNotifications');
        const pageSize = isInitial ? 2 : 5;
        
        let q;
        if (isInitial) {
            q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(pageSize));
        } else {
            q = query(notificationsRef, orderBy('createdAt', 'desc'), startAfter(lastHistoryDoc), limit(pageSize));
        }

        const snapshot = await getDocs(q);

        if (isInitial) {
            clearContent(); // Remove o "Carregando..."
        }

        if (snapshot.empty) {
            hasMoreHistory = false;
            statusIndicator.classList.add('hidden');
            if (isInitial) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'history-empty';
                emptyMsg.textContent = 'Nenhum aviso encontrado.';
                historyList.insertBefore(emptyMsg, statusIndicator);
            }
            isHistoryLoading = false;
            return;
        }

        lastHistoryDoc = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.docs.length < pageSize) {
            hasMoreHistory = false;
        }

        snapshot.forEach((docSnap) => {
            const notif = docSnap.data();
            const card = buildHistoryCardElement(notif);
            historyList.insertBefore(card, statusIndicator);
        });

        statusIndicator.classList.add('hidden');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        if (hasMoreHistory) {
            const scrollHint = document.createElement('div');
            scrollHint.id = 'historyScrollHint';
            scrollHint.className = 'history-scroll-hint';
            scrollHint.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m7 13 5 5 5-5"/><path d="m7 6 5 5 5-5"/></svg>
                <span>Role para ver mais avisos</span>
            `;
            scrollHint.onclick = () => window.loadNotificationHistory(false);
            historyList.insertBefore(scrollHint, statusIndicator);
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }

        if (isInitial) {
            initHistoryObserver();
        }

    } catch (error) {
        console.error("[Firebase] Erro ao buscar histórico:", error);
        if (isInitial) {
            clearContent();
            const errorMsg = document.createElement('div');
            errorMsg.className = 'history-empty';
            errorMsg.style.color = 'red';
            errorMsg.textContent = 'Erro ao carregar avisos.';
            historyList.insertBefore(errorMsg, statusIndicator);
        }
    } finally {
        isHistoryLoading = false;
    }
};

function initHistoryObserver() {
    const sentinel = document.getElementById('historySentinel');
    if (!sentinel) return;

    if (historyObserver) historyObserver.disconnect();

    historyObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isHistoryLoading && hasMoreHistory && !activeHistorySearchQuery) {
            console.log("[History] Sentinela visível, carregando mais...");
            window.loadNotificationHistory(false);
        }
    }, {
        root: document.getElementById('historyList'),
        rootMargin: '100px', // Carrega um pouco antes de chegar ao fim
        threshold: 0.1
    });

    historyObserver.observe(sentinel);
}

function initHistorySearch() {
    const searchInput = document.getElementById('history-search');
    if (!searchInput) return;

    let debounceTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            const term = searchInput.value.trim();
            const historyList = document.getElementById('historyList');
            const sentinel = document.getElementById('historySentinel');
            const statusIndicator = document.getElementById('historyLoadStatus');
            if (!historyList) return;

            // Se o campo estiver vazio, restaura o estado paginado normal
            if (!term) {
                activeHistorySearchQuery = '';
                // Limpa mensagem de vazio
                const emptyMsg = historyList.querySelector('.history-search-empty');
                if (emptyMsg) emptyMsg.remove();
                
                // Recarrega histórico normal
                window.loadNotificationHistory(true);
                return;
            }

            activeHistorySearchQuery = term;
            const normalizedQuery = normalizeStr(term);
            const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

            // Se o cache estiver vazio, busca até 100 avisos do Firestore
            if (!allHistoryCache) {
                // Skeletons temporários durante a busca
                // Limpa conteúdo atual mantendo sentinel e statusIndicator
                Array.from(historyList.childNodes).forEach(node => {
                    if (node !== sentinel && node !== statusIndicator) {
                        node.remove();
                    }
                });

                // Injeta Skeletons (3 itens)
                for (let i = 0; i < 3; i++) {
                    const skel = document.createElement('div');
                    skel.className = 'history-card skeleton-item';
                    skel.innerHTML = `
                        <div class="history-card-meta skeleton-box" style="width: 120px; height: 14px; border-radius: 4px;"></div>
                        <div class="history-card-content">
                            <div class="history-card-text" style="width: 100%;">
                                <div class="history-card-title skeleton-box" style="width: 60%; height: 20px; border-radius: 4px; margin-bottom: 8px;"></div>
                                <div class="history-card-body skeleton-box" style="width: 100%; height: 16px; border-radius: 4px; margin-bottom: 4px;"></div>
                                <div class="history-card-body skeleton-box" style="width: 80%; height: 16px; border-radius: 4px;"></div>
                            </div>
                        </div>
                    `;
                    historyList.insertBefore(skel, statusIndicator);
                }

                if (statusIndicator) statusIndicator.classList.remove('hidden');

                try {
                    isFetchingHistoryForSearch = true;
                    const notificationsRef = collection(db, 'adminNotifications');
                    const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(100));
                    const snapshot = await getDocs(q);
                    
                    allHistoryCache = [];
                    snapshot.forEach(doc => {
                        allHistoryCache.push(doc.data());
                    });
                } catch (err) {
                    console.error("Erro ao buscar histórico para pesquisa: ", err);
                    Array.from(historyList.childNodes).forEach(node => {
                        if (node !== sentinel && node !== statusIndicator) {
                            node.remove();
                        }
                    });
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'history-empty';
                    errorMsg.style.color = 'red';
                    errorMsg.textContent = 'Erro ao carregar busca.';
                    historyList.insertBefore(errorMsg, statusIndicator);
                    isFetchingHistoryForSearch = false;
                    return;
                } finally {
                    isFetchingHistoryForSearch = false;
                }
            }

            // Filtragem local
            const matchedNotifs = allHistoryCache.filter(notif => {
                // Formata a data para pesquisa também se ela for informada
                let dateStr = "";
                if (notif.createdAt) {
                    let dateObj = typeof notif.createdAt.toDate === 'function' ? notif.createdAt.toDate() : new Date(notif.createdAt);
                    dateStr = dateObj.toLocaleDateString('pt-BR');
                }

                const searchContent = normalizeStr([
                    notif.title || '',
                    notif.message || '',
                    notif.ocrText || '',
                    dateStr
                ].join(' '));

                return queryTokens.every(token => searchContent.includes(token));
            });

            // Se o usuário limpou/alterou a pesquisa enquanto a busca terminava, abortamos o render
            if (activeHistorySearchQuery !== term) return;

            // Limpa tudo menos sentinel e statusIndicator
            Array.from(historyList.childNodes).forEach(node => {
                if (node !== sentinel && node !== statusIndicator) {
                    node.remove();
                }
            });

            if (statusIndicator) statusIndicator.classList.add('hidden');

            // Esconde dica de scroll
            const oldHint = document.getElementById('historyScrollHint');
            if (oldHint) oldHint.remove();

            if (matchedNotifs.length === 0) {
                const div = document.createElement('div');
                div.className = 'history-search-empty';
                div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search-x"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="m8 8 6 6"/><path d="m14 8-6 6"/></svg> Nenhum resultado encontrado para "${term}".`;
                historyList.insertBefore(div, statusIndicator);
            } else {
                matchedNotifs.forEach(notif => {
                    const card = buildHistoryCardElement(notif);
                    historyList.insertBefore(card, statusIndicator);
                });
            }

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }, 300);
    });
}



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
        if (!messaging) {
            alert("⚠️ Seu navegador não suporta notificações push. Adicione o site à Tela de Início para ativar.");
            return false;
        }

        if (lastAdminSettings.notificationsEnabled !== true) {
            alert("⚠️ As notificações push estão temporariamente desativadas pela administração.");
            return false;
        }

        console.log('[Firebase] Solicitando permissão para notificações...');
        
        // Verifica se API de notificação é suportada
        if (!("Notification" in window)) {
            alert("⚠️ Seu navegador atual não suporta notificações web.");
            return false;
        }

        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('[Firebase] Permissão concedida. Gerando Token...');
            
            // Usa o Service Worker unificado do PWA (sw.js) que já está ativo no navegador
            const registration = await navigator.serviceWorker.ready;

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
                        updatedAt: new Date().toISOString(),
                        createdAt: new Date().toISOString(),
                        lastActive: new Date().toISOString(),
                        platform: detectPlatform(),
                        browser: detectBrowser()
                    }, { merge: true });
                    console.log('[Firebase] Token salvo com sucesso no banco de dados.');
                } catch (dbError) {
                    console.error('[Firebase] Erro ao salvar token no banco:', dbError);
                }

                alert("🎉 Tudo certo! Você receberá notificação a partir de agora quando saírem novas atualizações.");
                
                // Grava no localStorage que o usuário já aceitou, para esconder o painel
                localStorage.setItem("oer_notification_responded", "true");
                localStorage.setItem('oer_fcm_token', currentToken);

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
if (messaging) {
    onMessage(messaging, (payload) => {
        if (lastAdminSettings.notificationsEnabled !== true) {
            console.log('[Firebase] Ignorando notificação recebida com o site aberto (notificações desativadas globalmente).');
            return;
        }
        console.log('[Firebase] Mensagem recebida com o site aberto: ', payload);
        const title = payload.notification?.title || payload.data?.title || 'Novo Aviso';
        const body = payload.notification?.body || payload.data?.body || '';
        const linkUrl = payload.data?.linkUrl || payload.data?.click_action || '';
        
        showInAppNotification(title, body, linkUrl);
    });
}

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
            const isOpen = historyPanel.classList.toggle('open');
            if (isOpen) {
                // Reseta busca ao abrir
                const searchInput = document.getElementById('history-search');
                if (searchInput) {
                    searchInput.value = '';
                }
                activeHistorySearchQuery = '';
                allHistoryCache = null;
                window.loadNotificationHistory(); // Dispara o carregamento apenas ao abrir
            }
        });

        // Fechar o painel (botão X)
        btnCloseHistory.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita reativar o letreiro ao fechar
            historyPanel.classList.remove('open');
            // Limpa busca ao fechar
            const searchInput = document.getElementById('history-search');
            if (searchInput) {
                searchInput.value = '';
            }
            activeHistorySearchQuery = '';
            allHistoryCache = null;
        });

        // Inicializa a barra de pesquisa
        initHistorySearch();
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
