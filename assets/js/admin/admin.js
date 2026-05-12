/**
 * admin.js — Painel Administrativo OER
 * Localização: assets/js/admin/
 * 
 * Responsável por:
 * - Autenticação (login/logout)
 * - Upload de PDFs para Firebase Storage
 * - Atualização de versões no Firestore
 */

import { app, auth, db, functions, storage } from "../firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

import { 
    doc, 
    setDoc, 
    getDoc,
    collection,
    addDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    limit,
    startAfter,
    getDocs,
    updateDoc,
    serverTimestamp,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytesResumable, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { 
    httpsCallable 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

// Inicializa serviços Firebase a partir da instância centralizada
// O storage já é importado do firebase-config.js

// Referências DOM
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');
const notificationArea = document.getElementById('notification-area');

// Novas referências para imagem na notificação
const inputNotifImage = document.getElementById('notif-image');
const notifImagePreviewContainer = document.getElementById('notif-image-preview-container');
const notifImagePreview = document.getElementById('notif-image-preview');
const btnRemoveNotifImage = document.getElementById('btn-remove-notif-image');
const notifImageDropArea = document.getElementById('notif-image-drop-area');

// Referências para o Modal de Ajustes
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const toggleNotifBtn = document.getElementById('toggle-notif-btn');
const toggleStatusText = document.getElementById('toggle-status-text');
const toggleTickerBtn = document.getElementById('toggle-ticker-btn');
const toggleTickerStatusText = document.getElementById('toggle-ticker-status-text');

let selectedNotifImage = null;

// ================= AUTHENTICATION =================

let unsubscribeToggle = null; // Guarda o listener do toggle para poder cancelar no logout
let unsubscribeSubscribers = null; // Guarda o listener de assinantes
let unsubscribeLinks = null; // Guarda o listener de links temporários

// Observador de estado de autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logado
        loginContainer.classList.remove('active');
        dashboardContainer.classList.add('active');
        document.getElementById('user-email').textContent = user.email;
        initToggleListener(); // Inicia o toggle só após autenticação
        initSubscriberCounter(); // Inicia o contador de assinantes
        loadLogs(); // Carrega o histórico de logs ao logar
        loadAdminNotifications(); // Carrega a lista de notificações ativas
        setupLinks(); // Inicia configurações e listagem dos links temporários
        initManualRobot(); // Inicia o Robô OER Manual
        initLogFilters(); // Inicia os filtros do histórico
        initLogSearch();  // Inicia o campo de busca no histórico
        initScheduleUI(); // Inicia a UI de agendamento de notificações
        initSettingsModal(); // Inicia a lógica do modal de ajustes
        syncTickerWithLatest(); // Força sincronização do letreiro na inicialização
    } else {
        // Não logado
        dashboardContainer.classList.remove('active');
        loginContainer.classList.add('active');
        if (unsubscribeToggle) { unsubscribeToggle(); unsubscribeToggle = null; }
        if (unsubscribeSubscribers) { unsubscribeSubscribers(); unsubscribeSubscribers = null; }
        if (unsubscribeLinks) { unsubscribeLinks(); unsubscribeLinks = null; }
    }
});

// Submit de Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('btn-login');
    const errorMsg = document.getElementById('login-error');

    btn.disabled = true;
    btn.innerHTML = 'Conectando...';
    errorMsg.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        errorMsg.textContent = 'Erro: ' + (error.code || error.message);
        console.error("Login erro completo:", error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Entrar <i data-lucide="arrow-right"></i>';
        lucide.createIcons();
    }
});

// Logout
btnLogout.addEventListener('click', () => signOut(auth));

// ================= TOGGLE PASSWORD =================
const btnTogglePassword = document.getElementById('btn-toggle-password');
const passwordInput = document.getElementById('password');

btnTogglePassword.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    // Troca o ícone do olho
    btnTogglePassword.innerHTML = isPassword 
        ? '<i data-lucide="eye-off"></i>' 
        : '<i data-lucide="eye"></i>';
    lucide.createIcons();
});

// ================= UPLOAD LOGIC =================

const setupUploader = (type) => {
    const fileInput = document.getElementById(`file-${type}`);
    const btnUpload = document.querySelector(`.btn-upload[data-type="${type}"]`);
    const dropArea = fileInput.nextElementSibling;
    const msgElement = dropArea.querySelector('.file-msg');
    const progressBar = document.getElementById(`progress-${type}`);
    const progressContainer = progressBar.parentElement;
    const versionInput = document.getElementById(`version-${type}`);
    const btnUpdateVersion = document.querySelector(`.btn-update-version[data-type="${type}"]`);

    let selectedFile = null;

    // Quando um arquivo for selecionado
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const MAX_SIZE_MB = 5;
            const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

            if (file.size > MAX_SIZE_BYTES) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                showNotification(`Atenção: O arquivo é grande (${sizeMB}MB). O limite ideal é ${MAX_SIZE_MB}MB para garantir a performance nos celulares dos músicos. Considere otimizar o PDF antes de enviar.`, 'warning');
            }

            selectedFile = file;
            msgElement.textContent = selectedFile.name;
            dropArea.classList.add('has-file');
            btnUpload.disabled = false;
        } else {
            selectedFile = null;
            msgElement.textContent = 'Clique ou arraste o PDF aqui';
            dropArea.classList.remove('has-file');
            btnUpload.disabled = true;
        }
    });

    // Quando clica no botão de Upload
    btnUpload.addEventListener('click', async () => {
        if (!selectedFile) return;

        let displayVersion = versionInput.value.trim();
        displayVersion = displayVersion.replace(',', '.').replace(/[^\d\.]/g, '');
        
        if (!displayVersion) {
            showNotification('Por favor, informe a versão (ex: 1.1) contendo apenas números e pontos.', 'error');
            return;
        }

        // Gerar timestamp para o arquivo (Anti-Cache)
        const timestamp = Date.now();
        const extension = selectedFile.name.split('.').pop();
        // Dynamic Filenaming: ex: agenda_v1712859012.pdf
        const newFileName = `${type}_v${timestamp}.${extension}`;
        
        // Desativa botões durante upload
        btnUpload.disabled = true;
        fileInput.disabled = true;
        versionInput.disabled = true;
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';

        // Referência do Storage (salvaremos na pasta pdfs/)
        const storageRef = ref(storage, `pdfs/${newFileName}`);
        const uploadTask = uploadBytesResumable(storageRef, selectedFile);

        uploadTask.on('state_changed', 
            (snapshot) => {
                // Progresso visual
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = progress + '%';
            }, 
            (error) => {
                showNotification(`Erro ao enviar ${type}: ${error.message}`, 'error');
                resetUploader();
            }, 
            async () => {
                // Upload completo! Pega a URL.
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    
                    // Salva no Banco de Dados (Firestore)
                    await updateFirestoreData(type, downloadURL, newFileName, timestamp, displayVersion);
                    
                    showNotification(`${type.toUpperCase()} atualizado com sucesso! Os músicos já estão vendo a nova versão.`, 'success');
                    resetUploader();
                } catch (dbError) {
                    showNotification(`Erro ao gravar no banco: ${dbError.message}`, 'error');
                    resetUploader();
                }
            }
        );
    });

    // Quando clica no botão de Atualizar Versão (Apenas Versão)
    btnUpdateVersion.addEventListener('click', async () => {
        let displayVersion = versionInput.value.trim();
        displayVersion = displayVersion.replace(',', '.').replace(/[^\d\.]/g, '');
        
        if (!displayVersion) {
            showNotification('Por favor, informe a versão (ex: 1.1) contendo apenas números e pontos.', 'error');
            return;
        }

        btnUpdateVersion.disabled = true;
        btnUpdateVersion.innerHTML = '<i data-lucide="loader"></i> Salvando...';
        lucide.createIcons();

        try {
            await updateFirestoreVersionOnly(type, displayVersion);
            showNotification(`Versão da ${type.toUpperCase()} atualizada para v${displayVersion}!`, 'success');
            versionInput.value = '';
        } catch (dbError) {
            showNotification(`Erro ao atualizar versão: ${dbError.message}`, 'error');
        } finally {
            btnUpdateVersion.disabled = false;
            btnUpdateVersion.innerHTML = '<i data-lucide="refresh-cw"></i> Atualizar Versão';
            lucide.createIcons();
        }
    });

    function resetUploader() {
        selectedFile = null;
        fileInput.value = '';
        versionInput.value = '';
        msgElement.textContent = 'Clique ou arraste o PDF aqui';
        dropArea.classList.remove('has-file');
        btnUpload.disabled = true;
        fileInput.disabled = false;
        versionInput.disabled = false;
        setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);
    }
};

// ================= FIRESTORE UPDATE =================

async function updateFirestoreData(type, url, filename, timestamp, displayVersion) {
    const configRef = doc(db, 'config', 'pdfs');
    
    // Pega o documento atual, se existir, para não apagar o outro PDF
    const docSnap = await getDoc(configRef);
    let currentData = docSnap.exists() ? docSnap.data() : { pdfs: {} };
    if (!currentData.pdfs) currentData.pdfs = {};

    // Atualiza a chave específica (agenda ou temporada)
    currentData.pdfs[type] = {
        arquivo: filename,
        url: url,
        version: timestamp,
        displayVersion: displayVersion || String(timestamp),
        updatedAt: new Date().toISOString()
    };

    // Grava de volta
    await setDoc(configRef, currentData);
    
    // Grava no Log Histórico
    await saveLog('pdf', `Novo PDF enviado para ${type.toUpperCase()}: v${currentData.pdfs[type].displayVersion}`, url);

    // Robô OER: Removido gatilho automático para evitar interrupções
    console.log(`🤖 [Robô OER] Upload de ${type} concluído. O Robô aguarda acionamento manual.`);
    // await triggerAISuggestion(type === 'agenda' ? 'Agenda' : 'Temporada', currentData.pdfs[type].displayVersion);
}

async function updateFirestoreVersionOnly(type, displayVersion) {
    const configRef = doc(db, 'config', 'pdfs');
    
    const docSnap = await getDoc(configRef);
    if (!docSnap.exists() || !docSnap.data().pdfs || !docSnap.data().pdfs[type]) {
        throw new Error('Nenhum PDF encontrado no banco para atualizar a versão. Faça o upload primeiro.');
    }

    let currentData = docSnap.data();
    currentData.pdfs[type].displayVersion = displayVersion;
    currentData.pdfs[type].updatedAt = new Date().toISOString();

    await setDoc(configRef, currentData);
    
    // Grava no Log Histórico
    await saveLog('pdf', `Versão de ${type.toUpperCase()} atualizada manualmente para v${displayVersion}`);

    // Robô OER: Removido gatilho automático para evitar interrupções
    console.log(`🤖 [Robô OER] Atualização de versão de ${type} concluída. O Robô aguarda acionamento manual.`);
    // await triggerAISuggestion(type === 'agenda' ? 'Agenda' : 'Temporada', displayVersion);
}

/**
 * Robô OER: Sugere uma notificação com IA após alteração de sistema.
 */
async function triggerAISuggestion(type, version) {
    console.log("🤖 [Robô OER] Iniciando triggerAISuggestion...", { type, version });
    
    const titleInput = document.getElementById('notif-title');
    const messageInput = document.getElementById('notif-message');
    const btnRobot = document.getElementById('btn-ai-robot');

    if (!titleInput || !messageInput) {
        console.error("🤖 [Robô OER] Inputs de notificação não encontrados no DOM.");
        return;
    }

    // 1. Estado de carregamento visual no botão
    if (btnRobot) {
        btnRobot.classList.add('loading');
        btnRobot.disabled = true;
    }

    // 2. Rola até o formulário e foca
    setTimeout(() => {
        titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        titleInput.focus();
    }, 300);

    // 3. Estado de carregamento nos campos
    const originalTitlePlaceholder = titleInput.placeholder;
    const originalMessagePlaceholder = messageInput.placeholder;
    
    titleInput.value = '';
    messageInput.value = '';
    titleInput.placeholder = "🤖 Robô OER: Gerando sugestão com IA...";
    messageInput.placeholder = "Aguarde um instante, estou afinando as palavras...";
    titleInput.disabled = true;
    messageInput.disabled = true;

    try {
        console.log("🤖 [Robô OER] Chamando Cloud Function suggestNotificationText...");
        const suggestText = httpsCallable(functions, 'suggestNotificationText');
        const result = await suggestText({ type, version });
        
        console.log("🤖 [Robô OER] Resposta da IA recebida com sucesso.");
        const { title, message } = result.data;
        
        // 4. Preenche os campos
        titleInput.value = title || "";
        messageInput.value = message || "";
        
        showNotification('O Robô OER sugeriu um aviso baseado na última atualização!', 'success');
    } catch (error) {
        console.error("🤖 [Robô OER] Erro crítico na sugestão de IA:", error);
        
        let errorUserMsg = 'Não foi possível gerar a sugestão automática.';
        if (error.message.includes('unauthenticated')) errorUserMsg += ' (Erro de Autenticação)';
        
        showNotification(errorUserMsg, 'error');

        // Fallback
        titleInput.value = `Atualização: ${type} v${version}`;
        messageInput.value = `A ${type} foi atualizada para a versão v${version}. Confira os detalhes no site!`;
    } finally {
        titleInput.disabled = false;
        messageInput.disabled = false;
        titleInput.placeholder = originalTitlePlaceholder;
        messageInput.placeholder = originalMessagePlaceholder;
        
        if (btnRobot) {
            btnRobot.classList.remove('loading');
            btnRobot.disabled = false;
        }
        console.log("🤖 [Robô OER] Fluxo finalizado.");
    }
}

/**
 * Busca a atualização mais recente nos logs para o Robô OER
 */
async function getLatestUpdateInfo() {
    try {
        const logsRef = collection(db, 'adminLogs');
        // Busca o log de PDF mais recente
        const q = query(logsRef, orderBy('createdAt', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);
        
        let latestPdfLog = null;
        querySnapshot.forEach(doc => {
            if (!latestPdfLog && (doc.data().type === 'pdf')) {
                latestPdfLog = doc.data();
            }
        });

        if (!latestPdfLog) return null;

        // Extrai Tipo e Versão usando Regex
        const msg = latestPdfLog.message;
        const typeMatch = msg.match(/(AGENDA|TEMPORADA)/i);
        const versionMatch = msg.match(/v([\d\.]+)/);

        if (typeMatch && versionMatch) {
            return {
                type: typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1).toLowerCase(),
                version: versionMatch[1]
            };
        }
        return null;
    } catch (err) {
        console.error("Erro ao buscar logs para o Robô:", err);
        return null;
    }
}

/**
 * Inicializa o acionamento manual do Robô OER
 */
function initManualRobot() {
    const btnRobot = document.getElementById('btn-ai-robot');
    if (!btnRobot) return;

    btnRobot.addEventListener('click', async () => {
        console.log("🤖 [Robô OER] Acionamento manual detectado.");
        
        btnRobot.classList.add('loading');
        btnRobot.disabled = true;

        const info = await getLatestUpdateInfo();
        
        if (info) {
            await triggerAISuggestion(info.type, info.version);
        } else {
            showNotification('Não encontrei atualizações recentes para basear a sugestão.', 'warning');
            btnRobot.classList.remove('loading');
            btnRobot.disabled = false;
        }
    });
}

// ================= NOTIFICAÇÕES PUSH =================

const btnSendNotif = document.getElementById('btn-send-notif');
const inputNotifTitle = document.getElementById('notif-title');
const inputNotifMessage = document.getElementById('notif-message');

// Lógica de Prévia da Imagem da Notificação
if (inputNotifImage) {
    inputNotifImage.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedNotifImage = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (notifImagePreview) notifImagePreview.src = event.target.result;
                if (notifImagePreviewContainer) notifImagePreviewContainer.style.display = 'block';
                if (notifImageDropArea) {
                    notifImageDropArea.classList.add('has-file');
                    notifImageDropArea.querySelector('.file-msg').textContent = selectedNotifImage.name;
                }
            };
            reader.readAsDataURL(selectedNotifImage);
        }
    });
}

if (btnRemoveNotifImage) {
    btnRemoveNotifImage.addEventListener('click', () => {
        selectedNotifImage = null;
        if (inputNotifImage) inputNotifImage.value = '';
        if (notifImagePreview) notifImagePreview.src = '';
        if (notifImagePreviewContainer) notifImagePreviewContainer.style.display = 'none';
        if (notifImageDropArea) {
            notifImageDropArea.classList.remove('has-file');
            notifImageDropArea.querySelector('.file-msg').textContent = 'Adicionar uma imagem ao aviso';
        }
    });
}

if (btnSendNotif) {
    btnSendNotif.addEventListener('click', async () => {
        const title   = inputNotifTitle.value.trim();
        const message = inputNotifMessage.value.trim();

        if (!title || !message) {
            showNotification('Por favor, preencha o título e a mensagem do aviso.', 'error');
            return;
        }

        // Verifica se o agendamento está ativo
        const scheduleData = getScheduleData();
        const isScheduled  = scheduleData !== null;

        btnSendNotif.disabled = true;
        const originalText = btnSendNotif.innerHTML;
        btnSendNotif.innerHTML = isScheduled
            ? '<i data-lucide="loader"></i> Agendando...'
            : '<i data-lucide="loader"></i> Enviando...';
        lucide.createIcons();

        try {
            // Upload de imagem (comum a ambos os fluxos)
            let imageUrl = null;
            if (selectedNotifImage) {
                const timestamp = Date.now();
                const ext       = selectedNotifImage.name.split('.').pop();
                const fileName  = `notif_${timestamp}.${ext}`;
                const storageRef = ref(storage, `notification_images/${fileName}`);
                const uploadTask = await uploadBytesResumable(storageRef, selectedNotifImage);
                imageUrl = await getDownloadURL(uploadTask.ref);
            }

            if (isScheduled) {
                // ── FLUXO DE AGENDAMENTO ──────────────────────────────────
                const fnSchedule = httpsCallable(functions, 'scheduleNotification');
                const result = await fnSchedule({
                    title,
                    message,
                    ...(imageUrl ? { imageUrl } : {}),
                    scheduledAt: scheduleData.scheduledAt
                });

                // Grava log de agendamento
                const scheduledDate = new Date(scheduleData.scheduledAt);
                const dateStr = scheduledDate.toLocaleDateString('pt-BR');
                const timeStr = scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                await saveLog(
                    'aviso',
                    `Aviso agendado: "${title}"`,
                    null,
                    `Agendado para ${dateStr} às ${timeStr}. ID: ${result.data.id}`,
                    imageUrl
                );

                showNotification(`Aviso agendado para ${dateStr} às ${timeStr}! ✅`, 'success');

                // Reseta o toggle de agendamento
                const toggleSchedule = document.getElementById('toggle-schedule');
                if (toggleSchedule) { toggleSchedule.checked = false; toggleSchedule.dispatchEvent(new Event('change')); }

            } else {
                // ── FLUXO DE ENVIO IMEDIATO ───────────────────────────────
                const notifData = {
                    title,
                    message,
                    createdAt: new Date().toISOString(),
                    sentBy: auth.currentUser ? auth.currentUser.email : 'admin',
                    ...(imageUrl ? { imageUrl } : {})
                };

                await addDoc(collection(db, 'adminNotifications'), notifData);

                // Atualiza letreiro (latestNotice)
                await setDoc(doc(db, 'config', 'latestNotice'), notifData);

                // Log histórico
                await saveLog('aviso', `Notificação push enviada: "${title}"`, null, message, imageUrl);

                showNotification('Aviso enviado para a fila de disparo! Os músicos receberão em instantes.', 'success');
            }

            // Limpa campos
            inputNotifTitle.value   = '';
            inputNotifMessage.value = '';
            if (btnRemoveNotifImage) btnRemoveNotifImage.click();

        } catch (error) {
            showNotification(`Erro: ${error.message}`, 'error');
            console.error('Erro ao processar aviso:', error);
        } finally {
            btnSendNotif.disabled    = false;
            btnSendNotif.innerHTML   = originalText;
            lucide.createIcons();
        }
    });
}

// ================= UTILIDADES =================

function showNotification(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    
    let icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';
    if (type === 'warning') icon = 'alert-triangle';
    
    alertDiv.innerHTML = `
        <div class="alert-content">
            <i data-lucide="${icon}"></i>
            <span>${message}</span>
        </div>
        <div class="alert-timer-text">Fechando em 5 segundos...</div>
    `;
    
    // Anexa a nova notificação sem apagar as antigas (Toast)
    notificationArea.appendChild(alertDiv);
    lucide.createIcons();

    setTimeout(() => {
        alertDiv.classList.add('fade-out');
        setTimeout(() => alertDiv.remove(), 400); // Aguarda o fim da animação
    }, 5000);
}

// ================= MODAL DE AJUSTES =================

function initSettingsModal() {
    // Busca referências novamente caso tenham sido capturadas como null no carregamento inicial
    const btn = btnSettings || document.getElementById('btn-settings');
    const modal = settingsModal || document.getElementById('settings-modal');
    const closeBtn = btnCloseSettings || document.getElementById('btn-close-settings');

    if (!btn || !modal || !closeBtn) {
        console.warn('[Settings] Alguns elementos do modal não foram encontrados:', { btn, modal, closeBtn });
        return;
    }

    // Evita adicionar múltiplos listeners se a função for chamada novamente
    if (btn._listenerAdded) return;
    btn._listenerAdded = true;

    btn.addEventListener('click', () => {
        console.log('[Settings] Abrindo modal de ajustes...');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Previne scroll ao fundo
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });

    const closeModal = () => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeModal);

    // Fechar ao clicar fora do card
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// ================= TOGGLE VISIBILIDADE NOTIFICAÇÕES =================
const settingsRef = doc(db, 'config', 'settings');

function initToggleListener() {
    // Cancela listener anterior se já existir
    if (unsubscribeToggle) unsubscribeToggle();

    // Escuta em tempo real o estado dos toggles
    unsubscribeToggle = onSnapshot(settingsRef, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        
        // Estado do Botão de Notificação
        const notifEnabled = data.notificationsEnabled === true;
        if (toggleNotifBtn) toggleNotifBtn.checked = notifEnabled;
        if (toggleStatusText) {
            toggleStatusText.textContent = notifEnabled
                ? '✅ Botão de notificação ATIVO no site dos músicos.'
                : '🔕 Botão de notificação DESATIVADO no site dos músicos.';
            toggleStatusText.style.color = notifEnabled ? '#2E8B57' : '#888';
        }

        // Estado do Letreiro de Comunicados
        const tickerEnabled = data.tickerEnabled === true;
        if (toggleTickerBtn) toggleTickerBtn.checked = tickerEnabled;
        if (toggleTickerStatusText) {
            toggleTickerStatusText.textContent = tickerEnabled
                ? '✅ Letreiro de comunicados ATIVO no site dos músicos.'
                : '🔕 Letreiro de comunicados DESATIVADO no site dos músicos.';
            toggleTickerStatusText.style.color = tickerEnabled ? '#2E8B57' : '#888';
        }
    }, (err) => {
        console.error('[Toggle] Erro ao ouvir config/settings:', err);
        const errorMsg = '⚠️ Erro ao carregar estado.';
        if (toggleStatusText) toggleStatusText.textContent = errorMsg;
        if (toggleTickerStatusText) toggleTickerStatusText.textContent = errorMsg;
    });

    // Evento para o Toggle de Notificações
    if (toggleNotifBtn && !toggleNotifBtn._listenerAdded) {
        toggleNotifBtn._listenerAdded = true;
        toggleNotifBtn.addEventListener('change', async () => {
            const newState = toggleNotifBtn.checked;
            try {
                await setDoc(settingsRef, { notificationsEnabled: newState }, { merge: true });
            } catch (err) {
                showNotification('Erro ao salvar configuração: ' + err.message, 'error');
                toggleNotifBtn.checked = !newState;
            }
        });
    }

    // Evento para o Toggle do Letreiro
    if (toggleTickerBtn && !toggleTickerBtn._listenerAdded) {
        toggleTickerBtn._listenerAdded = true;
        toggleTickerBtn.addEventListener('change', async () => {
            const newState = toggleTickerBtn.checked;
            try {
                await setDoc(settingsRef, { tickerEnabled: newState }, { merge: true });
            } catch (err) {
                showNotification('Erro ao salvar configuração: ' + err.message, 'error');
                toggleTickerBtn.checked = !newState;
            }
        });
    }
}

// ================= CONTADOR DE ASSINANTES (REAL-TIME) =================

function initSubscriberCounter() {
    const counterEl = document.getElementById('subscriber-count-value');
    if (!counterEl) return;

    // Cancela listener anterior se já existir
    if (unsubscribeSubscribers) unsubscribeSubscribers();

    const statsRef = doc(db, 'config', 'stats');
    
    // Escuta em tempo real o documento de estatísticas (apenas 1 leitura)
    unsubscribeSubscribers = onSnapshot(statsRef, (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : { subscriberCount: 0 };
        const count = data.subscriberCount || 0;
        
        // Atualiza o DOM com animação simples
        counterEl.innerHTML = `${count} <span>assinantes</span>`;
        
        // Log discreto para debug
        console.log(`[Admin] Contador de assinantes otimizado: ${count}`);
    }, (err) => {
        console.error('[Admin] Erro ao monitorar estatísticas:', err);
        counterEl.innerHTML = `Erro <span>na contagem</span>`;
    });
}

// Inicializa os uploaders
setupUploader('agenda');
setupUploader('temporada');

// ================= LOGS / HISTÓRICO =================
// ================= GERENCIAMENTO DE NOTIFICAÇÕES (ADMIN) =================

let activeNotifications = [];
let scheduledNotifications = [];

async function loadAdminNotifications() {
    const listEl = document.getElementById('admin-notifications-list');
    if (!listEl) return;

    const renderUnifiedList = () => {
        try {
            // Combina as listas
            const combined = [
                ...activeNotifications.map(n => ({ ...n, status: 'sent' })),
                ...scheduledNotifications.map(n => ({ ...n, status: 'pending' }))
            ];

            // Ordena por data (os agendados usam scheduledAt, os enviados usam createdAt)
            combined.sort((a, b) => {
                const dateAStr = a.status === 'pending' ? a.scheduledAt : a.createdAt;
                const dateBStr = b.status === 'pending' ? b.scheduledAt : b.createdAt;
                
                const dateA = new Date(dateAStr || 0);
                const dateB = new Date(dateBStr || 0);
                
                // Se uma data for inválida, joga para o fim
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                
                return dateB - dateA;
            });

            if (combined.length === 0) {
                listEl.innerHTML = '<div class="admin-notif-empty">Nenhum comunicado ativo no site ou agendado no momento.</div>';
                return;
            }

            listEl.innerHTML = '';
            combined.forEach((data) => {
            const isPending = data.status === 'pending';
            const dateObj = new Date(isPending ? data.scheduledAt : data.createdAt);
            const formattedDate = dateObj.toLocaleDateString('pt-BR') + ' às ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const metaLabel = isPending ? 'Agendado para ' : 'Enviado em ';
            const collectionName = isPending ? 'scheduledNotifications' : 'adminNotifications';

            const item = document.createElement('div');
            item.className = `admin-notif-item ${isPending ? 'is-pending' : ''}`;
            item.innerHTML = `
                <div class="admin-notif-content">
                    <h4 class="admin-notif-title">${data.title}</h4>
                    <p class="admin-notif-message">${data.message}</p>
                    <div class="admin-notif-meta">
                        <i data-lucide="${isPending ? 'calendar' : 'clock'}" style="width: 12px; height: 12px;"></i> ${metaLabel} ${formattedDate}
                    </div>
                </div>
                <button class="btn-delete-notif" title="${isPending ? 'Cancelar agendamento' : 'Apagar comunicado do site'}" 
                        data-id="${data.id}" data-title="${data.title}" data-collection="${collectionName}">
                    <i data-lucide="${isPending ? 'x-circle' : 'trash-2'}"></i>
                </button>
            `;
            listEl.appendChild(item);
        });

        // Adiciona listeners para os botões de deletar
        listEl.querySelectorAll('.btn-delete-notif').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.getAttribute('data-id');
                const title = btn.getAttribute('data-title');
                const collectionName = btn.getAttribute('data-collection');
                await deleteNotification(docId, title, collectionName);
            });
        });

        lucide.createIcons();
        } catch (error) {
            console.error("❌ Erro ao renderizar lista unificada:", error);
        }
    };

    // Escuta em tempo real a coleção de notificações ATIVAS
    const activeRef = collection(db, 'adminNotifications');
    const qActive = query(activeRef, orderBy('createdAt', 'desc'), limit(15));
    onSnapshot(qActive, (snapshot) => {
        activeNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[Admin] ${activeNotifications.length} avisos ativos carregados.`);
        renderUnifiedList();
    }, (error) => {
        console.error("❌ Erro ao escutar avisos ativos:", error);
    });

    // Escuta em tempo real a coleção de notificações AGENDADAS (apenas as pendentes)
    const scheduledRef = collection(db, 'scheduledNotifications');
    const qScheduled = query(scheduledRef, where('status', '==', 'pending'), limit(10));
    
    onSnapshot(qScheduled, (snapshot) => {
        scheduledNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[Admin] ${scheduledNotifications.length} avisos agendados carregados.`);
        renderUnifiedList();
    }, (error) => {
        console.error("❌ Erro ao escutar agendamentos:", error);
    });
}

async function deleteNotification(docId, title, collectionName = 'adminNotifications') {
    const isScheduled = collectionName === 'scheduledNotifications';
    const confirmMsg = isScheduled
        ? `Tem certeza que deseja cancelar o agendamento do comunicado "${title}"?\n\nEle não será enviado aos músicos.`
        : `Tem certeza que deseja apagar o comunicado "${title}"?\n\nEle desaparecerá instantaneamente do letreiro e do histórico no site dos músicos.`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        const notifRef = doc(db, collectionName, docId);
        await deleteDoc(notifRef);
        
        // Sincroniza o letreiro se for um aviso comum
        if (!isScheduled) {
            await syncTickerWithLatest();
        }

        const successMsg = isScheduled 
            ? `Agendamento "${title}" cancelado com sucesso.`
            : `Comunicado "${title}" removido com sucesso.`;
            
        showNotification(successMsg, 'success');
        
        // Grava log da remoção
        const logType = isScheduled ? 'aviso-cancelado' : 'aviso-removido';
        const logMsg = isScheduled ? `Agendamento cancelado: "${title}"` : `Comunicado removido: "${title}"`;
        const logDetails = isScheduled ? `O administrador cancelou um envio programado.` : `O administrador removeu este aviso que estava ativo no site.`;
        
        await saveLog(logType, logMsg, null, logDetails);
    } catch (error) {
        console.error("Erro ao deletar:", error);
        showNotification("Erro ao remover/cancelar: " + error.message, 'error');
    }
}

/**
 * Sincroniza o letreiro (latestNotice) com a notificação mais recente no histórico.
 * Útil para corrigir o estado após deleções ou quando o painel inicia.
 */
async function syncTickerWithLatest() {
    try {
        const qLatest = query(collection(db, 'adminNotifications'), orderBy('createdAt', 'desc'), limit(1));
        const latestSnap = await getDocs(qLatest);
        const latestNoticeRef = doc(db, 'config', 'latestNotice');

        if (!latestSnap.empty) {
            const newLatest = latestSnap.docs[0].data();
            // Só atualiza se for realmente diferente para evitar loops (embora improvável aqui)
            await setDoc(latestNoticeRef, newLatest);
        } else {
            // Se não houver avisos, remove o documento do letreiro
            await deleteDoc(latestNoticeRef);
        }
    } catch (error) {
        console.error("Erro ao sincronizar letreiro:", error);
    }
}

// ================= LOGS / HISTÓRICO =================

async function saveLog(type, message, link = null, details = null, imageUrl = null) {
    try {
        const logsRef = collection(db, 'adminLogs');
        const logData = {
            type: type,
            message: message,
            createdAt: new Date().toISOString(),
            user: auth.currentUser ? auth.currentUser.email : 'sistema'
        };
        
        if (link) logData.link = link;
        if (details) logData.details = details;
        if (imageUrl) logData.imageUrl = imageUrl;

        await addDoc(logsRef, logData);
        
        // Recarrega logs para aparecer imediatamente
        loadLogs();
    } catch (e) {
        console.error("Erro ao salvar log: ", e);
    }
}

let lastVisibleLog = null; // Para paginação futura
let isLoadingLogs = false;
let hasMoreLogs = true;

let currentLogFilter = 'all';

async function loadLogs(filterType = 'all') {
    const listEl = document.getElementById('log-list');
    if (!listEl) return;
    
    currentLogFilter = filterType;
    
    // Remove listener antigo se existir para evitar múltiplos disparos
    listEl.removeEventListener('scroll', handleLogScroll);
    
    // Skeleton Screens: exibe placeholders animados enquanto carrega
    listEl.innerHTML = Array(4).fill(`
        <li class="log-item log-skeleton">
            <div class="log-icon skeleton-box" style="width:40px;height:40px;border-radius:50%;"></div>
            <div class="log-content" style="flex:1;">
                <div class="skeleton-box" style="height:14px;width:70%;margin-bottom:8px;border-radius:6px;"></div>
                <div class="skeleton-box" style="height:11px;width:45%;border-radius:6px;"></div>
            </div>
            <div class="log-right-area">
                <div class="skeleton-box" style="height:12px;width:80px;border-radius:6px;"></div>
            </div>
        </li>
    `).join('');
    lucide.createIcons();
    
    try {
        const logsRef = collection(db, 'adminLogs');
        
        let q;
        if (filterType === 'all') {
            q = query(logsRef, orderBy('createdAt', 'desc'), limit(10));
        } else if (filterType === 'aviso') {
            // Filtra por aviso OU aviso-removido usando o operador 'in'
            q = query(logsRef, where('type', 'in', ['aviso', 'aviso-removido']), orderBy('createdAt', 'desc'), limit(10));
        } else if (filterType === 'links') {
            // Filtra por ações de links temporários
            q = query(logsRef, where('type', 'in', ['link-criado', 'link-alterado', 'link-removido']), orderBy('createdAt', 'desc'), limit(10));
        } else {
            // Filtra por tipo específico (pdf, bot, etc)
            q = query(logsRef, where('type', '==', filterType), orderBy('createdAt', 'desc'), limit(10));
        }
        
        const querySnapshot = await getDocs(q);
        
        listEl.innerHTML = ''; // Limpa "Carregando"
        
        if (querySnapshot.empty) {
            listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Nenhum histórico registrado ainda.</div>';
            hasMoreLogs = false;
            return;
        }

        lastVisibleLog = querySnapshot.docs[querySnapshot.docs.length - 1];
        hasMoreLogs = querySnapshot.docs.length === 10;
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateObj = new Date(data.createdAt);
            const formattedDate = dateObj.toLocaleDateString('pt-BR');
            const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            let iconName = 'folder-up';
            if (data.type === 'aviso') iconName = 'bell-ring';
            if (data.type === 'aviso-removido') iconName = 'bell-off';
            if (data.type === 'link-criado') iconName = 'link';
            if (data.type === 'link-alterado') iconName = 'refresh-cw';
            if (data.type === 'link-removido') iconName = 'trash-2';
            if (data.type === 'bot') iconName = 'bot';
            
            let linkHtml = '';
            if (data.link) {
                const isLinkType = data.type && data.type.startsWith('link-');
                const btnLabel = isLinkType ? 'Acessar Link' : 'Ver Arquivo';
                const btnIcon = isLinkType ? 'external-link' : 'file-text';
                linkHtml = `<a href="${data.link}" target="_blank" class="log-link"><i data-lucide="${btnIcon}"></i> ${btnLabel}</a>`;
            }

            // HTML da miniatura se houver imagem
            let imageHtml = '';
            if (data.imageUrl) {
                imageHtml = `
                    <div class="log-thumbnail-wrapper">
                        <img src="${data.imageUrl}" class="log-thumbnail" alt="Miniatura" onclick="window.openImageModal('${data.imageUrl}')">
                    </div>
                `;
            }
            
            const li = document.createElement('li');
            li.className = `log-item log-type-${data.type}`;
            li.innerHTML = `
                <div class="log-icon type-${data.type}">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="log-content">
                    <p>${data.message}</p>
                    ${data.details ? `<p class="log-details">${data.details}</p>` : ''}
                    <span>Enviado por: ${data.user}</span>
                </div>
                <div class="log-right-area">
                    <div class="log-time">
                        <i data-lucide="clock"></i> ${formattedDate} às ${formattedTime}
                    </div>
                    ${imageHtml}
                    ${linkHtml}
                </div>
            `;
            listEl.appendChild(li);
        });
        
        lucide.createIcons();
        
        const wrapper = listEl.closest('.logs-wrapper');
        const mask = wrapper ? wrapper.querySelector('.scroll-indicator-mask') : null;

        // Se há mais logs para carregar, inicia o listener de scroll e exibe a máscara
        if (hasMoreLogs) {
            listEl.addEventListener('scroll', handleLogScroll);
            if (mask) mask.style.opacity = '1';
        } else {
            if (mask) mask.style.opacity = '0';
        }
        
    } catch (e) {
        console.error("Erro ao carregar logs: ", e);
        listEl.innerHTML = '<div style="color:red; padding:1rem; text-align:center;">Erro ao carregar histórico.</div>';
    }
}

async function handleLogScroll() {
    const listEl = document.getElementById('log-list');
    if (!listEl || isLoadingLogs || !hasMoreLogs) return;

    // Detecta se a rolagem chegou a 50px do final da lista
    if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 50) {
        loadMoreLogs();
    }
}

async function loadMoreLogs() {
    if (!lastVisibleLog || isLoadingLogs || !hasMoreLogs) return;
    
    isLoadingLogs = true;
    const listEl = document.getElementById('log-list');
    
    // Mostra indicador de carregamento
    const loadingLi = document.createElement('li');
    loadingLi.className = 'scroll-loading';
    loadingLi.innerHTML = '<i data-lucide="loader"></i> Carregando...';
    listEl.appendChild(loadingLi);
    lucide.createIcons();

    // Oculta temporariamente a máscara indicativa para não ficar sobre o loader
    const wrapper = listEl.closest('.logs-wrapper');
    const mask = wrapper ? wrapper.querySelector('.scroll-indicator-mask') : null;
    if (mask) mask.style.opacity = '0';
    
    try {
        const logsRef = collection(db, 'adminLogs');
        let q;
        if (currentLogFilter === 'all') {
            q = query(logsRef, orderBy('createdAt', 'desc'), startAfter(lastVisibleLog), limit(10));
        } else if (currentLogFilter === 'aviso') {
            q = query(logsRef, where('type', 'in', ['aviso', 'aviso-removido']), orderBy('createdAt', 'desc'), startAfter(lastVisibleLog), limit(10));
        } else if (currentLogFilter === 'links') {
            q = query(logsRef, where('type', 'in', ['link-criado', 'link-alterado', 'link-removido']), orderBy('createdAt', 'desc'), startAfter(lastVisibleLog), limit(10));
        } else {
            q = query(logsRef, where('type', '==', currentLogFilter), orderBy('createdAt', 'desc'), startAfter(lastVisibleLog), limit(10));
        }
        
        const querySnapshot = await getDocs(q);
        
        // Remove loader
        if (listEl.contains(loadingLi)) listEl.removeChild(loadingLi);
        
        if (querySnapshot.empty) {
            hasMoreLogs = false;
            const endLi = document.createElement('li');
            endLi.style.textAlign = 'center';
            endLi.style.color = '#888';
            endLi.style.padding = '1rem';
            endLi.style.fontSize = '0.9rem';
            endLi.textContent = 'Fim do histórico.';
            listEl.appendChild(endLi);
            return;
        }

        lastVisibleLog = querySnapshot.docs[querySnapshot.docs.length - 1];
        hasMoreLogs = querySnapshot.docs.length === 10;
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateObj = new Date(data.createdAt);
            const formattedDate = dateObj.toLocaleDateString('pt-BR');
            const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            let iconName = 'folder-up';
            if (data.type === 'aviso') iconName = 'bell-ring';
            if (data.type === 'aviso-removido') iconName = 'bell-off';
            if (data.type === 'link-criado') iconName = 'link';
            if (data.type === 'link-alterado') iconName = 'refresh-cw';
            if (data.type === 'link-removido') iconName = 'trash-2';
            if (data.type === 'bot') iconName = 'bot';
            
            let linkHtml = '';
            if (data.link) {
                const isLinkType = data.type && data.type.startsWith('link-');
                const btnLabel = isLinkType ? 'Acessar Link' : 'Ver Arquivo';
                const btnIcon = isLinkType ? 'external-link' : 'file-text';
                linkHtml = `<a href="${data.link}" target="_blank" class="log-link"><i data-lucide="${btnIcon}"></i> ${btnLabel}</a>`;
            }

            let imageHtml = '';
            if (data.imageUrl) {
                imageHtml = `
                    <div class="log-thumbnail-wrapper">
                        <img src="${data.imageUrl}" class="log-thumbnail" alt="Miniatura" onclick="window.openImageModal('${data.imageUrl}')">
                    </div>
                `;
            }
            
            const li = document.createElement('li');
            li.className = `log-item log-type-${data.type}`;
            li.innerHTML = `
                <div class="log-icon type-${data.type}">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="log-content">
                    <p>${data.message}</p>
                    ${data.details ? `<p class="log-details">${data.details}</p>` : ''}
                    <span>Enviado por: ${data.user}</span>
                </div>
                <div class="log-right-area">
                    <div class="log-time">
                        <i data-lucide="clock"></i> ${formattedDate} às ${formattedTime}
                    </div>
                    ${imageHtml}
                    ${linkHtml}
                </div>
            `;
            listEl.appendChild(li);
        });
        
        lucide.createIcons();
        
        if (!hasMoreLogs) {
            const endLi = document.createElement('li');
            endLi.style.textAlign = 'center';
            endLi.style.color = '#888';
            endLi.style.padding = '1rem';
            endLi.style.fontSize = '0.9rem';
            endLi.textContent = 'Fim do histórico.';
            listEl.appendChild(endLi);
        } else {
             // Retorna a máscara se tiver mais
             if (mask) mask.style.opacity = '1';
        }
        
    } catch (e) {
        console.error("Erro ao carregar mais logs: ", e);
        if (listEl.contains(loadingLi)) listEl.removeChild(loadingLi);
    } finally {
        isLoadingLogs = false;
    }
}

// ================= FILTROS DO HISTÓRICO =================

function initLogFilters() {
    const filterButtons = document.querySelectorAll('#log-filters .filter-btn');
    if (!filterButtons.length) return;

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove classe active de todos os botões
            filterButtons.forEach(b => b.classList.remove('active'));
            // Adiciona ao botão clicado
            btn.classList.add('active');
            // Carrega os logs com o filtro selecionado
            const filterType = btn.getAttribute('data-filter');
            lastVisibleLog = null;
            hasMoreLogs = true;
            loadLogs(filterType);
        });
    });
}

// ================= BUSCA NO HISTÓRICO =================

function initLogSearch() {
    const searchInput = document.getElementById('log-search');
    if (!searchInput) return;

    let debounceTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const term = searchInput.value.trim().toLowerCase();
            const listEl = document.getElementById('log-list');
            if (!listEl) return;

            const items = listEl.querySelectorAll('.log-item:not(.log-skeleton)');

            if (!term) {
                // Sem busca: mostra tudo
                items.forEach(item => item.style.display = '');
                return;
            }

            let anyVisible = false;
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                const match = text.includes(term);
                item.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            });

            // Mostra mensagem se nenhum resultado
            const emptyMsg = listEl.querySelector('.log-search-empty');
            if (!anyVisible) {
                if (!emptyMsg) {
                    const div = document.createElement('div');
                    div.className = 'log-search-empty';
                    div.style.cssText = 'text-align:center;padding:2rem;color:#888;';
                    div.innerHTML = `<i data-lucide="search-x" style="display:block;margin:0 auto 0.5rem;"></i> Nenhum resultado para "${searchInput.value}"`;
                    listEl.appendChild(div);
                    lucide.createIcons();
                }
            } else {
                if (emptyMsg) emptyMsg.remove();
            }
        }, 300);
    });
}

// ================= AGENDAMENTO DE NOTIFICAÇÕES =================

function initScheduleUI() {
    const toggleSchedule = document.getElementById('toggle-schedule');
    const scheduleInputs  = document.getElementById('schedule-inputs');
    const scheduleStatus  = document.getElementById('schedule-status-text');
    if (!toggleSchedule) return;

    toggleSchedule.addEventListener('change', () => {
        const isEnabled = toggleSchedule.checked;
        if (scheduleInputs)  scheduleInputs.style.display  = isEnabled ? 'flex'  : 'none';
        if (scheduleStatus)  scheduleStatus.style.display  = isEnabled ? 'block' : 'none';

        // Atualiza o texto do botão principal de envio
        const btnSend = document.getElementById('btn-send-notif');
        if (btnSend) {
            if (isEnabled) {
                btnSend.innerHTML = '<i data-lucide="calendar-clock"></i> Agendamento Aviso';
            } else {
                btnSend.innerHTML = '<i data-lucide="megaphone"></i> Disparar Aviso';
            }
            if (window.lucide) lucide.createIcons();
        }

        // Define a data mínima como hoje ao abrir pela primeira vez
        const dateInput = document.getElementById('schedule-date');
        if (dateInput && isEnabled && !dateInput.value) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.min   = today;
            dateInput.value = today;
        }
    });
}

/**
 * Retorna os dados de agendamento se o toggle estiver ativo, ou null.
 */
function getScheduleData() {
    const toggle = document.getElementById('toggle-schedule');
    if (!toggle || !toggle.checked) return null;

    const date = document.getElementById('schedule-date')?.value;
    const time = document.getElementById('schedule-time')?.value;
    if (!date || !time) return null;

    const scheduledAt = new Date(`${date}T${time}:00`);
    return {
        scheduledAt: scheduledAt.toISOString(),
        status: 'pending'
    };
}


// ================= MODAL DE IMAGEM =================

window.openImageModal = function(src) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    if (modal && modalImg) {
        modal.style.display = "block";
        modalImg.src = src;
        document.body.style.overflow = 'hidden'; // Trava scroll
    }
}

window.closeImageModal = function() {
    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = 'auto'; // Destrava scroll
    }
}

// Fecha modal com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageModal();
});

// ================= LINKS TEMPORÁRIOS =================

function setupLinks() {
    const btnCreate = document.getElementById('btn-create-link');
    if (!btnCreate) return;

    // Lógica do Seletor de Ícones
    let selectedIcon = 'link';
    const btnIconPicker = document.getElementById('btn-icon-picker');
    const iconPickerContainer = btnIconPicker ? btnIconPicker.parentElement : null;
    const iconOptions = document.querySelectorAll('.icon-option');
    const selectedIconPreview = document.getElementById('selected-icon-preview');

    if (btnIconPicker && iconPickerContainer) {
        btnIconPicker.addEventListener('click', (e) => {
            e.stopPropagation();
            iconPickerContainer.classList.toggle('open');
        });

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!iconPickerContainer.contains(e.target)) {
                iconPickerContainer.classList.remove('open');
            }
        });

        iconOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedIcon = opt.getAttribute('data-icon');
                
                // Atualiza visual no seletor
                iconOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                
                // Atualiza preview no botão
                const currentPreview = document.getElementById('selected-icon-preview');
                if (currentPreview) {
                    const newIcon = document.createElement('i');
                    newIcon.id = 'selected-icon-preview';
                    newIcon.setAttribute('data-lucide', selectedIcon);
                    currentPreview.parentNode.replaceChild(newIcon, currentPreview);
                    lucide.createIcons();
                }
                
                iconPickerContainer.classList.remove('open');
            });
        });
    }

    const nameInputCounter = document.getElementById('link-name');
    const counterSpan = document.getElementById('link-name-counter');
    if (nameInputCounter && counterSpan) {
        nameInputCounter.addEventListener('input', (e) => {
            const length = e.target.value.length;
            counterSpan.textContent = `${length}/30`;
            if (length >= 30) {
                counterSpan.style.color = '#ff4444';
            } else {
                counterSpan.style.color = 'var(--text-secondary)';
            }
        });
    }

    btnCreate.addEventListener('click', async () => {
        const nameInput = document.getElementById('link-name');
        const urlInput = document.getElementById('link-url');
        
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();

        if (!name || !url) {
            showNotification('Preencha o nome e a URL do link.', 'error');
            return;
        }

        if (name.length > 30) {
            showNotification('O nome do botão não pode ter mais de 30 caracteres.', 'error');
            return;
        }

        try {
            btnCreate.disabled = true;
            btnCreate.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Criando...';

            await addDoc(collection(db, 'dynamicLinks'), {
                name: name,
                url: url,
                icon: selectedIcon,
                active: true,
                createdAt: serverTimestamp()
            });

            nameInput.value = '';
            urlInput.value = '';
            if (counterSpan) {
                counterSpan.textContent = '0/30';
                counterSpan.style.color = 'var(--text-secondary)';
            }

            // Reseta ícone para o padrão
            selectedIcon = 'link';
            const resetPreview = document.getElementById('selected-icon-preview');
            if (resetPreview) {
                const newIcon = document.createElement('i');
                newIcon.id = 'selected-icon-preview';
                newIcon.setAttribute('data-lucide', 'link');
                resetPreview.parentNode.replaceChild(newIcon, resetPreview);
                lucide.createIcons();
            }
            iconOptions.forEach(o => {
                o.classList.remove('active');
                if (o.getAttribute('data-icon') === 'link') o.classList.add('active');
            });
            showNotification('Link criado com sucesso!', 'success');
            await saveLog('link-criado', `Link temporário criado: "${name}"`, url, `O administrador criou um novo link temporário.`);
        } catch (error) {
            console.error('Erro ao criar link:', error);
            showNotification('Erro ao criar link.', 'error');
        } finally {
            btnCreate.disabled = false;
            btnCreate.innerHTML = '<i data-lucide="plus"></i> Criar Botão';
            lucide.createIcons();
        }
    });

    loadAdminLinks();
}

function loadAdminLinks() {
    const listEl = document.getElementById('admin-links-list');
    if (!listEl) return;

    const linksRef = collection(db, 'dynamicLinks');
    const q = query(linksRef, orderBy('createdAt', 'desc'));

    unsubscribeLinks = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = '<div class="admin-notif-empty">Nenhum link temporário criado.</div>';
            return;
        }

        listEl.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const dateObj = data.createdAt ? data.createdAt.toDate() : new Date();
            const formattedDate = dateObj.toLocaleDateString('pt-BR') + ' às ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = 'admin-notif-item';
            
            // Checkbox value
            const isChecked = data.active ? 'checked' : '';
            
            const iconName = data.icon || 'link';
            
            item.innerHTML = `
                <div class="admin-notif-content">
                    <h4 class="admin-notif-title" style="display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="${iconName}" style="width: 18px; height: 18px; color: #8A2BE2;"></i>
                        ${data.name}
                    </h4>
                    <p class="admin-notif-message"><a href="${data.url}" target="_blank" style="color: #2E8B57; text-decoration: none;">${data.url}</a></p>
                    <div class="admin-notif-meta">
                        <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Criado em ${formattedDate}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <label class="toggle-switch">
                        <input type="checkbox" class="toggle-link-status" data-id="${id}" data-name="${data.name}" data-url="${data.url}" ${isChecked}>
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="btn-delete-notif" title="Apagar Link" data-id="${id}" data-name="${data.name}" data-url="${data.url}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        });

        // Eventos
        listEl.querySelectorAll('.toggle-link-status').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const docId = e.target.getAttribute('data-id');
                const name = e.target.getAttribute('data-name');
                const url = e.target.getAttribute('data-url');
                const newState = e.target.checked;
                
                try {
                    await updateDoc(doc(db, 'dynamicLinks', docId), {
                        active: newState
                    });
                    const stateText = newState ? 'ativado' : 'desativado';
                    showNotification(`Link "${name}" ${stateText}.`, 'success');
                    await saveLog('link-alterado', `Link "${name}" foi ${stateText}.`, url);
                } catch (error) {
                    console.error("Erro ao atualizar link:", error);
                    e.target.checked = !newState; // reverte visualmente
                    showNotification("Erro ao atualizar status do link.", 'error');
                }
            });
        });

        listEl.querySelectorAll('.btn-delete-notif').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                const url = btn.getAttribute('data-url');
                
                if (confirm('Tem certeza que deseja excluir o link "'+name+'"?')) {
                    try {
                        await deleteDoc(doc(db, 'dynamicLinks', docId));
                        showNotification('Link "'+name+'" excluído.', 'success');
                        await saveLog('link-removido', 'Link temporário excluído: "'+name+'"', url);
                    } catch (error) {
                        console.error("Erro ao excluir link:", error);
                        showNotification("Erro ao excluir o link.", 'error');
                    }
                }
            });
        });

        lucide.createIcons();
    });
}


// ================= CONVERSÃO DE VÍRGULA PARA PONTO =================
// Garante que se o usuário digitar vírgula (teclado PT-BR), ela vire ponto instantaneamente
document.addEventListener('input', (e) => {
    if (e.target && e.target.classList.contains('version-input')) {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        const oldValue = e.target.value;
        const newValue = oldValue.replace(',', '.');
        
        if (oldValue !== newValue) {
            e.target.value = newValue;
            // Mantém a posição do cursor após a substituição
            e.target.setSelectionRange(start, end);
        }
    }
});
