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
    where,
    deleteField,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytesResumable, 
    getDownloadURL,
    deleteObject,
    getBlob 
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
const toggleAtestadosBtn = document.getElementById('toggle-atestados');
const toggleAtestadosStatusText = document.getElementById('atestados-status-text');
const toggleNewCalendarBtn = document.getElementById('toggle-new-calendar');
const toggleNewCalendarStatusText = document.getElementById('toggle-calendar-status-text');

let selectedNotifImage = null;

// ================= AUTHENTICATION =================

let unsubscribeToggle = null; // Guarda o listener do toggle para poder cancelar no logout
let unsubscribeAppToggle = null; // Guarda o listener do config/app para poder cancelar no logout
let unsubscribeSubscribers = null; // Guarda o listener de assinantes
let unsubscribeLinks = null; // Guarda o listener de links temporários
let unsubscribeEngagement = null; // Guarda o listener do gráfico de engajamento
let unsubscribeMusicians = null; // Guarda o listener da coleção de músicos
let currentEngagementDays = 7; // Quantidade de dias padrão para exibir no gráfico
let isNotificationsEnabled = true; // Estado global das notificações push

// Observador de estado de autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logado
        loginContainer.classList.remove('active');
        dashboardContainer.classList.add('active');
        document.getElementById('user-email').textContent = user.email;
        initToggleListener(); // Inicia o toggle só após autenticação
        initSubscriberCounter(); // Inicia o contador de assinantes
        setupChartFilters(); // Configura os filtros do gráfico de engajamento
        initEngagementChart(); // Inicia o gráfico de engajamento com a quantidade padrão
        loadLogs(); // Carrega o histórico de logs ao logar
        loadAdminNotifications(); // Carrega a lista de notificações ativas
        setupLinks(); // Inicia configurações e listagem dos links temporários
        initManualRobot(); // Inicia o Robô OER Manual
        initLogFilters(); // Inicia os filtros do histórico
        initLogSearch();  // Inicia o campo de busca no histórico
        initScheduleUI(); // Inicia a UI de agendamento de notificações
        initSettingsModal(); // Inicia a lógica do modal de ajustes
        initEditNotifModal(); // Inicia a lógica do modal de edição de notificações
        initEmulatorToggle(); // Inicia o toggle de emulação
        syncTickerWithLatest(); // Força sincronização do letreiro na inicialização
        initAtestadosManagement(); // Inicia a gestão de atestados médicos (Fase 3)
        initCalendarManagement(); // Inicia o módulo de calendário interativo
        initMusiciansManagement(); // Inicia o gerenciamento de músicos (importação e busca reativa)
    } else {
        // Não logado
        dashboardContainer.classList.remove('active');
        loginContainer.classList.add('active');
        if (unsubscribeToggle) { unsubscribeToggle(); unsubscribeToggle = null; }
        if (unsubscribeAppToggle) { unsubscribeAppToggle(); unsubscribeAppToggle = null; }
        if (unsubscribeSubscribers) { unsubscribeSubscribers(); unsubscribeSubscribers = null; }
        if (unsubscribeLinks) { unsubscribeLinks(); unsubscribeLinks = null; }
        if (unsubscribeEngagement) { unsubscribeEngagement(); unsubscribeEngagement = null; }
        if (unsubscribeMusicians) { unsubscribeMusicians(); unsubscribeMusicians = null; }
        if (window.engagementChartInstance) {
            window.engagementChartInstance.destroy();
            window.engagementChartInstance = null;
        }
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
 * Robô OER: Inicializa o acionamento do Robô OER Inteligente
 */
function initManualRobot() {
    const btnRobot = document.getElementById('btn-ai-robot');
    const modalOverlay = document.getElementById('robot-notif-modal-overlay');
    const btnClose = document.getElementById('btn-robot-modal-close');
    const btnGenerate = document.getElementById('btn-robot-generate');

    if (!btnRobot || !modalOverlay) {
        console.warn("🤖 [Robô OER] Elementos essenciais do Robô OER não encontrados no DOM.");
        return;
    }

    // Abertura do Modal com Verificação Condicional
    btnRobot.addEventListener('click', () => {
        const titleInput = document.getElementById('notif-title');
        const messageInput = document.getElementById('notif-message');
        const currentTitle = titleInput ? titleInput.value.trim() : '';
        const currentMessage = messageInput ? messageInput.value.trim() : '';

        if (currentTitle && currentMessage) {
            // Ambos preenchidos: correção direta
            correctNotificationDirectly(currentTitle, currentMessage);
        } else {
            // Um ou ambos vazios: copia o que estiver preenchido (se houver) para o modal
            const prefilledText = currentTitle || currentMessage || '';
            openRobotModal(prefilledText);
        }
    });

    // Fechamento do Modal
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            closeRobotModal();
        });
    }

    // Fechar ao clicar no overlay
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeRobotModal();
        }
    });

    // Ação de Geração com IA
    if (btnGenerate) {
        btnGenerate.addEventListener('click', () => {
            generateNotificationWithAI();
        });
    }

    // Toggle de inclusão de contexto
    const includeContextToggle = document.getElementById('robot-include-context');
    const contextWrapper = document.getElementById('robot-context-wrapper');
    if (includeContextToggle && contextWrapper) {
        includeContextToggle.addEventListener('change', () => {
            contextWrapper.style.display = includeContextToggle.checked ? 'flex' : 'none';
        });
    }

    // Gerenciador de ação de selecionar/desmarcar todos os contextos
    const toggleSelectAllBtn = document.getElementById('robot-toggle-select-all');
    if (toggleSelectAllBtn) {
        toggleSelectAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const allBadges = document.querySelectorAll('#robot-context-items .context-badge');
            const selectedBadges = document.querySelectorAll('#robot-context-items .context-badge.selected');
            
            // Se houver algum badge selecionado, vamos desmarcar todos. Caso contrário, selecionamos todos.
            const shouldSelect = selectedBadges.length === 0;

            allBadges.forEach(badge => {
                const checkbox = badge.querySelector('.context-item-checkbox');
                if (shouldSelect) {
                    badge.classList.add('selected');
                    badge.style.opacity = '1';
                    if (checkbox) checkbox.checked = true;
                } else {
                    badge.classList.remove('selected');
                    badge.style.opacity = '0.5';
                    if (checkbox) checkbox.checked = false;
                }
            });

            updateSelectAllButtonText();
        });
    }
}

/**
 * Abre o modal do Robô OER e carrega o estado da imagem e do contexto
 */
async function openRobotModal(prefilledText = '') {
    const modalOverlay = document.getElementById('robot-notif-modal-overlay');
    const instructionInput = document.getElementById('robot-user-instruction');
    const imageBadge = document.getElementById('robot-image-badge');

    if (!modalOverlay) return;

    // Reset ou preenche a instrução anterior
    if (instructionInput) instructionInput.value = prefilledText;

    // Exibe ou oculta o badge de imagem baseado em selectedNotifImage
    if (imageBadge) {
        if (selectedNotifImage) {
            imageBadge.style.display = 'flex';
            imageBadge.querySelector('span').textContent = `Imagem detectada! A IA irá analisar "${selectedNotifImage.name}" para redigir o aviso.`;
        } else {
            imageBadge.style.display = 'none';
        }
    }

    // Sincroniza o wrapper de contexto com o estado do toggle
    const includeContextToggle = document.getElementById('robot-include-context');
    const contextWrapper = document.getElementById('robot-context-wrapper');
    if (includeContextToggle && contextWrapper) {
        contextWrapper.style.display = includeContextToggle.checked ? 'flex' : 'none';
    }

    // Exibe o modal
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Impede scroll do body

    // Carrega o contexto dinâmico
    await loadRobotModalContext();
}

/**
 * Fecha o modal do Robô OER
 */
function closeRobotModal() {
    const modalOverlay = document.getElementById('robot-notif-modal-overlay');
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
        document.body.style.overflow = ''; // Restaura scroll do body
    }
}

/**
 * Carrega e renderiza o contexto recente do sistema para visualização no modal
 */
async function loadRobotModalContext() {
    const loadingEl = document.getElementById('robot-context-loading');
    const containerEl = document.getElementById('robot-context-items');

    if (!containerEl) return;

    if (loadingEl) loadingEl.style.display = 'flex';
    containerEl.innerHTML = '';

    try {
        const items = [];

        // 1. Busca os últimos 5 logs relevantes
        const logsRef = collection(db, 'adminLogs');
        const qLogs = query(logsRef, orderBy('createdAt', 'desc'), limit(5));
        const logsSnap = await getDocs(qLogs);
        
        logsSnap.forEach(doc => {
            const data = doc.data();
            const dateObj = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            items.push({
                type: 'log',
                dateStr,
                text: data.message || '',
                rawDate: dateObj
            });
        });

        // 2. Busca os próximos 5 eventos a partir de hoje
        const eventosRef = collection(db, 'eventos');
        const todayStr = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
        const qEvents = query(
            eventosRef,
            where('date', '>=', todayStr),
            orderBy('date', 'asc'),
            limit(5)
        );
        const eventsSnap = await getDocs(qEvents);

        eventsSnap.forEach(doc => {
            const data = doc.data();
            const parts = data.date.split('-');
            const dateStr = `${parts[2]}/${parts[1]}`;
            const text = `${data.title} (${data.type || 'Evento'})`;

            items.push({
                type: 'event',
                dateStr,
                text,
                rawDate: new Date(data.date + 'T12:00:00')
            });
        });

        if (items.length === 0) {
            containerEl.innerHTML = '<p style="font-size: 0.8rem; color: #888; text-align: center; padding: 1rem 0;">Nenhum contexto recente encontrado.</p>';
        } else {
            items.forEach(item => {
                const badge = document.createElement('div');
                badge.className = `context-badge ${item.type} selected`;
                badge.style.cursor = 'pointer';
                badge.style.transition = 'opacity 0.2s ease, border-color 0.2s ease';
                
                // Armazena o texto estruturado no dataset
                badge.dataset.text = `[${item.type === 'log' ? 'Histórico/Logs' : 'Compromissos/Agenda'}] (${item.dateStr}) ${item.text}`;
                
                const iconHtml = item.type === 'log' 
                    ? '<i data-lucide="info"></i>' 
                    : '<i data-lucide="calendar"></i>';
                
                badge.innerHTML = `
                    <input type="checkbox" class="context-item-checkbox" checked style="cursor: pointer; accent-color: var(--primary-color, #8b0000); width: 14px; height: 14px; margin-right: 4px;">
                    ${iconHtml}
                    <span class="date" style="font-weight: 600; margin-left: 2px;">${item.dateStr}</span>
                    <span class="text" title="${item.text}" style="margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.text}</span>
                `;
                
                const checkbox = badge.querySelector('.context-item-checkbox');
                
                // Previne o clique no checkbox de disparar duas vezes
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (checkbox.checked) {
                        badge.classList.add('selected');
                        badge.style.opacity = '1';
                    } else {
                        badge.classList.remove('selected');
                        badge.style.opacity = '0.5';
                    }
                    updateSelectAllButtonText();
                });
                
                // Alterna o estado ao clicar em qualquer lugar do badge
                badge.addEventListener('click', () => {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        badge.classList.add('selected');
                        badge.style.opacity = '1';
                    } else {
                        badge.classList.remove('selected');
                        badge.style.opacity = '0.5';
                    }
                    updateSelectAllButtonText();
                });
                
                containerEl.appendChild(badge);
            });
            lucide.createIcons();
            updateSelectAllButtonText();
        }
    } catch (err) {
        console.error("🤖 [Robô OER] Erro ao carregar contexto para o modal:", err);
        containerEl.innerHTML = '<p style="font-size: 0.8rem; color: #e53e3e; text-align: center; padding: 1rem 0;">Falha ao obter histórico recente.</p>';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

/**
 * Atualiza o estado visual e o texto do botão "Selecionar/Desmarcar todos" do modal do Robô OER
 */
function updateSelectAllButtonText() {
    const toggleBtn = document.getElementById('robot-toggle-select-all');
    if (!toggleBtn) return;
    
    const allBadges = document.querySelectorAll('#robot-context-items .context-badge');
    const selectedBadges = document.querySelectorAll('#robot-context-items .context-badge.selected');
    
    if (allBadges.length === 0) {
        toggleBtn.style.display = 'none';
        return;
    }
    
    toggleBtn.style.display = 'inline-block';
    
    // Se nenhum estiver selecionado, a opção é selecionar tudo
    if (selectedBadges.length === 0) {
        toggleBtn.textContent = 'Selecionar todos';
    } else {
        // Se houver pelo menos um selecionado, a opção é limpar/desmarcar todos
        toggleBtn.textContent = 'Desmarcar todos';
    }
}

/**
 * Envia as instruções manuais, contexto e imagem do Robô OER para a Cloud Function e preenche o formulário
 */
async function generateNotificationWithAI() {
    const btnGenerate = document.getElementById('btn-robot-generate');
    const instructionInput = document.getElementById('robot-user-instruction');
    const includeContextToggle = document.getElementById('robot-include-context');
    
    const titleInput = document.getElementById('notif-title');
    const messageInput = document.getElementById('notif-message');

    if (!btnGenerate || !titleInput || !messageInput) return;

    const userPrompt = instructionInput ? instructionInput.value.trim() : '';
    const includeContext = includeContextToggle ? includeContextToggle.checked : true;

    // Coleta apenas os itens de contexto ativamente marcados (que têm a classe "selected")
    let selectedContexts = [];
    if (includeContext) {
        const selectedBadges = Array.from(document.querySelectorAll('#robot-context-items .context-badge.selected'));
        selectedContexts = selectedBadges.map(badge => badge.dataset.text || '').filter(Boolean);
    }

    // Estado visual de carregamento
    btnGenerate.disabled = true;
    const originalBtnHTML = btnGenerate.innerHTML;
    btnGenerate.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Gerando aviso...';
    lucide.createIcons();

    try {
        const payload = {
            userPrompt,
            includeContext,
            selectedContexts
        };

        // Se houver imagem selecionada pelo administrador, vamos processá-la para base64
        if (selectedNotifImage) {
            console.log("🤖 [Robô OER] Convertendo imagem selecionada para Base64 para envio multimodal...");
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    const base64String = result.split(',')[1];
                    resolve(base64String);
                };
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(selectedNotifImage);
            });

            payload.image = {
                inlineData: {
                    mimeType: selectedNotifImage.type,
                    data: base64Data
                }
            };
        }

        console.log("🤖 [Robô OER] Chamando Cloud Function suggestNotificationText com dados expandidos...");
        const suggestTextFn = httpsCallable(functions, 'suggestNotificationText');
        const result = await suggestTextFn(payload);
        
        console.log("🤖 [Robô OER] Sugestão de IA recebida com sucesso:", result.data);
        const { title, message } = result.data;

        // Preenche os campos principais do aviso
        titleInput.value = title || '';
        messageInput.value = message || '';

        // Feedback de sucesso
        showNotification('O Robô OER gerou uma sugestão personalizada! 🎼🤖', 'success');

        // Fecha o modal e limpa
        closeRobotModal();

        // Rola até o formulário de aviso e foca
        setTimeout(() => {
            titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            titleInput.focus();
        }, 300);

    } catch (error) {
        console.error("🤖 [Robô OER] Erro ao chamar a IA do Robô OER:", error);
        
        let errorUserMsg = 'Erro ao processar com a IA.';
        if (error.message && error.message.includes('unauthenticated')) {
            errorUserMsg += ' (Faça login novamente)';
        } else if (error.message) {
            errorUserMsg += ` (${error.message})`;
        }
        
        showNotification(errorUserMsg, 'error');
    } finally {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = originalBtnHTML;
        lucide.createIcons();
    }
}

/**
 * Realiza a correção e aprimoramento direto do título e mensagem sem abrir o modal
 */
async function correctNotificationDirectly(currentTitle, currentMessage) {
    const btnRobot = document.getElementById('btn-ai-robot');
    const titleInput = document.getElementById('notif-title');
    const messageInput = document.getElementById('notif-message');

    if (!btnRobot || !titleInput || !messageInput) return;

    // Estado visual de carregamento no próprio botão
    btnRobot.disabled = true;
    btnRobot.classList.add('loading');

    try {
        const userPrompt = `Por favor, revise, corrija a gramática e melhore a redação deste aviso. 
Título atual: "${currentTitle}"
Mensagem atual: "${currentMessage}"
Retorne a sugestão ideal mantendo o contexto original.`;

        console.log("🤖 [Robô OER] Chamando Cloud Function suggestNotificationText para correção direta...");
        const suggestTextFn = httpsCallable(functions, 'suggestNotificationText');
        const result = await suggestTextFn({
            userPrompt,
            includeContext: true // Mantém o contexto de ensaios/temporada se disponível
        });

        console.log("🤖 [Robô OER] Correção direta concluída com sucesso:", result.data);
        const { title, message } = result.data;

        // Preenche os campos principais do aviso com os textos corrigidos
        if (title) titleInput.value = title;
        if (message) messageInput.value = message;

        // Feedback de sucesso
        showNotification('O Robô OER aprimorou o seu aviso! 🎼🤖', 'success');

    } catch (error) {
        console.error("🤖 [Robô OER] Erro na correção direta com a IA:", error);
        
        let errorUserMsg = 'Erro ao processar a correção com a IA.';
        if (error.message && error.message.includes('unauthenticated')) {
            errorUserMsg += ' (Faça login novamente)';
        } else if (error.message) {
            errorUserMsg += ` (${error.message})`;
        }
        
        showNotification(errorUserMsg, 'error');
    } finally {
        // Remove estado de carregamento
        btnRobot.disabled = false;
        btnRobot.classList.remove('loading');
    }
}

// ================= NOTIFICAÇÕES PUSH =================

const btnSendNotif = document.getElementById('btn-send-notif');
const inputNotifTitle = document.getElementById('notif-title');
const inputNotifMessage = document.getElementById('notif-message');
const inputNotifLink = document.getElementById('notif-link');

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
        const linkUrl = inputNotifLink ? inputNotifLink.value.trim() : '';

        if (!title || !message) {
            showNotification('Por favor, preencha o título e a mensagem do aviso.', 'error');
            return;
        }

        if (linkUrl && !linkUrl.startsWith('https://')) {
            showNotification('O link deve começar com https://', 'warning');
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
            let imageStoragePath = null;
            if (selectedNotifImage) {
                const timestamp = Date.now();
                const ext       = selectedNotifImage.name.split('.').pop();
                const fileName  = `notif_${timestamp}.${ext}`;
                imageStoragePath = `notification_images/${fileName}`;
                const storageRef = ref(storage, imageStoragePath);
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
                    ...(linkUrl ? { linkUrl } : {}),
                    scheduledAt: scheduleData.scheduledAt
                });

                // Grava log de agendamento
                const scheduledDate = new Date(scheduleData.scheduledAt);
                const dateStr = scheduledDate.toLocaleDateString('pt-BR');
                const timeStr = scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                await saveLog(
                    'aviso',
                    `Aviso agendado: "${title}"`,
                    linkUrl || null,
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
                    ...(imageUrl ? { imageUrl } : {}),
                    ...(imageStoragePath ? { imageStoragePath } : {}),
                    ...(linkUrl ? { linkUrl } : {})
                };

                await addDoc(collection(db, 'adminNotifications'), notifData);

                // Atualiza letreiro (latestNotice)
                await setDoc(doc(db, 'config', 'latestNotice'), notifData);

                // Log histórico
                await saveLog('aviso', `Notificação push enviada: "${title}"`, linkUrl || null, message, imageUrl);

                showNotification('Aviso enviado para a fila de disparo! Os músicos receberão em instantes.', 'success');
            }

            // Limpa campos
            inputNotifTitle.value   = '';
            inputNotifMessage.value = '';
            if (inputNotifLink) inputNotifLink.value = '';
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

// ================= MODAL DE EDIÇÃO DE NOTIFICAÇÃO =================

let editNotifImageDeleted = false;

function initEditNotifModal() {
    const modal = document.getElementById('edit-notif-modal');
    const closeBtn = document.getElementById('close-edit-notif-modal');
    const cancelBtn = document.getElementById('btn-cancel-edit-notif');
    const saveBtn = document.getElementById('btn-save-edit-notif');
    const deleteImgBtn = document.getElementById('btn-delete-edit-notif-image');
    const imageContainer = document.getElementById('edit-notif-image-container');

    if (!modal || !closeBtn || !cancelBtn || !saveBtn) return;

    const closeModal = () => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    saveBtn.addEventListener('click', saveNotificationEdit);

    if (deleteImgBtn && imageContainer) {
        deleteImgBtn.addEventListener('click', () => {
            editNotifImageDeleted = true;
            imageContainer.style.display = 'none';
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

/**
 * Inicializa o toggle de ambiente (Produção vs Localhost/Emulador).
 */
function initEmulatorToggle() {
    const toggle = document.getElementById('toggle-emulator');
    const label = document.getElementById('env-label');
    if (!toggle || !label) return;

    // Lê estado atual do localStorage
    const isEmulator = localStorage.getItem('USE_EMULATORS') === 'true';
    toggle.checked = isEmulator;
    
    const updateLabel = (active) => {
        if (active) {
            label.innerHTML = '<span style="color: #6f42c1; font-weight: 800;">🛠️ LOCALHOST / EMULADORES</span>';
            document.body.classList.add('mode-emulator');
        } else {
            label.innerHTML = '<span style="color: #2E8B57; font-weight: 800;">🌐 PRODUÇÃO (FIREBASE)</span>';
            document.body.classList.remove('mode-emulator');
        }
    };

    updateLabel(isEmulator);

    toggle.addEventListener('change', () => {
        const newState = toggle.checked;
        localStorage.setItem('USE_EMULATORS', newState);
        updateLabel(newState);
        
        // Notifica e recarrega após pequeno delay para o usuário ver a mudança
        showNotification(`Ambiente alterado para ${newState ? "Emulador" : "Produção"}. Reiniciando...`, 'warning');
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    });
}


/**
 * Abre o modal para editar uma notificação agendada ou ativa.
 */
function openEditNotifModal(docId, collectionName, data) {
    const modal = document.getElementById('edit-notif-modal');
    const titleInput = document.getElementById('edit-notif-title');
    const messageInput = document.getElementById('edit-notif-message');
    const linkInput = document.getElementById('edit-notif-link');
    const dateInput = document.getElementById('edit-notif-date');
    const idInput = document.getElementById('edit-notif-id');
    const collInput = document.getElementById('edit-notif-collection');
    const schedulingFields = document.getElementById('edit-scheduling-fields');
    const imageContainer = document.getElementById('edit-notif-image-container');
    const imagePreview = document.getElementById('edit-notif-image-preview');

    if (!modal || !titleInput) return;

    // Reseta estado de imagem deletada
    editNotifImageDeleted = false;

    // Controla exibição da imagem anexa
    if (imageContainer && imagePreview) {
        if (data.imageUrl) {
            imagePreview.src = data.imageUrl;
            imageContainer.style.display = 'flex';
        } else {
            imagePreview.src = '';
            imageContainer.style.display = 'none';
        }
    }

    // Preenche os campos ocultos de controle
    idInput.value = docId;
    collInput.value = collectionName;
    
    // Preenche campos de texto
    titleInput.value = data.title || '';
    messageInput.value = data.message || '';
    if (linkInput) {
        linkInput.value = data.linkUrl || '';
    }

    // Se for agendado, mostra o campo de data e preenche com o valor atual
    if (collectionName === 'scheduledNotifications') {
        schedulingFields.style.display = 'block';
        if (data.scheduledAt) {
            // Converte ISO para o formato aceito pelo input datetime-local (YYYY-MM-DDTHH:mm)
            const d = new Date(data.scheduledAt);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            dateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else {
            dateInput.value = '';
        }
    } else {
        schedulingFields.style.display = 'none';
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

/**
 * Salva as alterações feitas no modal de edição de notificação.
 */
async function saveNotificationEdit() {
    const docId = document.getElementById('edit-notif-id').value;
    const collectionName = document.getElementById('edit-notif-collection').value;
    const title = document.getElementById('edit-notif-title').value;
    const message = document.getElementById('edit-notif-message').value;
    const linkInput = document.getElementById('edit-notif-link');
    const link = linkInput ? linkInput.value.trim() : '';
    const dateVal = document.getElementById('edit-notif-date').value;
    const saveBtn = document.getElementById('btn-save-edit-notif');

    if (!title.trim()) {
        showNotification("O título é obrigatório.", "warning");
        return;
    }

    if (link && !link.startsWith('https://')) {
        showNotification("O link deve começar com https://", "warning");
        return;
    }

    try {
        saveBtn.disabled = true;
        const originalContent = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="loader-2 animate-spin"></i> Salvando...';

        const notifRef = doc(db, collectionName, docId);
        const updates = {
            title: title.trim(),
            message: message.trim(),
            linkUrl: link ? link : deleteField()
        };

        if (editNotifImageDeleted) {
            updates.imageUrl = deleteField();
        }

        // Se for agendado e uma nova data foi fornecida, atualiza
        if (collectionName === 'scheduledNotifications' && dateVal) {
            const newDate = new Date(dateVal);
            if (!isNaN(newDate.getTime())) {
                updates.scheduledAt = newDate.toISOString();
            }
        }

        await updateDoc(notifRef, updates);
        
        // Se for um aviso que já foi enviado, sincroniza o letreiro caso seja o mais recente
        if (collectionName === 'adminNotifications') {
            await syncTickerWithLatest();
        }

        showNotification("Comunicado atualizado com sucesso!", "success");
        document.getElementById('edit-notif-modal').style.display = 'none';
        document.body.style.overflow = '';
        
        // Log da edição
        await saveLog('aviso-editado', `Comunicado editado: "${title}"`, link || null, `O administrador alterou os detalhes deste aviso.`);

    } catch (error) {
        console.error("Erro ao salvar edição:", error);
        showNotification("Erro ao salvar alterações: " + error.message, "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-lucide="save"></i> Salvar Alterações';
        lucide.createIcons();
    }
}

// ================= TOGGLE VISIBILIDADE NOTIFICAÇÕES =================
const settingsRef = doc(db, 'config', 'settings');
const appConfigRef = doc(db, 'config', 'app');

function initToggleListener() {
    // Cancela listener anterior se já existir
    if (unsubscribeToggle) unsubscribeToggle();
    if (unsubscribeAppToggle) unsubscribeAppToggle();

    // Escuta em tempo real o estado dos toggles
    unsubscribeToggle = onSnapshot(settingsRef, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        
        // Estado do Botão de Notificação
        const notifEnabled = data.notificationsEnabled === true;
        isNotificationsEnabled = notifEnabled; // Atualiza a variável global

        if (toggleNotifBtn) toggleNotifBtn.checked = notifEnabled;
        if (toggleStatusText) {
            toggleStatusText.textContent = notifEnabled
                ? '✅ Botão de notificação ATIVO no site dos músicos.'
                : '🔕 Botão de notificação DESATIVADO no site dos músicos.';
            toggleStatusText.style.color = notifEnabled ? '#2E8B57' : '#888';
        }

        // --- ATUALIZAÇÕES DINÂMICAS DO PAINEL ADMIN COM BASE NO ESTADO ---
        
        // 1. Aba lateral de navegação
        const notifTab = document.querySelector('[data-target="section-notif"]');
        if (notifTab) {
            const span = notifTab.querySelector('span');
            if (span) {
                span.textContent = notifEnabled ? 'Avisos & Notificações' : 'Letreiro de Comunicados';
            }
            const icon = notifTab.querySelector('i') || notifTab.querySelector('svg');
            if (icon) {
                icon.setAttribute('data-lucide', notifEnabled ? 'bell-ring' : 'megaphone');
            }
        }

        // 2. Cabeçalho da Seção de Envio
        const sectionHeader = document.querySelector('#section-notif .logs-header');
        if (sectionHeader) {
            const h3 = sectionHeader.querySelector('h3');
            if (h3) {
                h3.innerHTML = notifEnabled 
                    ? '<i data-lucide="bell-ring"></i> Avisos & Notificações' 
                    : '<i data-lucide="megaphone"></i> Letreiro de Comunicados';
            }
            const p = sectionHeader.querySelector('p');
            if (p) {
                p.textContent = notifEnabled
                    ? 'Escreva comunicados, anexe imagens e dispare notificações em tempo real para os músicos.'
                    : 'Escreva comunicados, anexe imagens e publique no letreiro de avisos do site.';
            }
        }

        // 3. Card de Formulário (Ícone, Títulos, Subtítulos e Botões)
        const notifCard = document.querySelector('.upload-card:has(#btn-send-notif)');
        if (notifCard) {
            const cardIcon = notifCard.querySelector('.card-icon i') || notifCard.querySelector('.card-icon svg');
            if (cardIcon) {
                cardIcon.setAttribute('data-lucide', notifEnabled ? 'bell-ring' : 'megaphone');
            }
            const cardH3 = notifCard.querySelector('h3');
            if (cardH3) {
                cardH3.textContent = notifEnabled ? 'Avisar Músicos' : 'Publicar Comunicado';
            }
            const cardP = notifCard.querySelector('p');
            if (cardP) {
                cardP.textContent = notifEnabled
                    ? 'Envie uma notificação push para todos.'
                    : 'Publique um novo comunicado no letreiro de avisos do site.';
            }
            const submitBtn = document.getElementById('btn-send-notif');
            if (submitBtn) {
                submitBtn.innerHTML = notifEnabled
                    ? '<i data-lucide="megaphone"></i> Disparar Aviso'
                    : '<i data-lucide="megaphone"></i> Publicar Comunicado';
            }
        }

        // 4. Texto de Agendamento
        const schedulingLabel = document.querySelector('#scheduling-section .toggle-label');
        if (schedulingLabel) {
            schedulingLabel.innerHTML = notifEnabled
                ? '<i data-lucide="calendar-clock"></i> Agendar envio futuro (opcional)'
                : '<i data-lucide="calendar-clock"></i> Agendar publicação futura (opcional)';
        }

        // 5. Aba Histórico: Card de Músicos Inscritos
        const subscriberCard = document.getElementById('subscriber-count-card');
        if (subscriberCard) {
            subscriberCard.style.display = notifEnabled ? 'flex' : 'none';
        }

        // 6. Recarregar o gráfico de engajamento
        setTimeout(() => {
            initEngagementChart();
        }, 50);

        // 7. Forçar Lucide a renderizar os novos ícones alterados dinamicamente no DOM
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
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

        // Estado do Módulo de Atestados
        const atestadosEnabled = data.atestadosEnabled === true;
        if (toggleAtestadosBtn) toggleAtestadosBtn.checked = atestadosEnabled;
        if (toggleAtestadosStatusText) {
            toggleAtestadosStatusText.textContent = atestadosEnabled
                ? '✅ Módulo de atestados ATIVO no site dos músicos.'
                : '🔕 Módulo de atestados DESATIVADO no site dos músicos.';
            toggleAtestadosStatusText.style.color = atestadosEnabled ? '#2E8B57' : '#888';
        }
    }, (err) => {
        console.error('[Toggle] Erro ao ouvir config/settings:', err);
        const errorMsg = '⚠️ Erro ao carregar estado.';
        if (toggleStatusText) toggleStatusText.textContent = errorMsg;
        if (toggleTickerStatusText) toggleTickerStatusText.textContent = errorMsg;
        if (toggleAtestadosStatusText) toggleAtestadosStatusText.textContent = errorMsg;
    });

    // Escuta em tempo real o estado do novo calendário
    unsubscribeAppToggle = onSnapshot(appConfigRef, (snap) => {
        // Se o usuário estiver interagindo com o toggle (marcado com a flag), não sobrescrevemos a UI
        if (toggleNewCalendarBtn && toggleNewCalendarBtn.dataset.isUpdating === 'true') {
            console.log('[Toggle] Ignorando atualização do snapshot para evitar conflito de estado.');
            return;
        }

        const data = snap.exists() ? snap.data() : {};
        const showNewCalendar = data.show_new_calendar === true;
        
        console.log('[Toggle] Estado atual no Firestore (config/app):', showNewCalendar);

        if (toggleNewCalendarBtn) toggleNewCalendarBtn.checked = showNewCalendar;
        if (toggleNewCalendarStatusText) {
            toggleNewCalendarStatusText.textContent = showNewCalendar
                ? '✅ Novo calendário ATIVO no site dos músicos.'
                : '🔕 Novo calendário DESATIVADO no site dos músicos.';
            toggleNewCalendarStatusText.style.color = showNewCalendar ? '#2E8B57' : '#888';
        }
    }, (err) => {
        console.error('[Toggle] Erro ao ouvir config/app:', err);
        if (toggleNewCalendarStatusText) toggleNewCalendarStatusText.textContent = '⚠️ Erro ao carregar estado do calendário.';
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

    // Evento para o Toggle de Atestados
    if (toggleAtestadosBtn && !toggleAtestadosBtn._listenerAdded) {
        toggleAtestadosBtn._listenerAdded = true;
        toggleAtestadosBtn.addEventListener('change', async () => {
            const newState = toggleAtestadosBtn.checked;
            try {
                await setDoc(settingsRef, { atestadosEnabled: newState }, { merge: true });
            } catch (err) {
                showNotification('Erro ao salvar configuração: ' + err.message, 'error');
                toggleAtestadosBtn.checked = !newState;
            }
        });
    }

    if (toggleNewCalendarBtn && !toggleNewCalendarBtn._listenerAdded) {
        toggleNewCalendarBtn._listenerAdded = true;
        toggleNewCalendarBtn.addEventListener('change', async () => {
            const newState = toggleNewCalendarBtn.checked;
            console.log('[Toggle] Solicitada alteração para:', newState);

            // Marcamos que estamos atualizando para que o listener snapshot ignore a mudança momentaneamente
            toggleNewCalendarBtn.dataset.isUpdating = 'true';
            toggleNewCalendarBtn.disabled = true; // Trava visual

            // Se for ativar, fazer validação de segurança
            if (newState) {
                try {
                    console.log('[Toggle] Validando existência de eventos para o mês atual...');
                    const now = new Date();
                    
                    const eventosRef = collection(db, 'eventos');
                    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                    const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
                    
                    const q = query(
                        eventosRef, 
                        where("date", ">=", startOfMonth), 
                        where("date", "<=", endOfMonth), 
                        limit(1)
                    );
                    const snapshot = await getDocs(q);

                    if (snapshot.empty) {
                        console.warn('[Toggle] Validação falhou: Nenhum evento encontrado.');
                        showNotification('Atenção: Cadastre pelo menos um evento para o mês atual antes de ativar o novo calendário.', 'warning');
                        toggleNewCalendarBtn.checked = false; // Reverte na interface
                        toggleNewCalendarBtn.disabled = false;
                        delete toggleNewCalendarBtn.dataset.isUpdating;
                        return;
                    }
                    console.log('[Toggle] Validação OK. Procedendo com o salvamento.');
                } catch (err) {
                    console.error('[Toggle] Erro na validação:', err);
                    showNotification('Erro ao validar eventos no calendário: ' + err.message, 'error');
                    toggleNewCalendarBtn.checked = false;
                    toggleNewCalendarBtn.disabled = false;
                    delete toggleNewCalendarBtn.dataset.isUpdating;
                    return;
                }
            }

            try {
                await setDoc(appConfigRef, { show_new_calendar: newState }, { merge: true });
                console.log('[Toggle] Sucesso ao atualizar Firestore.');
                showNotification(`Novo calendário ${newState ? 'ATIVADO' : 'DESATIVADO'} com sucesso.`, 'success');
            } catch (err) {
                console.error('[Toggle] Erro ao salvar no Firestore:', err);
                showNotification('Erro ao salvar configuração do calendário: ' + err.message, 'error');
                toggleNewCalendarBtn.checked = !newState;
            } finally {
                // Liberamos o botão e o listener
                toggleNewCalendarBtn.disabled = false;
                delete toggleNewCalendarBtn.dataset.isUpdating;
            }
        });
    }
}

// ================= CONTADOR DE ASSINANTES (REAL-TIME) =================

function initSubscriberCounter() {
    const counterEl = document.getElementById('subscriber-count-value');
    const cardEl = document.getElementById('subscriber-count-card');
    if (!counterEl || !cardEl) return;

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

    // Configura o evento de clique para varredura manual de tokens (calibração do Robô OER)
    if (!cardEl._clickEventAdded) {
        cardEl._clickEventAdded = true;
        cardEl.addEventListener('click', async () => {
            // Evita cliques múltiplos caso já esteja rodando
            if (cardEl.classList.contains('is-syncing')) return;

            const confirmScan = confirm("Deseja iniciar a varredura manual do Robô OER agora?\n\nIsso validará silenciosamente todos os tokens registrados com a Google e a Apple e removerá as assinaturas inválidas de aparelhos inativos.");
            if (!confirmScan) return;

            try {
                // Ativar feedback visual de sincronização
                cardEl.classList.add('is-syncing');
                const liveTextEl = cardEl.querySelector('.live-text');
                let originalText = "AO VIVO";
                if (liveTextEl) {
                    originalText = liveTextEl.textContent;
                    liveTextEl.textContent = "VERIFICANDO...";
                }

                showNotification("Varredura iniciada! O Robô OER está validando as conexões dos dispositivos...", "info");

                // Invocar a Cloud Function callable
                const checkFn = httpsCallable(functions, 'checkSubscribersNow');
                const result = await checkFn();

                // Feedback visual de sucesso
                cardEl.classList.remove('is-syncing');
                if (liveTextEl) {
                    liveTextEl.textContent = originalText;
                }

                const data = result.data;
                if (data && data.success) {
                    let msg = `Varredura concluída! ${data.removedCount} tokens inativos foram removidos.`;
                    if (data.corrected) {
                        msg += ` O contador foi recalibrado e corrigido para ${data.newCount}.`;
                    } else {
                        msg += ` O contador já estava correto em ${data.newCount}.`;
                    }
                    showNotification(msg, "success");
                    
                    // Força recarregar os logs na tela para exibir o log de varredura do robô
                    if (typeof loadLogs === 'function') {
                        loadLogs();
                    }
                } else {
                    showNotification("A varredura foi executada, mas o resultado foi inconclusivo.", "warning");
                }

            } catch (err) {
                console.error("[Varredura Manual] Erro ao executar:", err);
                cardEl.classList.remove('is-syncing');
                const liveTextEl = cardEl.querySelector('.live-text');
                if (liveTextEl) {
                    liveTextEl.textContent = "AO VIVO";
                }
                showNotification("Erro na varredura: " + err.message, "error");
            }
        });
    }
}


// ================= GRÁFICO DE ENGAJAMENTO (REAL-TIME) =================

function initEngagementChart() {
    const canvas = document.getElementById('engagementChart');
    if (!canvas) return;

    if (unsubscribeEngagement) unsubscribeEngagement();

    const engagementRef = collection(db, 'engagement');
    const q = query(engagementRef, orderBy('timestamp', 'desc'), limit(currentEngagementDays));

    unsubscribeEngagement = onSnapshot(q, (snapshot) => {
        // Gera a lista dos últimos N dias na ordem cronológica correta
        const lastDays = [];
        for (let i = currentEngagementDays - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            // Exibição dd/mm e dia da semana conforme solicitado
            const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const diaSemanaStr = diasSemana[d.getDay()];
            const displayStr = `${day}/${month} (${diaSemanaStr})`;
            
            lastDays.push({
                dateStr: dateStr,
                displayStr: displayStr,
                uniqueAccesses: 0,
                notificationAccesses: 0
            });
        }

        // Preenche com os dados reais retornados pelo Firestore
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateStr = docSnap.id; // YYYY-MM-DD
            const dayObj = lastDays.find(d => d.dateStr === dateStr);
            if (dayObj) {
                dayObj.uniqueAccesses = data.uniqueAccesses || 0;
                dayObj.notificationAccesses = data.notificationAccesses || 0;
            }
        });

        const labels = lastDays.map(d => d.displayStr);
        const uniqueData = lastDays.map(d => d.uniqueAccesses);
        const notifData = lastDays.map(d => d.notificationAccesses);

        renderChart(canvas, labels, uniqueData, notifData);
    }, (err) => {
        console.error('[Admin] Erro ao monitorar dados de engajamento:', err);
    });
}

function renderChart(canvas, labels, uniqueData, notifData, notifEnabled = isNotificationsEnabled) {
    if (window.engagementChartInstance) {
        window.engagementChartInstance.destroy();
        window.engagementChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    
    // Configura o visual com gradientes suaves sob as linhas
    const gradientUnique = ctx.createLinearGradient(0, 0, 0, 200);
    gradientUnique.addColorStop(0, 'rgba(139, 0, 0, 0.25)'); // Vinho da OER (#8B0000)
    gradientUnique.addColorStop(1, 'rgba(139, 0, 0, 0.00)');

    const gradientNotif = ctx.createLinearGradient(0, 0, 0, 200);
    gradientNotif.addColorStop(0, 'rgba(16, 185, 129, 0.25)'); // Verde Esmeralda (#10B981)
    gradientNotif.addColorStop(1, 'rgba(16, 185, 129, 0.00)');

    const datasets = [
        {
            label: 'Acessos Únicos',
            data: uniqueData,
            borderColor: '#8B0000', // Vinho
            backgroundColor: gradientUnique,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#8B0000',
            pointHoverRadius: 6,
            pointRadius: 4
        }
    ];

    if (notifEnabled) {
        datasets.push({
            label: 'Cliques na Notificação',
            data: notifData,
            borderColor: '#10B981', // Verde Esmeralda
            backgroundColor: gradientNotif,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#10B981',
            pointHoverRadius: 6,
            pointRadius: 4
        });
    }

    window.engagementChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                            family: "'Inter', sans-serif",
                            size: 12,
                            weight: '500'
                         },
                        color: '#333333'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(33, 33, 33, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    titleFont: {
                        family: "'Inter', sans-serif",
                        weight: '600'
                    },
                    bodyFont: {
                        family: "'Inter', sans-serif"
                    },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: true
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        autoSkip: true,
                        maxRotation: 0,
                        font: {
                            family: "'Inter', sans-serif",
                            size: 11
                        },
                        color: '#666666'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        beginAtZero: true,
                        stepSize: 1, // Exibe números inteiros
                        font: {
                            family: "'Inter', sans-serif",
                            size: 11
                        },
                        color: '#666666'
                    }
                }
            }
        }
    });
}

// Configura os clicks nos filtros do gráfico de engajamento
function setupChartFilters() {
    const filterContainer = document.getElementById('engagement-chart-filters');
    if (!filterContainer) return;

    const buttons = filterContainer.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('ativo'));
            btn.classList.add('ativo');
            
            const days = parseInt(btn.getAttribute('data-days'), 10);
            currentEngagementDays = days;
            
            // Recarrega o gráfico em tempo real com a nova quantidade de dias
            initEngagementChart();
        });
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

                // Preparação para futura funcionalidade de links nos comunicados
                const linkBtnHtml = data.linkUrl ? `
                    <a href="${data.linkUrl}" target="_blank" class="btn-outline admin-notif-btn" title="Acessar Link" style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; font-size: 0.75rem; border-radius: 6px; cursor: pointer; border: 1px solid #ddd; background: #fff; color: #555; text-decoration: none; transition: all 0.2s ease;">
                        <i data-lucide="external-link" style="width: 16px; height: 16px;"></i>
                        <span class="admin-notif-btn-text">Acessar Link</span>
                    </a>
                ` : '';

                const imageBtnHtml = data.imageUrl ? `
                    <button class="btn-outline admin-notif-btn" onclick="window.openImageModal('${data.imageUrl}')" title="Visualizar Imagem" style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; font-size: 0.75rem; border-radius: 6px; cursor: pointer; border: 1px solid #ddd; background: #fff; color: #555; transition: all 0.2s ease;">
                        <i data-lucide="image" style="width: 16px; height: 16px;"></i>
                        <span class="admin-notif-btn-text">Visualizar Imagem</span>
                    </button>
                ` : '';

                const metaActionsHtml = (linkBtnHtml || imageBtnHtml) ? `
                    <div class="admin-notif-meta-actions" style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem;">
                        ${linkBtnHtml}
                        ${imageBtnHtml}
                    </div>
                ` : '';

                const item = document.createElement('div');
                item.className = `admin-notif-item ${isPending ? 'is-pending' : ''}`;
                item.innerHTML = `
                    <div class="admin-notif-header">
                        <h4 class="admin-notif-title">${data.title}</h4>
                        <div class="admin-notif-actions">
                            ${isPending ? `
                                <button class="btn-edit-notif" title="Editar agendamento" 
                                        data-id="${data.id}" data-collection="${collectionName}">
                                    <i data-lucide="edit-3"></i>
                                </button>
                            ` : ''}
                            <button class="btn-delete-notif" title="${isPending ? 'Cancelar agendamento' : 'Apagar comunicado do site'}" 
                                    data-id="${data.id}" data-title="${data.title}" data-collection="${collectionName}">
                                <i data-lucide="${isPending ? 'x-circle' : 'trash-2'}"></i>
                            </button>
                        </div>
                    </div>
                    <p class="admin-notif-message">${data.message}</p>
                    <div class="admin-notif-meta" style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%; margin-top: 0.8rem;">
                        <span style="display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.2rem;">
                            <i data-lucide="${isPending ? 'calendar' : 'clock'}" style="width: 12px; height: 12px;"></i> ${metaLabel} ${formattedDate}
                        </span>
                        ${metaActionsHtml}
                    </div>
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

            // NOVO: Adiciona listeners para os botões de editar
            listEl.querySelectorAll('.btn-edit-notif').forEach(btn => {
                btn.addEventListener('click', () => {
                    const docId = btn.getAttribute('data-id');
                    const collectionName = btn.getAttribute('data-collection');
                    const notificationData = combined.find(n => n.id === docId);
                    if (notificationData) {
                        openEditNotifModal(docId, collectionName, notificationData);
                    }
                });
            });

            lucide.createIcons();

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
        allLogsCache = null; // Limpa cache para busca refletir novos logs
        loadLogs();
    } catch (e) {
        console.error("Erro ao salvar log: ", e);
    }
}

let lastVisibleLog = null; // Para paginação futura
let isLoadingLogs = false;
let hasMoreLogs = true;

let currentLogFilter = 'all';
let allLogsCache = null; // Cache dos logs baixados para busca
let isFetchingLogsForSearch = false; // Indica se estamos buscando logs para preencher o cache
let activeSearchQuery = ''; // Controla o termo atual de busca ativo

function buildLogItemElement(data) {
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
    if (data.type === 'sistema') iconName = 'cpu';
    if (data.type === 'atestado') iconName = 'activity';
    if (data.type === 'erro') iconName = 'alert-triangle';
    
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
            <p class="log-message">${data.message}</p>
            ${data.details ? (data.details.length > 280 ? `
                <div class="log-details-wrapper">
                    <p class="log-details is-collapsed">${data.details}</p>
                    <button class="log-view-more" onclick="this.previousElementSibling.classList.toggle('is-collapsed'); this.textContent = this.previousElementSibling.classList.contains('is-collapsed') ? 'Ver mais' : 'Ver menos'">Ver mais</button>
                </div>
            ` : `<p class="log-details">${data.details}</p>`) : ''}
            <div class="log-meta">
                <span class="log-author"><i data-lucide="user"></i> ${data.user}</span>
                <span class="log-divider">•</span>
                <span class="log-time"><i data-lucide="clock"></i> ${formattedDate} às ${formattedTime}</span>
            </div>
        </div>
        <div class="log-actions">
            ${imageHtml}
            ${linkHtml}
        </div>
    `;
    return li;
}

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
                <div class="skeleton-box" style="height:14px;width:80%;margin-bottom:12px;border-radius:6px;"></div>
                <div class="skeleton-box" style="height:10px;width:50%;border-radius:6px;"></div>
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
        } else if (filterType === 'sistema') {
            // Filtra por logs técnicos do sistema
            q = query(logsRef, where('type', 'in', ['sistema', 'erro']), orderBy('createdAt', 'desc'), limit(10));
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
            const li = buildLogItemElement(data);
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
    if (!listEl || isLoadingLogs || !hasMoreLogs || activeSearchQuery) return;

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
        } else if (currentLogFilter === 'sistema') {
            q = query(logsRef, where('type', 'in', ['sistema', 'erro']), orderBy('createdAt', 'desc'), startAfter(lastVisibleLog), limit(10));
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
            const li = buildLogItemElement(data);
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
            
            // Limpa o input de busca e zera o cache para forçar recarregamento sob demanda
            const searchInput = document.getElementById('log-search');
            if (searchInput) searchInput.value = '';
            allLogsCache = null;
            activeSearchQuery = '';

            // Carrega os logs com o filtro selecionado
            const filterType = btn.getAttribute('data-filter');
            lastVisibleLog = null;
            hasMoreLogs = true;
            loadLogs(filterType);
        });
    });
}

// ================= BUSCA NO HISTÓRICO =================

function normalizeStr(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function initLogSearch() {
    const searchInput = document.getElementById('log-search');
    if (!searchInput) return;

    let debounceTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            const term = searchInput.value.trim();
            const listEl = document.getElementById('log-list');
            if (!listEl) return;

            // Se o campo estiver vazio, restaura o estado paginado normal
            if (!term) {
                activeSearchQuery = '';
                // Limpa mensagem de vazio
                const emptyMsg = listEl.querySelector('.log-search-empty');
                if (emptyMsg) emptyMsg.remove();
                
                // Recarrega logs normais
                loadLogs(currentLogFilter);
                return;
            }

            activeSearchQuery = term;
            const normalizedQuery = normalizeStr(term);
            const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

            // Se o cache estiver vazio, busca até 200 logs do Firestore com o filtro ativo
            if (!allLogsCache) {
                // Skeleton Screen temporário enquanto carrega os logs da busca
                listEl.innerHTML = Array(4).fill(`
                    <li class="log-item log-skeleton">
                        <div class="log-icon skeleton-box" style="width:40px;height:40px;border-radius:50%;"></div>
                        <div class="log-content" style="flex:1;">
                            <div class="skeleton-box" style="height:14px;width:80%;margin-bottom:12px;border-radius:6px;"></div>
                            <div class="skeleton-box" style="height:10px;width:50%;border-radius:6px;"></div>
                        </div>
                    </li>
                `).join('');
                lucide.createIcons();

                // Oculta indicador de scroll
                const wrapper = listEl.closest('.logs-wrapper');
                const mask = wrapper ? wrapper.querySelector('.scroll-indicator-mask') : null;
                if (mask) mask.style.opacity = '0';

                try {
                    isFetchingLogsForSearch = true;
                    const logsRef = collection(db, 'adminLogs');
                    let q;
                    if (currentLogFilter === 'all') {
                        q = query(logsRef, orderBy('createdAt', 'desc'), limit(200));
                    } else if (currentLogFilter === 'aviso') {
                        q = query(logsRef, where('type', 'in', ['aviso', 'aviso-removido']), orderBy('createdAt', 'desc'), limit(200));
                    } else if (currentLogFilter === 'links') {
                        q = query(logsRef, where('type', 'in', ['link-criado', 'link-alterado', 'link-removido']), orderBy('createdAt', 'desc'), limit(200));
                    } else if (currentLogFilter === 'sistema') {
                        q = query(logsRef, where('type', 'in', ['sistema', 'erro']), orderBy('createdAt', 'desc'), limit(200));
                    } else {
                        q = query(logsRef, where('type', '==', currentLogFilter), orderBy('createdAt', 'desc'), limit(200));
                    }

                    const snapshot = await getDocs(q);
                    allLogsCache = [];
                    snapshot.forEach(doc => {
                        allLogsCache.push(doc.data());
                    });
                } catch (err) {
                    console.error("Erro ao buscar logs para pesquisa: ", err);
                    listEl.innerHTML = '<div style="color:red; padding:1rem; text-align:center;">Erro ao carregar busca.</div>';
                    isFetchingLogsForSearch = false;
                    return;
                } finally {
                    isFetchingLogsForSearch = false;
                }
            }

            // Filtragem local inteligente
            const matchedLogs = allLogsCache.filter(log => {
                const searchContent = normalizeStr([
                    log.message || '',
                    log.details || '',
                    log.user || '',
                    log.type || '',
                    log.imageOcrText || ''
                ].join(' '));

                // Todos os tokens de busca devem estar presentes no conteúdo do log
                return queryTokens.every(token => searchContent.includes(token));
            });

            // Se o usuário limpou/alterou a pesquisa enquanto a requisição assíncrona terminava, abortamos o render
            if (activeSearchQuery !== term) return;

            // Renderização dos logs correspondentes
            listEl.innerHTML = '';
            
            // Oculta indicador de scroll durante a busca
            const wrapper = listEl.closest('.logs-wrapper');
            const mask = wrapper ? wrapper.querySelector('.scroll-indicator-mask') : null;
            if (mask) mask.style.opacity = '0';

            if (matchedLogs.length === 0) {
                const div = document.createElement('div');
                div.className = 'log-search-empty';
                div.style.cssText = 'text-align:center;padding:2rem;color:#888;';
                div.innerHTML = `<i data-lucide="search-x" style="display:block;margin:0 auto 0.5rem;"></i> Nenhum resultado para "${term}" no filtro ativo.`;
                listEl.appendChild(div);
                lucide.createIcons();
            } else {
                matchedLogs.forEach(log => {
                    const li = buildLogItemElement(log);
                    listEl.appendChild(li);
                });
                lucide.createIcons();
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

let selectedIcon = 'link'; // Mantém o ícone selecionado para o link temporário (escopo do módulo)

function setupLinks() {
    const btnCreate = document.getElementById('btn-create-link');
    if (!btnCreate) return;

    // Lógica do Seletor de Ícones
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
        const idInput = document.getElementById('link-id');
        const nameInput = document.getElementById('link-name');
        const urlInput = document.getElementById('link-url');
        
        const docId = idInput ? idInput.value : '';
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

            if (docId) {
                btnCreate.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Salvando...';
                if (window.lucide) lucide.createIcons();

                await updateDoc(doc(db, 'dynamicLinks', docId), {
                    name: name,
                    url: url,
                    icon: selectedIcon
                });

                showNotification('Link atualizado com sucesso!', 'success');
                await saveLog('link-alterado', `Link temporário alterado: "${name}"`, url, `O administrador editou os dados de um link temporário.`);
                
                window.resetLinkForm();
            } else {
                btnCreate.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Criando...';
                if (window.lucide) lucide.createIcons();

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
            }
        } catch (error) {
            console.error('Erro ao salvar link:', error);
            showNotification('Erro ao salvar link.', 'error');
        } finally {
            btnCreate.disabled = false;
            if (docId) {
                btnCreate.innerHTML = '<i data-lucide="save"></i> Salvar Alterações';
            } else {
                btnCreate.innerHTML = '<i data-lucide="plus"></i> Criar Botão';
            }
            lucide.createIcons();
        }
    });

    const btnCancelEdit = document.getElementById('btn-cancel-edit-link');
    if (btnCancelEdit) {
        btnCancelEdit.addEventListener('click', () => {
            window.resetLinkForm();
        });
    }

    loadAdminLinks();
}

// Funções para controle de Edição de Links
window.startEditLink = function(id, name, url, icon) {
    const idInput = document.getElementById('link-id');
    const nameInput = document.getElementById('link-name');
    const urlInput = document.getElementById('link-url');
    const formTitle = document.getElementById('link-form-title');
    const formDesc = document.getElementById('link-form-desc');
    const btnCreate = document.getElementById('btn-create-link');
    const btnCancel = document.getElementById('btn-cancel-edit-link');
    
    if (idInput) idInput.value = id;
    if (nameInput) {
        nameInput.value = name;
        // atualiza contador de caracteres
        const counterSpan = document.getElementById('link-name-counter');
        if (counterSpan) {
            counterSpan.textContent = `${name.length}/30`;
            counterSpan.style.color = name.length >= 30 ? '#ff4444' : 'var(--text-secondary)';
        }
    }
    if (urlInput) urlInput.value = url;
    
    // Atualiza ícone selecionado
    selectedIcon = icon || 'link';
    const resetPreview = document.getElementById('selected-icon-preview');
    if (resetPreview) {
        const newIcon = document.createElement('i');
        newIcon.id = 'selected-icon-preview';
        newIcon.setAttribute('data-lucide', selectedIcon);
        resetPreview.parentNode.replaceChild(newIcon, resetPreview);
    }
    const iconOptions = document.querySelectorAll('.icon-option');
    iconOptions.forEach(o => {
        o.classList.remove('active');
        if (o.getAttribute('data-icon') === selectedIcon) o.classList.add('active');
    });

    if (formTitle) formTitle.textContent = 'Editar Link Temporário';
    if (formDesc) formDesc.textContent = 'Edite o texto e a URL do botão.';
    
    if (btnCreate) {
        btnCreate.innerHTML = '<i data-lucide="save"></i> Salvar Alterações';
    }
    if (btnCancel) btnCancel.style.display = 'block';
    
    // Rolar suavemente para o formulário
    const sectionLinks = document.getElementById('section-links');
    if (sectionLinks) {
        sectionLinks.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (window.lucide) lucide.createIcons();
};

window.resetLinkForm = function() {
    const idInput = document.getElementById('link-id');
    const nameInput = document.getElementById('link-name');
    const urlInput = document.getElementById('link-url');
    const formTitle = document.getElementById('link-form-title');
    const formDesc = document.getElementById('link-form-desc');
    const btnCreate = document.getElementById('btn-create-link');
    const btnCancel = document.getElementById('btn-cancel-edit-link');
    
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    
    const counterSpan = document.getElementById('link-name-counter');
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
    }
    const iconOptions = document.querySelectorAll('.icon-option');
    iconOptions.forEach(o => {
        o.classList.remove('active');
        if (o.getAttribute('data-icon') === 'link') o.classList.add('active');
    });

    if (formTitle) formTitle.textContent = 'Criar Link Temporário';
    if (formDesc) formDesc.textContent = 'Adicione um novo botão no site dos músicos.';
    
    if (btnCreate) {
        btnCreate.innerHTML = '<i data-lucide="plus"></i> Criar Botão';
    }
    if (btnCancel) btnCancel.style.display = 'none';
    
    if (window.lucide) lucide.createIcons();
};

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
                    <button class="btn-edit-notif" title="Editar Link" data-id="${id}" data-name="${data.name}" data-url="${data.url}" data-icon="${iconName}">
                        <i data-lucide="edit-2"></i>
                    </button>
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

        listEl.querySelectorAll('.btn-edit-notif').forEach(btn => {
            btn.addEventListener('click', () => {
                const docId = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                const url = btn.getAttribute('data-url');
                const icon = btn.getAttribute('data-icon');
                
                window.startEditLink(docId, name, url, icon);
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

/**
 * FASE 3: GESTÃO DE ATESTADOS MÉDICOS
 * Gerencia a visualização, edição e arquivamento de atestados processados pela IA.
 */
function initAtestadosManagement() {
    const atestadosGrid = document.getElementById('atestados-grid');
    const atestadosGridContainer = document.getElementById('atestados-grid-container');
    const atestadoModal = document.getElementById('atestado-modal');
    const btnCloseAtestadoModal = document.getElementById('btn-close-atestado-modal');
    
    if (!atestadosGrid || !atestadoModal) return;

    // Referências do Formulário no Modal
    const modalPdfViewer = document.getElementById('atestado-pdf-viewer');
    const inputEditId = document.getElementById('atestado-edit-id');
    const inputEditNome = document.getElementById('atestado-edit-nome');
    const inputEditCid = document.getElementById('atestado-edit-cid');
    const inputEditInicio = document.getElementById('atestado-edit-inicio');
    const inputEditFim = document.getElementById('atestado-edit-fim');
    const inputEditDias = document.getElementById('atestado-edit-dias');
    const inputEditResumo = document.getElementById('atestado-edit-resumo');
    
    const btnSaveEdit = document.getElementById('btn-save-atestado-edit');
    const btnDownloadDelete = document.getElementById('btn-download-delete-atestado');
    let currentAtestadoPath = ''; // Armazena o caminho do arquivo para deleção segura

    // Helper: Calcular data final
    function calculateEndDate(startDateStr, days) {
        if (!startDateStr || isNaN(days) || days <= 0) return null;
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(start);
        end.setDate(start.getDate() + parseInt(days) - 1);
        return end.toISOString().split('T')[0];
    }

    // Atualizar campo de fim automaticamente
    function updateEndDateUI() {
        const endStr = calculateEndDate(inputEditInicio.value, inputEditDias.value);
        inputEditFim.value = endStr || '';
    }

    inputEditInicio.addEventListener('change', updateEndDateUI);
    inputEditDias.addEventListener('input', updateEndDateUI);

    // 1. Escutar atestados pendentes no Firestore
    const q = query(collection(db, "medicalCertificates"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            atestadosGridContainer.classList.remove('visible');
            atestadosGrid.innerHTML = '';
            return;
        }

        atestadosGridContainer.classList.add('visible');
        atestadosGrid.innerHTML = '';

        // Se houver mais de 1 card, permite scroll lateral
        if (snapshot.size > 1) {
            atestadosGrid.classList.add('is-scrollable');
        } else {
            atestadosGrid.classList.remove('is-scrollable');
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = createAtestadoCard(docSnap.id, data);
            atestadosGrid.appendChild(card);
        });
        
        // Reinicializa ícones Lucide
        if (window.lucide) lucide.createIcons();
    });

    // 2. Função para criar o Card na Grade
    function createAtestadoCard(id, data) {
        const div = document.createElement('div');
        div.className = 'atestado-card';
        
        const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
        const dataFim = calculateEndDate(data.dataInicio, data.dias);
        const periodoStr = dataFim 
            ? `${formatBR(data.dataInicio)} a ${formatBR(data.dataFim || dataFim)}`
            : `Início: ${formatBR(data.dataInicio)}`;
        
        div.innerHTML = `
            <div class="atestado-card-icon">
                <i data-lucide="file-text"></i>
            </div>
            <div class="atestado-card-info">
                <h4 title="${data.nome || 'Nome não identificado'}">${data.nome || 'Nome não identificado'}</h4>
                <p>CID: <strong>${data.cid || '---'}</strong> | <strong>${data.dias || '0'} dias</strong></p>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">${periodoStr}</p>
            </div>
            <div class="atestado-card-actions">
                <button class="btn-primary btn-view-atestado" data-id="${id}" style="width: 100%; border-radius: 12px;">
                    <i data-lucide="eye"></i> Revisar
                </button>
            </div>
        `;

        // Evento de clique no botão Revisar
        div.querySelector('.btn-view-atestado').addEventListener('click', () => openAtestadoModal(id, data));

        return div;
    }

    // 3. Abrir Modal com dados
    async function openAtestadoModal(id, data) {
        inputEditId.value = id;
        currentAtestadoPath = data.filePath || ''; // Salva o caminho para o botão de apagar
        inputEditNome.value = data.nome || '';
        inputEditCid.value = data.cid || '';
        inputEditInicio.value = data.dataInicio || '';
        inputEditDias.value = data.dias || '';
        inputEditResumo.value = data.resumoCid || '';
        
        updateEndDateUI(); // Calcula o fim ao abrir
        
        // Limpar visualizador antes de carregar
        modalPdfViewer.src = '';
        
        try {
            // Se já tivermos a URL processada, usamos ela. Caso contrário, geramos via storage.
            if (data.processedFileUrl) {
                modalPdfViewer.src = data.processedFileUrl;
            } else if (data.filePath) {
                console.log("📄 [Atestados] Buscando URL de download para:", data.filePath);
                const fileRef = ref(storage, data.filePath);
                const url = await getDownloadURL(fileRef);
                modalPdfViewer.src = url;
            }
        } catch (err) {
            console.error("Erro ao carregar PDF:", err);
            showNotification('Erro ao carregar o visualizador de PDF.', 'error');
        }
        
        atestadoModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (window.lucide) lucide.createIcons();
    }

    // 4. Fechar Modal
    function closeAtestadoModal() {
        atestadoModal.style.display = 'none';
        modalPdfViewer.src = '';
        document.body.style.overflow = 'auto';
    }

    if (btnCloseAtestadoModal) btnCloseAtestadoModal.addEventListener('click', closeAtestadoModal);

    // 5. Baixar e Apagar (Ação Unificada de Arquivamento)
    if (btnDownloadDelete) {
        btnDownloadDelete.addEventListener('click', async () => {
            // Validação de Segurança: Verificar se o administrador está logado
            if (!auth.currentUser) {
                showNotification('Sessão expirada ou não autorizada. Faça login novamente.', 'error');
                return;
            }

            const id = inputEditId.value;
            const nomeMusico = inputEditNome.value;
            const cid = inputEditCid.value;
            const dias = inputEditDias.value;
            const inicio = inputEditInicio.value;
            const fim = inputEditFim.value;
            const resumo = inputEditResumo.value;
            
            if (!confirm(`Tem certeza que deseja baixar o atestado de "${nomeMusico}" e apagar os dados do servidor?\n\nAs correções feitas nos campos serão salvas apenas no histórico de logs.`)) {
                return;
            }

            try {
                const btn = btnDownloadDelete;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processando...';
                if (window.lucide) lucide.createIcons();

                // 1. Criar Log de Auditoria
                try {
                    const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
                    const detailsText = `CID: ${cid} | Período: ${formatBR(inicio)} a ${formatBR(fim)} (${dias} dias)\n\nParecer: ${resumo}`;
                    await saveLog("atestado", `Atestado revisado e arquivado: ${nomeMusico}`, null, detailsText);
                } catch (logErr) {
                    console.error("⚠️ [Atestados] Erro no log:", logErr);
                }

                // 2. Buscar o arquivo (Blob) - FAZER ANTES DE APAGAR
                console.log("📥 [Atestados] Preparando download...");
                const fileRef = ref(storage, currentAtestadoPath);
                const blob = await getBlob(fileRef);

                // 3. Apagar do Servidor (Storage e Firestore) - FAZER ANTES DO DOWNLOAD
                console.log("🔥 [Atestados] Limpando servidor...");
                try {
                    await deleteObject(fileRef);
                } catch (e) { console.error("Erro storage:", e); }

                try {
                    const docRef = doc(db, "medicalCertificates", id);
                    await deleteDoc(docRef);
                } catch (e) { console.error("Erro firestore:", e); }

                // 4. Fechar Interface Imediatamente
                closeAtestadoModal();
                showNotification('Arquivado com sucesso!', 'success');

                // 5. Disparar o Download/Preview (Último passo)
                if (blob) {
                    const blobUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    const safeNome = nomeMusico.replace(/\s+/g, '_');
                    link.download = `atestado_${safeNome}_${dias}_dias_${cid}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                }
            } catch (error) {
                console.error("Erro ao arquivar atestado:", error);
                showNotification(`Erro ao processar arquivamento: ${error.message}`, 'error');
            } finally {
                btnDownloadDelete.disabled = false;
                btnDownloadDelete.innerHTML = '<i data-lucide="download-cloud"></i> Baixar e Apagar do Servidor';
                if (window.lucide) lucide.createIcons();
            }
        });
    }
}

// ================= MÓDULO DE CALENDÁRIO INTERATIVO =================
function initCalendarManagement() {
    console.log("Inicializando Módulo de Calendário Interativo...");
    window.eventosPreviaIA = [];
    window.editingPreviaTempId = null;

    function inferirEventData(evento) {
        const data = { ...evento };
        
        // Normalizar data
        if (!data.date) {
            data.date = "";
        }
        
        // 1. Horários Padrão por Categoria de Evento e fallbacks de preenchimento
        if (!data.horarioInicio || data.horarioInicio === "00:00" || data.horarioInicio === "") {
            let diaDaSemana = -1;
            let mes = -1;
            if (data.date && data.date.includes('-')) {
                try {
                    const parsedDate = new Date(data.date + 'T12:00:00');
                    diaDaSemana = parsedDate.getDay(); // 0 = Domingo
                    mes = parsedDate.getMonth(); // 0 = Janeiro
                } catch (e) {
                    console.error("Erro ao analisar data para fallback de horário:", e);
                }
            }
            
            // Concertos aos Domingos (TMSP): O horário padrão é 11h. Exceção rara: Janeiro às 17h.
            if (data.tipo === 'concerto' && diaDaSemana === 0) {
                if (mes === 0) {
                    data.horarioInicio = "17:00";
                } else {
                    data.horarioInicio = "11:00";
                }
            }
            // Concertos de Camerata/Oficina (Sala do Conservatório): O horário padrão é 19h (sextas-feiras) ou 18h (sábados).
            else if (data.tipo === 'concerto_camerata' || (data.tipo === 'concerto' && data.local && data.local.includes("Sala do Conservatório"))) {
                if (diaDaSemana === 5) { // Sexta
                    data.horarioInicio = "19:00";
                } else if (diaDaSemana === 6) { // Sábado
                    data.horarioInicio = "18:00";
                }
            }
            // Apresentações "No Vale": O horário padrão é 16h (geralmente às quintas-feiras).
            else if (data.local && data.local.toLowerCase().includes("no vale")) {
                data.horarioInicio = "16:00";
            }
            // Reavaliações de Músicos: O período é rigorosamente das 13h às 16h30.
            else if (data.descricaoEnsaio && data.descricaoEnsaio.toLowerCase().includes("reavaliação")) {
                data.horarioInicio = "13:00";
                data.horarioFim = "16:30";
            }
            // Testes Externos (Audições): Costumam começar às 13h ou 14h.
            else if (data.descricaoEnsaio && (data.descricaoEnsaio.toLowerCase().includes("teste") || data.descricaoEnsaio.toLowerCase().includes("audição"))) {
                data.horarioInicio = "13:00";
            }
        }
        
        if (!data.horarioFim) {
            data.horarioFim = "00:00";
        }

        // 2. Locais Padrão (Venues)
        if (!data.local || data.local.trim() === "") {
            let diaDaSemana = -1;
            if (data.date && data.date.includes('-')) {
                try {
                    const parsedDate = new Date(data.date + 'T12:00:00');
                    diaDaSemana = parsedDate.getDay();
                } catch (e) {}
            }
            
            // Sábados Matinais / Concertos Externos: Sala de Ensaios do TMSP (Subsolo) deve ser proposta como local padrão para ensaios matinais no sábado.
            const isSaturdayMorning = diaDaSemana === 6 && data.horarioInicio && parseInt(data.horarioInicio.split(':')[0], 10) < 12;
            
            if (isSaturdayMorning && (data.tipo.includes('ensaio') || data.tipo === 'tutti')) {
                data.local = "Sala de Ensaios do TMSP (Subsolo)";
            }
            // Default Geral: Se não houver local especificado para um concerto da orquestra completa, o local padrão é o TMSP (Teatro Municipal de São Paulo).
            else if (data.tipo === 'concerto') {
                data.local = "Teatro Municipal de São Paulo";
            }
        }

        // Normalização de nomes de local: Normalizar "Sala de Ensaio" (ou variações como "Sala de Ensaios") para "Sala de Ensaios do TMSP (Subsolo)"
        if (data.local) {
            const normalizedLocal = data.local.toLowerCase().trim();
            if (normalizedLocal === "sala de ensaio" || normalizedLocal === "sala de ensaios" || normalizedLocal === "sala de ensaio do tmsp" || normalizedLocal === "sala de ensaios tmsp" || normalizedLocal === "sala de ensaio tmsp") {
                data.local = "Sala de Ensaios do TMSP (Subsolo)";
            }
        }

        // 3. Regex de extração de links do Google Maps (e higienização de endereço)
        const mapsRegex = /(https?:\/\/(?:maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\/[^\s\)\],]+)/i;

        if (data.local) {
            const matchLocal = data.local.match(mapsRegex);
            if (matchLocal) {
                if (!data.localMapsUrl) data.localMapsUrl = matchLocal[1];
                data.local = data.local.replace(matchLocal[1], '').replace(/\s+/g, ' ').trim();
            }
        }

        if (data.localComplemento) {
            const matchComp = data.localComplemento.match(mapsRegex);
            if (matchComp) {
                if (!data.localMapsUrl) data.localMapsUrl = matchComp[1];
                data.localComplemento = data.localComplemento.replace(matchComp[1], '').replace(/\s+/g, ' ').trim();
            }
        }

        if (data.avisos && Array.isArray(data.avisos)) {
            data.avisos = data.avisos.map(aviso => {
                if (typeof aviso === 'string') {
                    const matchAviso = aviso.match(mapsRegex);
                    if (matchAviso) {
                        if (!data.localMapsUrl) data.localMapsUrl = matchAviso[1];
                        return aviso.replace(matchAviso[1], '').replace(/\s+/g, ' ').trim();
                    }
                }
                return aviso;
            });
        }

        // 4. Detecção de status de cancelamento se contiver palavra-chave no texto
        const txtCompleto = `${data.descricaoEnsaio || ''} ${data.concertoNome || ''} ${data.local || ''}`.toLowerCase();
        if (txtCompleto.includes('cancelado') || txtCompleto.includes('ensaio cancelado') || txtCompleto.includes('concerto cancelado') || txtCompleto.includes('evento cancelado') || txtCompleto.includes('cancelados')) {
            data.status = "Cancelado";
        } else if (!data.status) {
            data.status = "Confirmado";
        }

        return data;
    }

    const btnIaTexto = document.getElementById('btn-ia-texto');
    const btnIaPdf = document.getElementById('btn-ia-pdf');
    const containerTexto = document.getElementById('ia-texto-container');
    const containerPdf = document.getElementById('ia-pdf-container');
    const btnProcessTexto = document.getElementById('btn-process-ia-texto');
    const btnProcessPdf = document.getElementById('btn-process-ia-pdf');
    const textareaEmail = document.getElementById('ia-email-text');
    const inputPdf = document.getElementById('ia-pdf-file');
    const formContainer = document.getElementById('calendario-form-container');

    // Referências ao modal
    const iaModalOverlay = document.getElementById('ia-modal-overlay');
    const iaModalTitle = document.getElementById('ia-modal-title');
    const iaModalSubtitle = document.getElementById('ia-modal-subtitle');
    const btnIaModalClose = document.getElementById('btn-ia-modal-close');

    function openIaModal(tipo) {
        // Mostrar painel correto
        containerTexto.style.display = tipo === 'texto' ? 'flex' : 'none';
        containerPdf.style.display  = tipo === 'pdf'   ? 'flex' : 'none';

        // Atualizar título/subtítulo do modal
        if (tipo === 'texto') {
            iaModalTitle.textContent    = 'Colar E-mail';
            iaModalSubtitle.textContent = 'Extraia eventos do texto do cronograma';
        } else {
            iaModalTitle.textContent    = 'Enviar PDF';
            iaModalSubtitle.textContent = 'Extraia eventos a partir de um arquivo PDF';
        }

        iaModalOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (window.lucide) lucide.createIcons();
    }

    function closeIaModal() {
        iaModalOverlay.style.display = 'none';
        document.body.style.overflow = '';
        
        // Resetar estados do painel de upload de PDF do Robô IA
        if (inputPdf) {
            inputPdf.value = '';
            const dropArea = inputPdf.nextElementSibling;
            if (dropArea) {
                dropArea.classList.remove('has-file');
                const fileMsg = dropArea.querySelector('.file-msg');
                if (fileMsg) {
                    fileMsg.textContent = 'Clique ou arraste o PDF do cronograma aqui';
                }
            }
        }
        if (textareaEmail) {
            textareaEmail.value = '';
        }
    }

    // UI: Alternar abas Texto / PDF
    if (btnIaTexto && btnIaPdf) {
        btnIaTexto.addEventListener('click', () => openIaModal('texto'));
        btnIaPdf.addEventListener('click',   () => openIaModal('pdf'));
    }

    // Fechar modal
    if (btnIaModalClose) btnIaModalClose.addEventListener('click', closeIaModal);
    if (iaModalOverlay)  iaModalOverlay.addEventListener('click', (e) => {
        if (e.target === iaModalOverlay) closeIaModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && iaModalOverlay && iaModalOverlay.style.display !== 'none') closeIaModal();
    });

    // Escutar mudanças no input de PDF do Robô IA para feedback visual
    if (inputPdf) {
        inputPdf.addEventListener('change', (e) => {
            const dropArea = inputPdf.nextElementSibling;
            const fileMsg = dropArea ? dropArea.querySelector('.file-msg') : null;
            const file = e.target.files[0];

            if (file) {
                if (dropArea) dropArea.classList.add('has-file');
                if (fileMsg) {
                    fileMsg.textContent = `📄 ${file.name}`;
                }
            } else {
                if (dropArea) dropArea.classList.remove('has-file');
                if (fileMsg) {
                    fileMsg.textContent = 'Clique ou arraste o PDF do cronograma aqui';
                }
            }
        });
    }

    // Processar Texto com IA
    if (btnProcessTexto) {
        btnProcessTexto.addEventListener('click', async () => {
            const text = textareaEmail.value.trim();
            if (!text) {
                showNotification("Cole o texto do e-mail antes de processar.", "warning");
                return;
            }
            processarIA({ text });
        });
    }

    // Processar PDF com IA
    if (btnProcessPdf) {
        btnProcessPdf.addEventListener('click', async () => {
            const file = inputPdf.files[0];
            if (!file || file.type !== "application/pdf") {
                showNotification("Selecione um arquivo PDF válido.", "warning");
                return;
            }
            
            // Converter PDF para Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                processarIA({ pdfBase64: base64, mimeType: file.type });
            };
        });
    }

    async function processarIA(payload) {
        try {
            showNotification("Processando com Inteligência Artificial...", "info");
            const btn = payload.text ? btnProcessTexto : btnProcessPdf;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Aguarde...';
            btn.disabled = true;
            if (window.lucide) lucide.createIcons();

            // Referência para a Cloud Function com timeout estendido de 5 minutos (300s)
            const parseSchedule = httpsCallable(functions, 'parseScheduleWithGemini', { timeout: 300000 });
            const result = await parseSchedule(payload);
            const data = result.data;
            
            console.log("Retorno da IA:", data);
            showNotification("Processamento concluído! Verifique os dados abaixo.", "success");
            
            closeIaModal();
            renderPreviaEventos(data);

        } catch (error) {
            console.error("Erro no processamento da IA:", error);
            showNotification("Erro na IA: " + error.message, "error");
        } finally {
            const btn = payload.text ? btnProcessTexto : btnProcessPdf;
            btn.innerHTML = payload.text ? '<i data-lucide="sparkles"></i> Processar com IA' : '<i data-lucide="sparkles"></i> Processar PDF com IA';
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    }

    function renderPreviaEventos(data) {
        formContainer.style.display = 'block';
        
        // Limpar os elementos anteriores de IA, mas não o formulário principal
        const prevPrevia = document.getElementById('previa-ia-container');
        if (prevPrevia) prevPrevia.remove();

        if (!data || !data.eventos) {
            return;
        }

        // 1. Mapear e carregar as prévias de eventos na lista global de memória
        window.eventosPreviaIA = (data.eventos || []).map(evento => {
            const rawEvent = {
                _tempId: Math.random().toString(36).substring(2, 9),
                date: evento.date || "",
                tipo: evento.tipo || "ensaio_tutti",
                naipe: (evento.tipo === 'ensaio_naipe' && evento.naipe) ? evento.naipe : null,
                descricaoEnsaio: evento.descricaoEnsaio || evento.descricao || "Ensaio",
                horarioInicio: evento.horarioInicio || "00:00",
                horarioFim: evento.horarioFim || "00:00",
                local: evento.local || "",
                localComplemento: evento.localComplemento || null,
                localMapsUrl: evento.localMapsUrl || null,
                concertoNome: evento.concertoNome || evento.concertName || null,
                repertorio: (evento.repertorio && evento.repertorio.length > 0) ? evento.repertorio : null,
                avisos: (evento.avisos && evento.avisos.length > 0) ? evento.avisos : null
            };
            return inferirEventData(rawEvent);
        });

        // 2. Mudar a data do calendário administrativo para o mês do primeiro evento proposto
        if (window.eventosPreviaIA.length > 0) {
            const firstEvent = window.eventosPreviaIA[0];
            if (firstEvent.date && firstEvent.date.includes('-')) {
                try {
                    const parts = firstEvent.date.split('-');
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    currentListDate = new Date(year, month, 1);
                } catch (err) {
                    console.error("Erro ao mudar a data do calendário:", err);
                }
            }
        }

        // 3. Recarregar os eventos do mês (isso vai ler do Firestore + nossa lista na memória)
        loadMonthlyEvents();

        // 4. Se houver avisos da semana, exibimos um box específico na coluna lateral
        if (data.avisos_semana && data.avisos_semana.length > 0) {
            const previaDiv = document.createElement('div');
            previaDiv.id = 'previa-ia-container';
            previaDiv.style.marginTop = '1.5rem';

            const avisosContainer = document.createElement('div');
            avisosContainer.className = 'admin-card';
            avisosContainer.style.borderLeft = '4px solid #f59e0b'; // Laranja
            avisosContainer.innerHTML = `<h4>Avisos da Semana Gerados pela IA</h4>`;
            
            data.avisos_semana.forEach(aviso => {
                avisosContainer.innerHTML += `<p style="margin-top: 0.5rem;"><strong>${aviso.tipo}:</strong> ${aviso.texto}</p>`;
            });

            const btnSaveAviso = document.createElement('button');
            btnSaveAviso.className = 'btn-primary';
            btnSaveAviso.style.marginTop = '1rem';
            btnSaveAviso.innerHTML = '<i data-lucide="save"></i> Salvar Avisos';
            
            btnSaveAviso.addEventListener('click', async (e) => {
                try {
                    btnSaveAviso.disabled = true;
                    btnSaveAviso.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Salvando...';
                    if (window.lucide) lucide.createIcons();

                    for (const aviso of data.avisos_semana) {
                        const avisoData = {
                            tipo: aviso.tipo || "",
                            texto: aviso.texto || "",
                            createdAt: serverTimestamp(),
                            criadoPor: auth.currentUser.uid
                        };
                        await addDoc(collection(db, "avisos_semana"), avisoData);
                    }
                    showNotification("Avisos da semana salvos!", "success");
                    btnSaveAviso.innerHTML = '<i data-lucide="check"></i> Salvos';
                    btnSaveAviso.style.background = '#4CAF50';
                    btnSaveAviso.style.borderColor = '#4CAF50';
                    if (window.lucide) lucide.createIcons();
                } catch (err) {
                    showNotification("Erro ao salvar avisos: " + err.message, "error");
                    btnSaveAviso.disabled = false;
                    btnSaveAviso.innerHTML = '<i data-lucide="save"></i> Salvar Avisos';
                    if (window.lucide) lucide.createIcons();
                }
            });

            avisosContainer.appendChild(btnSaveAviso);
            previaDiv.appendChild(avisosContainer);
            formContainer.insertBefore(previaDiv, formContainer.firstChild);
            if (window.lucide) lucide.createIcons();
        }
    }

    // Formulário de Criação/Edição Manual
    const eventoForm = document.getElementById('evento-form');
    const eventoTipoSelect = document.getElementById('evento-tipo');
    const naipeWrapper = document.getElementById('naipe-wrapper');
    const btnCancelEvento = document.getElementById('btn-cancel-evento');

    if (eventoTipoSelect) {
        eventoTipoSelect.addEventListener('change', (e) => {
            if (e.target.value === 'ensaio_naipe') {
                naipeWrapper.style.display = 'block';
                document.getElementById('evento-naipe').setAttribute('required', 'true');
            } else {
                naipeWrapper.style.display = 'none';
                document.getElementById('evento-naipe').removeAttribute('required');
                document.getElementById('evento-naipe').value = '';
            }
        });
    }

    if (eventoForm) {
        eventoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = eventoForm.querySelector('button[type="submit"]');
            const originalBtnText = btnSubmit.innerHTML;
            
            try {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Salvando...';
                if (window.lucide) lucide.createIcons();

                const id = document.getElementById('evento-id').value;
                const tipo = document.getElementById('evento-tipo').value;
                const date = document.getElementById('evento-date').value;
                
                const repertorioLines = document.getElementById('evento-repertorio').value.split('\n').map(l => l.trim()).filter(l => l);
                const avisosLines = document.getElementById('evento-avisos').value.split('\n').map(l => l.trim()).filter(l => l);

                const status = document.getElementById('evento-status') ? document.getElementById('evento-status').value : 'Confirmado';

                const eventoData = {
                    date: date,
                    tipo: tipo,
                    naipe: tipo === 'ensaio_naipe' ? document.getElementById('evento-naipe').value : null,
                    descricaoEnsaio: document.getElementById('evento-descricao').value,
                    horarioInicio: document.getElementById('evento-inicio').value,
                    horarioFim: document.getElementById('evento-fim').value,
                    local: document.getElementById('evento-local').value,
                    localComplemento: document.getElementById('evento-complemento').value || null,
                    localMapsUrl: document.getElementById('evento-maps').value || null,
                    status: status,
                    concertoNome: document.getElementById('evento-concerto').value || null,
                    repertorio: repertorioLines.length > 0 ? repertorioLines : null,
                    avisos: avisosLines.length > 0 ? avisosLines : null,
                    mesRef: date.substring(0, 7), // YYYY-MM
                    updatedAt: serverTimestamp(),
                };

                const eventoDataNormalizado = inferirEventData(eventoData);

                if (id) {
                    // Update
                    const docRef = doc(db, "eventos", id);
                    await updateDoc(docRef, eventoDataNormalizado);
                    showNotification("Evento atualizado com sucesso!", "success");
                } else {
                    // Create
                    eventoDataNormalizado.createdAt = serverTimestamp();
                    eventoDataNormalizado.criadoPor = auth.currentUser.uid;
                    await addDoc(collection(db, "eventos"), eventoDataNormalizado);

                    // Se estávamos editando um evento gerado pela IA, remove ele da lista de prévias
                    if (window.editingPreviaTempId) {
                        const previewIdx = window.eventosPreviaIA.findIndex(evt => evt._tempId === window.editingPreviaTempId);
                        if (previewIdx !== -1) {
                            window.eventosPreviaIA.splice(previewIdx, 1);
                        }
                        window.editingPreviaTempId = null;
                    }

                    showNotification("Evento criado com sucesso!", "success");
                }

                eventoForm.reset();
                if (document.getElementById('evento-status')) document.getElementById('evento-status').value = 'Confirmado';
                document.getElementById('evento-id').value = '';
                window.editingPreviaTempId = null;
                if (naipeWrapper) naipeWrapper.style.display = 'none';
                loadMonthlyEvents();

            } catch(err) {
                showNotification("Erro ao salvar evento: " + err.message, "error");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = originalBtnText;
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    if (btnCancelEvento) {
        btnCancelEvento.addEventListener('click', () => {
            eventoForm.reset();
            if (document.getElementById('evento-status')) document.getElementById('evento-status').value = 'Confirmado';
            document.getElementById('evento-id').value = '';
            window.editingPreviaTempId = null;
            if (naipeWrapper) naipeWrapper.style.display = 'none';
        });
    }

    function preencherFormularioEvento(id, data) {
        document.getElementById('evento-id').value = id;
        document.getElementById('evento-tipo').value = data.tipo;
        if (data.tipo === 'ensaio_naipe') {
            if (naipeWrapper) naipeWrapper.style.display = 'block';
            document.getElementById('evento-naipe').value = data.naipe || '';
        } else {
            if (naipeWrapper) naipeWrapper.style.display = 'none';
            document.getElementById('evento-naipe').value = '';
        }
        document.getElementById('evento-descricao').value = data.descricaoEnsaio || '';
        document.getElementById('evento-date').value = data.date;
        document.getElementById('evento-inicio').value = data.horarioInicio || '';
        document.getElementById('evento-fim').value = data.horarioFim || '';
        document.getElementById('evento-local').value = data.local || '';
        document.getElementById('evento-complemento').value = data.localComplemento || '';
        document.getElementById('evento-maps').value = data.localMapsUrl || '';
        document.getElementById('evento-concerto').value = data.concertoNome || '';
        if (document.getElementById('evento-status')) {
            document.getElementById('evento-status').value = data.status || 'Confirmado';
        }
        document.getElementById('evento-repertorio').value = data.repertorio ? data.repertorio.join('\n') : '';
        document.getElementById('evento-avisos').value = data.avisos ? data.avisos.join('\n') : '';
    }

    // Lógica da Lista Mensal
    let currentListDate = new Date();
    const labelCurrentMonth = document.getElementById('label-current-month');
    const btnPrevMonth = document.getElementById('btn-prev-month');
    const btnNextMonth = document.getElementById('btn-next-month');
    const eventosList = document.getElementById('admin-eventos-list');

    function updateMonthLabel() {
        if (!labelCurrentMonth) return;
        const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
        const formatted = formatter.format(currentListDate);
        labelCurrentMonth.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    async function loadMonthlyEvents() {
        if (!eventosList) return;
        updateMonthLabel();
        
        eventosList.innerHTML = '<div class="loading-logs"><i data-lucide="loader-2" class="spin"></i> Carregando eventos...</div>';
        if (window.lucide) lucide.createIcons();

        try {
            const year = currentListDate.getFullYear();
            const month = currentListDate.getMonth() + 1;
            const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
            const endOfMonth = `${year}-${String(month).padStart(2, '0')}-31`;

            const eventosQuery = query(
                collection(db, "eventos"),
                where("date", ">=", startOfMonth),
                where("date", "<=", endOfMonth),
                orderBy("date", "asc")
            );

            const querySnapshot = await getDocs(eventosQuery);
            eventosList.innerHTML = '';

            // 1. Mapear eventos reais do Firestore
            const dbEvents = [];
            querySnapshot.forEach(docSnap => {
                dbEvents.push({
                    id: docSnap.id,
                    data: docSnap.data(),
                    isPreview: false
                });
            });

            // 2. Filtrar as prévias de IA correspondentes ao mês ativo
            const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
            const aiPreviews = (window.eventosPreviaIA || []).filter(evt => evt.date && evt.date.startsWith(monthPrefix)).map(evt => {
                return {
                    id: null,
                    _tempId: evt._tempId,
                    data: evt,
                    isPreview: true
                };
            });

            // 3. Mesclar e ordenar
            const combinedEvents = [...dbEvents, ...aiPreviews];

            if (combinedEvents.length === 0) {
                eventosList.innerHTML = '<div class="admin-notif-empty">Nenhum evento agendado ou prévia IA para este mês.</div>';
                return;
            }

            // Ordenar por data (ascendente) e horário de início (ascendente)
            combinedEvents.sort((a, b) => {
                const dateA = a.data.date || "";
                const dateB = b.data.date || "";
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                
                const timeA = a.data.horarioInicio || "00:00";
                const timeB = b.data.horarioInicio || "00:00";
                return timeA.localeCompare(timeB);
            });

            // 4. Renderizar cada card na linha do tempo
            combinedEvents.forEach(item => {
                const data = item.data;
                const card = document.createElement('div');
                card.className = (item.isPreview ? 'event-admin-card preview-ia' : 'event-admin-card') + (data.status === 'Cancelado' ? ' status-cancelado' : '');
                
                const splitDate = (data.date || "2026-01-01").split('-');
                const dia = splitDate[2] || "01";
                const dataObj = new Date(splitDate[0] || 2026, (splitDate[1] || 1) - 1, splitDate[2] || 1);
                const diasSemana = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
                const diaSemanaStr = diasSemana[dataObj.getDay()] || "???";
                
                // Tipo formatado para exibição
                let tipoLabel = 'Evento';
                if (data.tipo === 'ensaio_tutti') tipoLabel = 'Tutti';
                if (data.tipo === 'ensaio_naipe') tipoLabel = 'Naipe';
                if (data.tipo === 'concerto') tipoLabel = 'Concerto';

                // Resumo do evento (Repertório ou Avisos)
                let resumoHtml = '';
                if ((data.repertorio && data.repertorio.length > 0) || (data.avisos && data.avisos.length > 0)) {
                    const formatMarkdown = (text) => {
                        if (!text) return '';
                        return text
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>');
                    };

                    resumoHtml = `<div class="event-admin-summary-full">`;
                    
                    if (data.avisos && data.avisos.length > 0) {
                        resumoHtml += `
                            <div class="event-admin-summary-section">
                                <span class="summary-section-title"><i data-lucide="megaphone"></i> Avisos do Dia</span>
                                <ul class="event-admin-avisos-list">
                                    ${data.avisos.map(aviso => `<li>${formatMarkdown(aviso.trim())}</li>`).join('')}
                                </ul>
                            </div>
                        `;
                    }
                    
                    if (data.repertorio && data.repertorio.length > 0) {
                        resumoHtml += `
                            <div class="event-admin-summary-section">
                                <span class="summary-section-title"><i data-lucide="music-4"></i> Repertório</span>
                                <ul class="event-admin-repertorio-list">
                                    ${data.repertorio.map(item => {
                                        const trimmed = item.trim();
                                        if (trimmed.toLowerCase() === 'intervalo') {
                                            return `<li class="repertorio-intervalo">Intervalo</li>`;
                                        }
                                        return `<li>${formatMarkdown(trimmed)}</li>`;
                                    }).join('')}
                                </ul>
                            </div>
                        `;
                    }
                    
                    resumoHtml += `</div>`;
                }

                // Custom badge styles for previews vs database events
                let badgeHtml = item.isPreview 
                    ? `<span class="event-admin-type-badge ${data.tipo}">${tipoLabel}</span> <span class="event-admin-type-badge" style="background: rgba(245, 158, 11, 0.18); color: #d97706; font-weight: 600; border: 1px solid rgba(245, 158, 11, 0.3);"><i data-lucide="sparkles" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> IA - Validar</span>`
                    : `<span class="event-admin-type-badge ${data.tipo}">${tipoLabel}</span>`;

                if (data.status === 'Cancelado') {
                    badgeHtml += ` <span class="event-admin-type-badge status-cancelado-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600;"><i data-lucide="circle-slash" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Cancelado</span>`;
                }

                const footerActionsHtml = item.isPreview 
                    ? `
                    <div class="event-admin-card-actions">
                        <button class="event-admin-action-btn confirm btn-save-preview-ia" data-temp-id="${item._tempId}">
                            <i data-lucide="check"></i> Confirmar
                        </button>
                        <button class="event-admin-action-btn edit btn-edit-preview-ia" data-temp-id="${item._tempId}">
                            <i data-lucide="edit-3"></i> Editar
                        </button>
                        <button class="event-admin-action-btn preview-delete btn-delete-preview-ia" data-temp-id="${item._tempId}">
                            <i data-lucide="trash-2"></i> Descartar
                        </button>
                    </div>
                    `
                    : `
                    <div class="event-admin-card-actions">
                        <button class="event-admin-action-btn edit btn-edit-evento" data-id="${item.id}">
                            <i data-lucide="edit-3"></i> Editar
                        </button>
                        <button class="event-admin-action-btn delete btn-delete-evento" data-id="${item.id}">
                            <i data-lucide="trash-2"></i> Excluir
                        </button>
                    </div>
                    `;

                const mapsLinkHtml = data.localMapsUrl ? `
                    <div class="event-admin-detail event-admin-map-link-wrapper">
                        <i data-lucide="map"></i> 
                        <a href="${data.localMapsUrl}" target="_blank" class="event-admin-local-link">Ver no Google Maps</a>
                    </div>
                ` : '';

                card.innerHTML = `
                    <div class="event-admin-card-header">
                        <div class="event-admin-date-box">
                            <span class="day">${dia}</span>
                            <span class="month">${diaSemanaStr}</span>
                        </div>
                        <div class="event-admin-header-info">
                            ${badgeHtml}
                            <h4 class="event-admin-title">${data.descricaoEnsaio || data.concertoNome || 'Evento'} ${data.naipe ? `- ${data.naipe}` : ''}</h4>
                        </div>
                    </div>
                    
                    <div class="event-admin-card-body">
                        <div class="event-admin-detail">
                            <i data-lucide="clock"></i> 
                            <span>${data.horarioInicio} às ${data.horarioFim}</span>
                        </div>
                        <div class="event-admin-detail">
                            <i data-lucide="map-pin"></i> 
                            <span>${data.local} ${data.localComplemento ? `(${data.localComplemento})` : ''}</span>
                        </div>
                        ${mapsLinkHtml}
                        ${resumoHtml}
                    </div>

                    ${footerActionsHtml}
                `;
                eventosList.appendChild(card);
            });

            // 5. Configurar ouvintes de eventos para itens oficiais e prévias de IA

            // Ações de Eventos Reais: Deletar
            eventosList.querySelectorAll('.btn-delete-evento').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const targetBtn = e.currentTarget;
                    const id = targetBtn.getAttribute('data-id');
                    if (confirm("Tem certeza que deseja excluir este evento? Ação irreversível.")) {
                        try {
                            targetBtn.disabled = true;
                            targetBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
                            if (window.lucide) lucide.createIcons();
                            
                            await deleteDoc(doc(db, "eventos", id));
                            showNotification("Evento excluído.", "success");
                            loadMonthlyEvents();
                        } catch(err) {
                            showNotification("Erro ao excluir: " + err.message, "error");
                            targetBtn.disabled = false;
                            targetBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                            if (window.lucide) lucide.createIcons();
                        }
                    }
                });
            });

            // Ações de Eventos Reais: Editar
            eventosList.querySelectorAll('.btn-edit-evento').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        const docSnap = await getDoc(doc(db, "eventos", id));
                        if(docSnap.exists()){
                            const d = docSnap.data();
                            preencherFormularioEvento(id, d);
                            document.getElementById('calendario-form-container').scrollIntoView({behavior: 'smooth'});
                        }
                    } catch(err) {
                        showNotification("Erro ao carregar evento: " + err.message, "error");
                    }
                });
            });

            // Ações de Prévia IA: Confirmar (Gravar no Banco)
            eventosList.querySelectorAll('.btn-save-preview-ia').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const targetBtn = e.currentTarget;
                    const tempId = targetBtn.getAttribute('data-temp-id');
                    const previewIdx = window.eventosPreviaIA.findIndex(evt => evt._tempId === tempId);
                    if (previewIdx === -1) return;
                    const evento = window.eventosPreviaIA[previewIdx];

                    try {
                        targetBtn.disabled = true;
                        targetBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
                        if (window.lucide) lucide.createIcons();

                        const eventoData = {
                            date: evento.date || "",
                            tipo: evento.tipo || "ensaio_tutti",
                            naipe: (evento.tipo === 'ensaio_naipe' && evento.naipe) ? evento.naipe : null,
                            descricaoEnsaio: evento.descricaoEnsaio || "Ensaio",
                            horarioInicio: evento.horarioInicio || "00:00",
                            horarioFim: evento.horarioFim || "00:00",
                            local: evento.local || "",
                            localComplemento: evento.localComplemento || null,
                            localMapsUrl: evento.localMapsUrl || null,
                            status: evento.status || "Confirmado",
                            concertoNome: evento.concertoNome || null,
                            repertorio: (evento.repertorio && evento.repertorio.length > 0) ? evento.repertorio : null,
                            avisos: (evento.avisos && evento.avisos.length > 0) ? evento.avisos : null,
                            mesRef: evento.date ? evento.date.substring(0, 7) : "",
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            criadoPor: auth.currentUser.uid
                        };

                        await addDoc(collection(db, "eventos"), eventoData);
                        
                        // Remover da memória global
                        window.eventosPreviaIA.splice(previewIdx, 1);
                        
                        showNotification("Evento confirmado e adicionado à lista oficial!", "success");
                        loadMonthlyEvents();
                    } catch (err) {
                        showNotification("Erro ao confirmar evento: " + err.message, "error");
                        targetBtn.disabled = false;
                        targetBtn.innerHTML = '<i data-lucide="check"></i> Confirmar';
                        if (window.lucide) lucide.createIcons();
                    }
                });
            });

            // Ações de Prévia IA: Editar (Preencher Formulário Manual)
            eventosList.querySelectorAll('.btn-edit-preview-ia').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tempId = e.currentTarget.getAttribute('data-temp-id');
                    const previewIdx = window.eventosPreviaIA.findIndex(evt => evt._tempId === tempId);
                    if (previewIdx === -1) return;
                    const evento = window.eventosPreviaIA[previewIdx];

                    // Salvar o ID temporário sendo editado e preencher formulário (com id vazio no banco)
                    window.editingPreviaTempId = tempId;
                    preencherFormularioEvento("", evento);
                    
                    document.getElementById('calendario-form-container').scrollIntoView({behavior: 'smooth'});
                    showNotification("Prévia IA carregada no formulário. Faça seus ajustes e salve para criar o evento oficial.", "info");
                });
            });

            // Ações de Prévia IA: Descartar (Excluir apenas da memória)
            eventosList.querySelectorAll('.btn-delete-preview-ia').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tempId = e.currentTarget.getAttribute('data-temp-id');
                    const previewIdx = window.eventosPreviaIA.findIndex(evt => evt._tempId === tempId);
                    if (previewIdx !== -1) {
                        window.eventosPreviaIA.splice(previewIdx, 1);
                        showNotification("Rascunho de evento IA descartado.", "info");
                        loadMonthlyEvents();
                    }
                });
            });

            if (window.lucide) lucide.createIcons();

        } catch (error) {
            console.error("Erro ao carregar eventos do mês:", error);
            eventosList.innerHTML = `<div class="error-msg" style="display:block;">Erro: ${error.message}</div>`;
        }
    }

    if (btnPrevMonth) {
        btnPrevMonth.addEventListener('click', () => {
            currentListDate.setMonth(currentListDate.getMonth() - 1);
            loadMonthlyEvents();
        });
    }
    if (btnNextMonth) {
        btnNextMonth.addEventListener('click', () => {
            currentListDate.setMonth(currentListDate.getMonth() + 1);
            loadMonthlyEvents();
        });
    }

    // Carregar inicialmente se a div existir
    if (eventosList) {
        loadMonthlyEvents();
    }
}

// ================= MÓDULO DE GERENCIAMENTO DE MÚSICOS =================
function initMusiciansManagement() {
    console.log("Inicializando Módulo de Gerenciamento de Músicos...");

    const importInput = document.getElementById('import-excel-input');
    const searchInput = document.getElementById('musicos-search');
    const tbody = document.getElementById('musicos-tbody');
    const statTotal = document.getElementById('stat-total-musicos');
    const statBolsistas = document.getElementById('stat-bolsistas');
    const statMonitores = document.getElementById('stat-monitores');
    const statRestricoes = document.getElementById('stat-restricoes');

    const drawer = document.getElementById('musico-drawer');
    const drawerOverlay = document.getElementById('musico-drawer-overlay');
    const btnCloseDrawer = document.getElementById('btn-close-drawer');

    // Função utilitária para obter o link correto do WhatsApp a partir do número cadastrado
    const obterLinkWhatsapp = (telefone) => {
        if (!telefone || telefone === '-') return '';
        const digitos = telefone.toString().replace(/[^\d]/g, '');
        if (!digitos) return '';
        
        // Se tiver 10 ou 11 dígitos (DDD + número), adiciona o DDI 55 (Brasil)
        if (digitos.length === 10 || digitos.length === 11) {
            return `https://wa.me/55${digitos}`;
        }
        
        // Se já tiver 12 ou 13 dígitos (já contendo o DDI 55)
        if (digitos.length === 12 || digitos.length === 13) {
            return `https://wa.me/${digitos}`;
        }
        
        return `https://wa.me/${digitos}`;
    };

    // Função utilitária para calcular idade com segurança a partir de vários formatos de data do Excel / String
    const calcularIdade = (nascimentoVal) => {
        if (!nascimentoVal || nascimentoVal === '-') return null;
        let dataNasc = null;
        
        // Se for número serial de data do Excel (ex: 36457)
        if (!isNaN(nascimentoVal) && typeof nascimentoVal === 'number') {
            dataNasc = new Date((nascimentoVal - 25569) * 86400 * 1000);
        } else if (typeof nascimentoVal === 'string') {
            // Tenta fazer parse do formato DD/MM/YYYY
            const partes = nascimentoVal.trim().split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0], 10);
                const mes = parseInt(partes[1], 10) - 1;
                const ano = parseInt(partes[2], 10);
                dataNasc = new Date(ano, mes, dia);
            } else {
                // Tenta ISO YYYY-MM-DD
                const dataParsed = Date.parse(nascimentoVal);
                if (!isNaN(dataParsed)) {
                    dataNasc = new Date(dataParsed);
                }
            }
        }
        
        if (dataNasc && !isNaN(dataNasc.getTime())) {
            const hoje = new Date();
            let idade = hoje.getFullYear() - dataNasc.getFullYear();
            const m = hoje.getMonth() - dataNasc.getMonth();
            if (m < 0 || (m === 0 && hoje.getDate() < dataNasc.getDate())) {
                idade--;
            }
            // Evitar idade absurda de 126 anos (bug de data vazia no Excel)
            if (idade >= 120 || idade < 0) return null;
            return idade;
        }
        return null;
    };

    // Função para verificar se o integrante é músico ou bolsista (exclui equipe de apoio)
    function isMusicoOuBolsista(statusVal) {
        if (!statusVal) return false;
        const status = statusVal.toLowerCase().trim();
        // Exclui montagem, produção, coordenação, coo. artística, equipe técnica, arquivistas, etc.
        const isApoioOuAdmin = status.includes('montagem') ||
                               status.includes('produç') ||
                               status.includes('produc') ||
                               status.includes('coorden') ||
                               status.includes('coo.') ||
                               status.includes('diret') ||
                               status.includes('apoio') ||
                               status.includes('arquiv');
        return !isApoioOuAdmin;
    }

    let allMusicians = []; // Lista local em memória para busca reativa rápida

    // 1. Escutar a Coleção de Músicos no Firestore em tempo real
    if (tbody) {
        unsubscribeMusicians = onSnapshot(query(collection(db, "musicos")), (snapshot) => {
            allMusicians = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.statusFirebase !== "inativo") {
                    allMusicians.push({ id: docSnap.id, ...data });
                }
            });

            // Atualizar Estatísticas
            updateStats(allMusicians);
            
            // Renderizar a tabela (inicialmente com a lista inteira)
            renderMusiciansTable(allMusicians);
        }, (error) => {
            console.error("Erro ao escutar coleção de músicos:", error);
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #dc3545; padding: 2rem;">Erro ao carregar músicos: ${error.message}</td></tr>`;
        });
    }

    // 2. Função para atualizar os cards estatísticos
    function updateStats(musicians) {
        if (!statTotal) return;
        
        // Contabiliza somente bolsistas e monitores ativos
        const validMusicians = musicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            const status = (m.Status || '').toLowerCase();
            return status.includes('bolsista') || status.includes('monitor');
        });
        statTotal.textContent = validMusicians.length;
        
        const bolsistas = musicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            return (m.Status || '').toLowerCase().includes('bolsista');
        }).length;
        statBolsistas.textContent = bolsistas;
        
        const monitores = musicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            return (m.Status || '').toLowerCase().includes('monitor');
        }).length;
        statMonitores.textContent = monitores;
        
        // Filtra para contar somente quem possui restrições reais
        const restricoes = musicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            const r = (m['Restrição Alimentar'] || m['Restrição Alimentar '] || '').toString().toLowerCase().trim();
            if (r === "" || r === "-" || r === "não" || r === "não se aplica" || r.includes("sem restriç") || r.includes("sem restric") || r.includes("não possui") || r.includes("nao possui")) {
                return false;
            }
            return true;
        }).length;
        statRestricoes.textContent = restricoes;
    }

    // 3. Função para Renderizar a Tabela
    function renderMusiciansTable(musicians) {
        if (!tbody) return;
        
        if (musicians.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="padding: 2.5rem; text-align: center; color: #888;">Nenhum músico cadastrado ou ativo. Importe uma planilha para começar.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        musicians.forEach(musico => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-cpf', musico.id);
            tr.style.borderBottom = '1px solid #f0f2f5';
            tr.style.cursor = 'pointer';
            
            // Definir classe do badge de status
            let badgeClass = 'inativo';
            const statusLower = (musico.Status || '').toLowerCase();
            if (statusLower.includes('bolsista')) badgeClass = 'bolsista';
            else if (statusLower.includes('monitor')) badgeClass = 'monitor';
            else if (statusLower.includes('reg.titular') || statusLower.includes('titular')) badgeClass = 'reg-titular';
            else if (statusLower.includes('extra')) badgeClass = 'musico-extra';
            else if (statusLower.includes('desligado')) badgeClass = 'desligado';
            const whatsappLink = obterLinkWhatsapp(musico.TELEFONE);
            let telefoneHtml = musico.TELEFONE || '-';
            if (whatsappLink && musico.TELEFONE !== '-') {
                telefoneHtml = `
                    <div class="phone-column-container">
                        <span class="phone-number-text">${musico.TELEFONE}</span>
                        <a href="${whatsappLink}" target="_blank" class="whatsapp-quick-link" title="Chamar no WhatsApp" onclick="event.stopPropagation();">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style="fill: currentColor;">
                                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                            </svg>
                        </a>
                    </div>
                `;
            }

            tr.innerHTML = `
                <td style="padding: 1rem 1.2rem; font-weight: 600; color: #333;">${musico.NOMEARTISTICO || '-'}</td>
                <td style="padding: 1rem 1.2rem; color: #495057;">${musico.INSTRUMENTOS || '-'}</td>
                <td style="padding: 1rem 1.2rem;"><span class="field-value badge ${badgeClass}">${musico.Status || '-'}</span></td>
                <td style="padding: 1rem 1.2rem; color: #666; font-size: 0.9rem;">${telefoneHtml}</td>
                <td style="padding: 1rem 1.2rem; color: #666; font-size: 0.9rem;">${musico.EMAIL || '-'}</td>
            `;

            // Evento de clique para abrir a gaveta (Drawer)
            tr.addEventListener('click', () => {
                openMusicoDrawer(musico);
            });

            tbody.appendChild(tr);
        });
        
        if (window.lucide) lucide.createIcons();
    }

    // 4. Lógica de Busca Reativa Geral
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const queryText = e.target.value.toLowerCase().trim()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Normaliza tirando acentos
            
            if (queryText === "") {
                renderMusiciansTable(allMusicians);
                return;
            }

            const filtered = allMusicians.filter(musico => {
                const searchFields = [
                    musico.NOMEARTISTICO,
                    musico['NOME REGISTRO'],
                    musico.INSTRUMENTOS,
                    musico.Status,
                    musico.EMAIL,
                    musico.TELEFONE,
                    musico.CPF,
                    musico.RG,
                    musico['Endereço'],
                    musico.CEP,
                    musico['Dados Carro']
                ];
                
                return searchFields.some(field => {
                    if (!field) return false;
                    const normalizedField = field.toString().toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return normalizedField.includes(queryText);
                });
            });

            renderMusiciansTable(filtered);
        });
    }

    // 5. Lógica da Gaveta Lateral (Drawer)
    function openMusicoDrawer(musico) {
        if (!drawer || !drawerOverlay) return;

        // Preencher cabeçalho
        document.getElementById('drawer-musico-nome-artistico').textContent = musico.NOMEARTISTICO || 'Músico';
        document.getElementById('drawer-musico-instrumento').textContent = musico.INSTRUMENTOS || 'Sem instrumento';

        // Mapear campos lógicos
        const formatValue = (val) => (val === undefined || val === null || val.toString().trim() === "") ? '-' : val;

        document.getElementById('drawer-val-nome-registro').textContent = formatValue(musico['NOME REGISTRO']);
        document.getElementById('drawer-val-status').textContent = formatValue(musico.Status);
        
        // Ajustar badge do status da gaveta
        const statusBadge = document.getElementById('drawer-val-status');
        statusBadge.className = 'field-value badge'; // Reset
        let badgeClass = 'inativo';
        const statusLower = (musico.Status || '').toLowerCase();
        if (statusLower.includes('bolsista')) badgeClass = 'bolsista';
        else if (statusLower.includes('monitor')) badgeClass = 'monitor';
        else if (statusLower.includes('reg.titular') || statusLower.includes('titular')) badgeClass = 'reg-titular';
        else if (statusLower.includes('extra')) badgeClass = 'musico-extra';
        else if (statusLower.includes('desligado')) badgeClass = 'desligado';
        statusBadge.classList.add(badgeClass);

        document.getElementById('drawer-val-escalado').textContent = formatValue(musico.Escalado);
        document.getElementById('drawer-val-anos-oer').textContent = formatValue(musico['ANOS NA OER']);
        document.getElementById('drawer-val-tempo-oer').textContent = formatValue(musico['TEMPO NA OER']);
        
        // Formatar datas vindas do Excel
        const formatExcelDate = (val) => {
            if (!val || val === '-') return '-';
            if (!isNaN(val) && typeof val === 'number') {
                const date = new Date((val - 25569) * 86400 * 1000);
                return date.toLocaleDateString('pt-BR');
            }
            return val;
        };

        document.getElementById('drawer-val-inicio-contrato').textContent = formatExcelDate(musico['INICIO OER Contrato']);
        document.getElementById('drawer-val-termino-contrato').textContent = formatExcelDate(musico['TERMINO OER Contrato']);
        document.getElementById('drawer-val-tipo-contrato').textContent = formatValue(musico['Tipo Contrato Prorrogáveis por igual prazo']);
        document.getElementById('drawer-val-caderno-excertos').textContent = formatValue(musico['Data de Envio Caderno de Exceros']);

        // Contatos e Docs
        document.getElementById('drawer-val-email').textContent = formatValue(musico.EMAIL);
        
        const whatsappLinkDrawer = obterLinkWhatsapp(musico.TELEFONE);
        const telefoneVal = formatValue(musico.TELEFONE);
        const drawerTelefoneEl = document.getElementById('drawer-val-telefone');
        if (whatsappLinkDrawer && telefoneVal !== '-') {
            drawerTelefoneEl.innerHTML = `
                <div style="display: inline-flex; align-items: center; gap: 0.5rem;">
                    <span>${telefoneVal}</span>
                    <a href="${whatsappLinkDrawer}" target="_blank" class="whatsapp-quick-link" title="Chamar no WhatsApp" style="display: inline-flex; align-items: center; color: #25D366; transition: transform 0.2s; padding: 2px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style="width: 16px; height: 16px; fill: currentColor;">
                            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                        </svg>
                    </a>
                </div>
            `;
        } else {
            drawerTelefoneEl.textContent = telefoneVal;
        }
        document.getElementById('drawer-val-cpf').textContent = formatValue(musico.CPF);
        document.getElementById('drawer-val-rg').textContent = formatValue(musico.RG);
        document.getElementById('drawer-val-pis').textContent = formatValue(musico['PIS/PASEP']);
        document.getElementById('drawer-val-nascimento').textContent = formatExcelDate(musico['DATA DE NACIMENTO ']);
        
        // Calcular idade de forma inteligente
        const idadeCalculada = calcularIdade(musico['DATA DE NACIMENTO ']) || (typeof musico.IDADE === 'number' && musico.IDADE < 120 ? musico.IDADE : null);
        document.getElementById('drawer-val-idade').textContent = idadeCalculada ? `${idadeCalculada} anos` : '-';
        document.getElementById('drawer-val-genero').textContent = formatValue(musico.GENERO || musico['GÊNERO']);

        // Dados Bancários
        document.getElementById('drawer-val-banco').textContent = formatValue(musico['Banco '] || musico['Banco']);
        document.getElementById('drawer-val-agencia').textContent = formatValue(musico['Agencia '] || musico['Agencia']);
        document.getElementById('drawer-val-conta').textContent = formatValue(musico['Conta Corrente '] || musico['Conta Corrente']);

        // Logística e Endereço
        document.getElementById('drawer-val-endereco').textContent = formatValue(musico['Endereço'] || musico['Endereço ']);
        document.getElementById('drawer-val-cep').textContent = formatValue(musico.CEP);
        document.getElementById('drawer-val-restricao').textContent = formatValue(musico['Restrição Alimentar']);
        document.getElementById('drawer-val-carro').textContent = formatValue(musico['Dados Carro']);

        // Abrir gaveta
        drawer.classList.add('open');
        drawerOverlay.classList.add('open');
        if (window.lucide) lucide.createIcons();
    }

    function closeMusicoDrawer() {
        if (!drawer || !drawerOverlay) return;
        drawer.classList.remove('open');
        drawerOverlay.classList.remove('open');
    }

    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeMusicoDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeMusicoDrawer);

    // 6. Importação da Planilha (.xlsx) com SheetJS
    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showNotification("Lendo planilha...", "info");
            const label = document.getElementById('btn-import-excel-label');
            const originalHTML = label.innerHTML;
            label.style.pointerEvents = 'none';
            label.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 16px; height: 16px;"></i> <span>Processando...</span>';
            if (window.lucide) lucide.createIcons();

            const reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = async (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Buscar aba de dados de forma flexível (aceita "dados", "Dados" ou "Dados Gerais")
                    let sheetName = workbook.SheetNames.find(name => {
                        const n = name.trim().toLowerCase();
                        return n === 'dados' || n === 'dados gerais';
                    });
                    if (!sheetName) {
                        throw new Error('Aba "dados" ou "Dados Gerais" não encontrada na planilha. Verifique o nome da aba.');
                    }

                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
                    
                    if (rows.length === 0) {
                        throw new Error(`A aba "${sheetName}" está vazia.`);
                    }

                    showNotification(`Processando ${rows.length} linhas...`, "info");

                    // Validar se as colunas principais existem
                    const firstRow = rows[0];
                    if (!firstRow.hasOwnProperty('CPF') && !firstRow.hasOwnProperty('NOME REGISTRO')) {
                        throw new Error('Estrutura inválida. A planilha deve conter as colunas "CPF" e "NOME REGISTRO".');
                    }

                    // Iniciar Sincronização com o Firestore
                    let updatedCount = 0;
                    let desligadosCount = 0;
                    const incomingCpfs = new Set();

                    // Instanciar batch
                    const batch = writeBatch(db);

                    rows.forEach(row => {
                        let rawCpf = (row.CPF || "").toString().trim();
                        if (!rawCpf) return; // Pula linhas sem CPF

                        const cpfId = rawCpf.replace(/[^\d]/g, ""); // Apenas dígitos
                        if (!cpfId) return;

                        incomingCpfs.add(cpfId);

                        // Montar objeto de dados
                        const docData = {};
                        for (const key in row) {
                            if (row.hasOwnProperty(key)) {
                                docData[key] = row[key];
                            }
                        }

                        // Forçar campo de status no Firebase
                        docData.statusFirebase = "ativo";
                        docData.updatedAt = serverTimestamp();

                        const docRef = doc(db, "musicos", cpfId);
                        batch.set(docRef, docData, { merge: true });
                        updatedCount++;
                    });

                    // Identificar músicos no Firestore que não estão na planilha importada e marcá-los como "desligados"
                    const currentDocsSnap = await getDocs(collection(db, "musicos"));
                    currentDocsSnap.forEach(docSnap => {
                        const dbCpf = docSnap.id;
                        const data = docSnap.data();
                        if (!incomingCpfs.has(dbCpf) && data.statusFirebase !== "inativo" && data.statusFirebase !== "desligado") {
                            const docRef = doc(db, "musicos", dbCpf);
                            batch.update(docRef, { 
                                statusFirebase: "desligado",
                                Status: "Desligado",
                                updatedAt: serverTimestamp()
                            });
                            desligadosCount++;
                        }
                    });

                    // Salvar o timestamp da importação para expirar o cache da Ficha Técnica
                    const importRef = doc(db, "config", "musiciansImport");
                    batch.set(importRef, { lastImportTime: serverTimestamp() }, { merge: true });

                    // Gravar Lote
                    await batch.commit();

                    showNotification(`Sucesso! ${updatedCount} músicos atualizados. ${desligadosCount} marcados como desligados.`, "success");
                    
                    // Salvar log de auditoria
                    await saveLog("sistema", `Planilha de músicos importada com sucesso (${updatedCount} cadastros atualizados, ${desligadosCount} marcados como desligados)`, auth.currentUser.email);

                } catch (error) {
                    console.error("Erro ao importar planilha:", error);
                    showNotification("Erro na importação: " + error.message, "error");
                } finally {
                    importInput.value = '';
                    label.style.pointerEvents = 'auto';
                    label.innerHTML = originalHTML;
                    if (window.lucide) lucide.createIcons();
                }
            };
        });
    }

    // 7. Exportação da Planilha (.xlsx) com SheetJS (Apenas Bolsistas e Monitores)
    const exportBtn = document.getElementById('btn-export-excel');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (allMusicians.length === 0) {
                showNotification("Nenhum músico disponível para exportação.", "warning");
                return;
            }

            try {
                // Filtrar apenas bolsistas e monitores ativos
                const filtered = allMusicians.filter(m => {
                    if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
                    const status = (m.Status || '').toLowerCase();
                    return status.includes('bolsista') || status.includes('monitor');
                });

                if (filtered.length === 0) {
                    showNotification("Nenhum bolsista ou monitor encontrado para exportar.", "warning");
                    return;
                }

                showNotification("Gerando planilha...", "info");

                // Mapear dados limpando chaves do Firebase e calculando a idade correta
                const exportData = filtered.map(m => {
                    // Extrair campos de metadados internos para não exportar
                    const { id, statusFirebase, updatedAt, ...cleanData } = m;
                    
                    // Ajustar a Idade no JSON de exportação
                    const idadeVal = calcularIdade(m['DATA DE NACIMENTO ']) || (typeof m.IDADE === 'number' && m.IDADE < 120 ? m.IDADE : "");
                    cleanData['IDADE'] = idadeVal;

                    return cleanData;
                });

                // Criar pasta de trabalho do Excel
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Dados Gerais");

                // Gerar download do arquivo
                XLSX.writeFile(workbook, "OER_Bolsistas_e_Monitores.xlsx");
                showNotification("Planilha exportada com sucesso!", "success");

            } catch (err) {
                console.error("Erro ao exportar planilha:", err);
                showNotification("Erro na exportação: " + err.message, "error");
            }
        });
    }

    // 8. Geração de Ficha Técnica - Comunicação com IA & Fallback
    const btnGenerateFicha = document.getElementById('btn-generate-ficha-ia');
    const modalFicha = document.getElementById('ficha-tecnica-modal-overlay');
    const btnCloseFicha = document.getElementById('btn-ficha-modal-close');
    const btnCloseFichaFooter = document.getElementById('btn-close-ficha-modal-footer');
    const btnCopyFicha = document.getElementById('btn-copy-ficha');
    const resultContainer = document.getElementById('ficha-tecnica-result');

    // Seletores de Nome e Formato
    const btnNameArtistico = document.getElementById('btn-name-artistico');
    const btnNameCompleto = document.getElementById('btn-name-completo');
    const labelNameStatus = document.getElementById('label-name-status');
    const btnFormatMarkdown = document.getElementById('btn-format-markdown');
    const btnFormatEmail = document.getElementById('btn-format-email');
    const btnFormatLista = document.getElementById('btn-format-lista');

    let geminiFichaMarkdown = ""; // Armazena o retorno do Gemini

    const normalizarNaipe = (naipeStr) => {
        if (!naipeStr) return '';
        let s = naipeStr.toLowerCase().trim()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/s$/, ''); // singularizar
        if (s.includes('contrabaisco') || s.includes('contrabaixo')) {
            return 'contrabaixo';
        }
        return s;
    };

    // Função para obter dados estruturados a partir do Firestore em tempo real
    const obterDadosFichaEstruturados = (tipoNome) => {
        const regentes = [];
        const naipes = {};
        const naipesMonitores = {};
        const naipesBolsistas = {};
        const equipeTecnica = {
            "Coordenador Artístico": [],
            "Inspetor": [],
            "Produtor de Palco": [],
            "Montadores": []
        };

        const ordemNaipes = [
            "Primeiros Violinos",
            "Segundos Violinos",
            "Violas",
            "Violoncelos",
            "Contrabaixos",
            "Flautas",
            "Oboés",
            "Clarinetes",
            "Fagotes",
            "Trompa",
            "Trompete",
            "Trombones",
            "Tuba",
            "Harpa",
            "Piano",
            "Percussão"
        ];

        ordemNaipes.forEach(n => {
            naipesMonitores[n] = [];
            naipesBolsistas[n] = [];
        });

        allMusicians.forEach(m => {
            const status = (m.Status || '').toLowerCase().trim();
            
            // Filtro EMM (Angela): ignorar qualquer profissional cujo status contenha 'emm'
            if (status.includes('emm')) return;

            // Ignorar músicos desligados ou inativos
            if (status.includes('desligado') || m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return;

            const instrumento = (m.INSTRUMENTOS || '').trim();
            
            // Fallback de nomes: se o escolhido estiver em branco, usa o outro
            const nomeArtistico = (m.NOMEARTISTICO || '').trim();
            const nomeCompleto = (m['NOME REGISTRO'] || '').trim();
            const nome = (tipoNome === 'completo') 
                ? (nomeCompleto || nomeArtistico) 
                : (nomeArtistico || nomeCompleto);
                
            if (!nome) return;

            // Regentes
            if (status.includes('regente') || status.includes('reg.')) {
                let cargoExibicao = "Regente";
                if (status.includes('titular')) cargoExibicao = "Regente Titular";
                else if (status.includes('assistente')) cargoExibicao = "Regente Assistente";
                regentes.push({ nome, cargo: cargoExibicao });
            }
            // Equipe Técnica
            else if (status.includes('coo') || status.includes('coord') || status.includes('inspetor') || status.includes('produc') || status.includes('produç') || status.includes('montage') || status.includes('montador')) {
                if (status.includes('coo') || status.includes('coord')) {
                    equipeTecnica["Coordenador Artístico"].push(nome);
                } else if (status.includes('inspetor')) {
                    equipeTecnica["Inspetor"].push(nome);
                } else if (status.includes('produc') || status.includes('produç')) {
                    equipeTecnica["Produtor de Palco"].push(nome);
                } else if (status.includes('montage') || status.includes('montador')) {
                    equipeTecnica["Montadores"].push(nome);
                }
            }
            // Músico de Naipe
            else if (instrumento) {
                const instNormalizado = normalizarNaipe(instrumento);
                let naipeEncontrado = ordemNaipes.find(n => normalizarNaipe(n) === instNormalizado);
                
                if (!naipeEncontrado) {
                    naipeEncontrado = ordemNaipes.find(n => normalizarNaipe(n).includes(instNormalizado) || instNormalizado.includes(normalizarNaipe(n)));
                }

                const isMonitorOrSpalla = status.includes('monitor') || status.includes('spalla');
                
                if (naipeEncontrado) {
                    if (isMonitorOrSpalla) {
                        naipesMonitores[naipeEncontrado].push(nome);
                    } else {
                        naipesBolsistas[naipeEncontrado].push(nome);
                    }
                } else {
                    if (!naipesMonitores[instrumento]) {
                        naipesMonitores[instrumento] = [];
                        naipesBolsistas[instrumento] = [];
                    }
                    if (isMonitorOrSpalla) {
                        naipesMonitores[instrumento].push(nome);
                    } else {
                        naipesBolsistas[instrumento].push(nome);
                    }
                }
            }
        });

        // Mesclar monitores e bolsistas ordenando alfabeticamente
        Object.keys(naipesMonitores).forEach(naipe => {
            const monitoresOrdenados = naipesMonitores[naipe].sort((a, b) => a.localeCompare(b, 'pt-BR'));
            const bolsistasOrdenados = naipesBolsistas[naipe].sort((a, b) => a.localeCompare(b, 'pt-BR'));
            naipes[naipe] = [...monitoresOrdenados, ...bolsistasOrdenados];
        });

        // Garantir que o Regente Titular venha sempre antes do Regente Assistente
        regentes.sort((a, b) => {
            const pesoA = a.cargo === "Regente Titular" ? 1 : (a.cargo === "Regente Assistente" ? 2 : 3);
            const pesoB = b.cargo === "Regente Titular" ? 1 : (b.cargo === "Regente Assistente" ? 2 : 3);
            return pesoA - pesoB;
        });

        return { regentes, naipes, equipeTecnica };
    };

    const formatarGrupoNomesHTML = (nomes) => {
        if (nomes.length === 0) return '';
        if (nomes.length === 1) return nomes[0];
        const todosMenosUltimo = nomes.slice(0, -1).join(', ');
        return `${todosMenosUltimo} e ${nomes[nomes.length - 1]}`;
    };

    // 1. Gerador Markdown (WhatsApp)
    const gerarFichaMarkdown = (data) => {
        const { regentes, naipes, equipeTecnica } = data;
        let partes = [];

        regentes.forEach(r => {
            partes.push(`${r.cargo} ${r.nome}`);
        });

        const ordemNaipes = [
            "Primeiros Violinos", "Segundos Violinos", "Violas", "Violoncelos", "Contrabaixos",
            "Flautas", "Oboés", "Clarinetes", "Fagotes", "Trompa", "Trompete", "Trombones",
            "Tuba", "Harpa", "Piano", "Percussão"
        ];

        ordemNaipes.forEach(naipe => {
            const list = naipes[naipe] || [];
            if (list.length > 0) {
                let formattedList = [...list];
                if (naipe === "Primeiros Violinos") {
                    formattedList[0] = `**${formattedList[0]}*`;
                } else {
                    formattedList[0] = `${formattedList[0]}*`;
                }
                const nomesFormatados = formatarGrupoNomesHTML(formattedList);
                partes.push(`**${naipe}** ${nomesFormatados}`);
            }
        });

        Object.keys(naipes).forEach(naipe => {
            if (!ordemNaipes.includes(naipe) && naipes[naipe].length > 0) {
                let formattedList = [...naipes[naipe]];
                formattedList[0] = `${formattedList[0]}*`;
                const nomesFormatados = formatarGrupoNomesHTML(formattedList);
                partes.push(`**${naipe}** ${nomesFormatados}`);
            }
        });

        const ordemCargos = ["Coordenador Artístico", "Inspetor", "Produtor de Palco", "Montadores"];
        ordemCargos.forEach(cargo => {
            const list = equipeTecnica[cargo] || [];
            if (list.length > 0) {
                if (cargo === "Montadores") {
                    partes.push(`Montadores ${formatarGrupoNomesHTML(list)}`);
                } else {
                    partes.push(`**${cargo}** ${formatarGrupoNomesHTML(list)}`);
                }
            }
        });

        const textoLinear = partes.join('. ') + '.';
        return `${textoLinear}\n\n*monitor\n**Spalla`;
    };

    // 2. Gerador E-mail Corrido (Rich Text HTML)
    const gerarFichaEmailHTML = (data) => {
        const { regentes, naipes, equipeTecnica } = data;
        let htmlPartes = [];

        if (regentes.length > 0) {
            let regenteTexts = regentes.map(r => `<strong>${r.cargo}</strong> ${r.nome}`);
            let regentesLine = "";
            if (regenteTexts.length === 1) {
                regentesLine = regenteTexts[0] + ".";
            } else if (regenteTexts.length > 1) {
                const todosMenosUltimo = regenteTexts.slice(0, -1).join(', ');
                regentesLine = `${todosMenosUltimo} e ${regenteTexts[regenteTexts.length - 1]}.`;
            }
            htmlPartes.push(regentesLine);
        }

        let corpoPartes = [];
        const ordemNaipes = [
            "Primeiros Violinos", "Segundos Violinos", "Violas", "Violoncelos", "Contrabaixos",
            "Flautas", "Oboés", "Clarinetes", "Fagotes", "Trompa", "Trompete", "Trombones",
            "Tuba", "Harpa", "Piano", "Percussão"
        ];

        ordemNaipes.forEach(naipe => {
            const list = naipes[naipe] || [];
            if (list.length > 0) {
                let formattedList = [...list];
                if (naipe === "Primeiros Violinos") {
                    formattedList[0] = `<strong>${formattedList[0]}*</strong>`;
                } else {
                    formattedList[0] = `${formattedList[0]}*`;
                }
                const nomesFormatados = formatarGrupoNomesHTML(formattedList);
                corpoPartes.push(`<strong>${naipe}</strong> ${nomesFormatados}`);
            }
        });

        Object.keys(naipes).forEach(naipe => {
            if (!ordemNaipes.includes(naipe) && naipes[naipe].length > 0) {
                let formattedList = [...naipes[naipe]];
                formattedList[0] = `${formattedList[0]}*`;
                const nomesFormatados = formatarGrupoNomesHTML(formattedList);
                corpoPartes.push(`<strong>${naipe}</strong> ${nomesFormatados}`);
            }
        });

        const ordemCargos = ["Coordenador Artístico", "Inspetor", "Produtor de Palco", "Montadores"];
        ordemCargos.forEach(cargo => {
            const list = equipeTecnica[cargo] || [];
            if (list.length > 0) {
                if (cargo === "Montadores") {
                    corpoPartes.push(`Montadores ${formatarGrupoNomesHTML(list)}`);
                } else {
                    corpoPartes.push(`<strong>${cargo}</strong> ${formatarGrupoNomesHTML(list)}`);
                }
            }
        });

        const corpoLinear = corpoPartes.join('. ') + '.';

        let resultadoHTML = "";
        if (htmlPartes.length > 0) {
            resultadoHTML += htmlPartes[0] + "<br><br>";
        }
        resultadoHTML += corpoLinear;
        resultadoHTML += "<br><br>*monitor<br>**Spalla";

        return resultadoHTML;
    };

    // 3. Gerador Lista Vertical (Rich Text HTML)
    const gerarFichaListaHTML = (data) => {
        const { regentes, naipes, equipeTecnica } = data;
        let html = "";

        // Design centralizado
        html += '<div style="text-align: center; font-family: inherit; width: 100%;">';
        
        // Cabeçalhos
        html += '<strong>FICHA TÉCNICA OER</strong><br>';
        html += '<strong>ORQUESTRA EXPERIMENTAL DE REPERTÓRIO</strong><br><br>';

        // Regentes
        regentes.forEach(r => {
            html += `<strong>${r.cargo}:</strong> ${r.nome}<br>`;
        });
        
        if (regentes.length > 0) {
            html += '<br>';
        }

        // Naipes (sem asteriscos nos nomes)
        const ordemNaipes = [
            "Primeiros Violinos", "Segundos Violinos", "Violas", "Violoncelos", "Contrabaixos",
            "Flautas", "Oboés", "Clarinetes", "Fagotes", "Trompa", "Trompete", "Trombones",
            "Tuba", "Harpa", "Piano", "Percussão"
        ];

        ordemNaipes.forEach(naipe => {
            const list = naipes[naipe] || [];
            if (list.length > 0) {
                html += `<strong>${naipe}</strong><br>`;
                list.forEach(nome => {
                    html += `${nome}<br>`;
                });
                html += '<br>';
            }
        });

        Object.keys(naipes).forEach(naipe => {
            if (!ordemNaipes.includes(naipe) && naipes[naipe].length > 0) {
                html += `<strong>${naipe}</strong><br>`;
                naipes[naipe].forEach(nome => {
                    html += `${nome}<br>`;
                });
                html += '<br>';
            }
        });

        // Equipe Técnica (sem asteriscos e com Montadores corridos na mesma linha)
        const ordemCargos = ["Coordenador Artístico", "Inspetor", "Produtor de Palco", "Montadores"];
        ordemCargos.forEach(cargo => {
            const list = equipeTecnica[cargo] || [];
            if (list.length > 0) {
                html += `<strong>${cargo}</strong><br>`;
                if (cargo === "Montadores") {
                    html += `${formatarGrupoNomesHTML(list)}<br><br>`;
                } else {
                    list.forEach(nome => {
                        html += `${nome}<br>`;
                    });
                    html += '<br>';
                }
            }
        });

        html += '</div>';
        return html;
    };

    // Função central para atualizar visual e conteúdo da ficha técnica no modal
    const atualizarExibicaoFicha = () => {
        if (!resultContainer) return;

        // 1. Identificar seletores ativos
        const usarCompleto = btnNameCompleto.classList.contains('active');
        const tipoNome = usarCompleto ? 'completo' : 'artistico';

        const formatSelected = btnFormatMarkdown.classList.contains('active') ? 'markdown' :
                              btnFormatEmail.classList.contains('active') ? 'email' : 'lista';

        // 2. Obter dados estruturados correspondentes
        const data = obterDadosFichaEstruturados(tipoNome);

        // 3. Renderizar com base no formato
        if (formatSelected === 'markdown') {
            // Se Gemini carregou e estamos com nome artístico, prioriza o Gemini
            if (tipoNome === 'artistico' && geminiFichaMarkdown) {
                resultContainer.textContent = geminiFichaMarkdown;
            } else {
                resultContainer.textContent = gerarFichaMarkdown(data);
            }
            resultContainer.style.textAlign = 'left';
        } else if (formatSelected === 'email') {
            resultContainer.innerHTML = gerarFichaEmailHTML(data);
            resultContainer.style.textAlign = 'left';
        } else if (formatSelected === 'lista') {
            resultContainer.innerHTML = gerarFichaListaHTML(data);
            resultContainer.style.textAlign = 'center';
        }
    };

    // Função do processo de geração da ficha técnica
    const generateFichaProcess = async (forceIA = false) => {
        if (allMusicians.length === 0) {
            showNotification("Nenhum integrante ativo para gerar o relatório.", "warning");
            return;
        }

        // Resetar seletores de visualização para o estado padrão
        if (btnNameArtistico && btnNameCompleto) {
            btnNameArtistico.classList.add('active');
            btnNameCompleto.classList.remove('active');
            if (labelNameStatus) {
                labelNameStatus.textContent = '📌 Exibindo Nome Artístico (com fallback para Nome de Registro se não preenchido)';
            }
        }

        if (btnFormatMarkdown && btnFormatEmail && btnFormatLista) {
            btnFormatMarkdown.classList.add('active');
            btnFormatEmail.classList.remove('active');
            btnFormatLista.classList.remove('active');
        }

        // Exibir loading
        btnGenerateFicha.disabled = true;
        const originalHTML = btnGenerateFicha.innerHTML;
        if (forceIA) {
            btnGenerateFicha.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width: 16px; height: 16px;"></i> <span>Forçando regeneração via IA...</span>';
        } else {
            btnGenerateFicha.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width: 16px; height: 16px;"></i> <span>Processando Ficha...</span>';
        }
        if (window.lucide) lucide.createIcons();

        geminiFichaMarkdown = ""; // Resetar o cache do Gemini

        try {
            // 1. Verificar Cache do Firestore (apenas se NÃO forçar a IA)
            let usarCache = false;
            if (!forceIA) {
                try {
                    const importSnap = await getDoc(doc(db, "config", "musiciansImport"));
                    const cacheSnap = await getDoc(doc(db, "config", "fichaTecnicaCache"));

                    if (cacheSnap.exists() && cacheSnap.data().text) {
                        const cacheData = cacheSnap.data();
                        const importData = importSnap.exists() ? importSnap.data() : null;

                        const generatedAt = cacheData.generatedAt ? (cacheData.generatedAt.toDate ? cacheData.generatedAt.toDate() : new Date(cacheData.generatedAt)) : null;
                        const lastImportTime = (importData && importData.lastImportTime) ? (importData.lastImportTime.toDate ? importData.lastImportTime.toDate() : new Date(importData.lastImportTime)) : null;

                        if (generatedAt && (!lastImportTime || generatedAt > lastImportTime)) {
                            geminiFichaMarkdown = cacheData.text;
                            usarCache = true;
                            console.log("Cache da Ficha Técnica carregado com sucesso (Sem alterações desde a última importação).");
                        }
                    }
                } catch (cacheErr) {
                    console.warn("Erro ao ler cache do Firestore, prosseguindo com fluxo normal:", cacheErr);
                }
            }

            if (usarCache) {
                showNotification("Ficha Técnica carregada instantaneamente do cache! 🎼⚡", "success");
            } else {
                // Obter dados estruturados padrão (Artístico) para mandar à IA
                const data = obterDadosFichaEstruturados('artistico');
                const { regentes, naipes, equipeTecnica } = data;

                // Construir a lista em formato de texto para mandar à Cloud Function
                let listText = 'Regentes:\n';
                regentes.forEach(r => { listText += `- ${r.cargo}: ${r.nome}\n`; });
                
                listText += '\nNaipes:\n';
                Object.keys(naipes).forEach(naipe => {
                    const list = naipes[naipe];
                    if (list.length > 0) listText += `- ${naipe}: ${list.join(', ')}\n`;
                });

                listText += '\nEquipe Técnica:\n';
                Object.keys(equipeTecnica).forEach(cargo => {
                    const list = equipeTecnica[cargo];
                    if (list.length > 0) listText += `- ${cargo}: ${list.join(', ')}\n`;
                });

                // Chamar IA via Cloud Function
                console.log(forceIA ? "Forçando geração de Ficha Técnica com IA..." : "Chamando Cloud Function generateFichaTecnica...");
                const generateFichaFn = httpsCallable(functions, 'generateFichaTecnica');
                const response = await generateFichaFn({ musiciansTextList: listText });
                if (response.data && response.data.text) {
                    geminiFichaMarkdown = response.data.text;
                    showNotification(forceIA ? "Ficha Técnica regenerada com sucesso via IA! 🎼🤖" : "Ficha Técnica gerada com sucesso via IA! 🎼🤖", "success");

                    // Gravar o novo resultado no cache do Firestore
                    try {
                        await setDoc(doc(db, "config", "fichaTecnicaCache"), {
                            text: geminiFichaMarkdown,
                            generatedAt: serverTimestamp()
                        });
                        console.log("Cache da Ficha Técnica atualizado no Firestore.");
                    } catch (cacheWriteErr) {
                        console.warn("Não foi possível salvar a ficha no cache do Firestore:", cacheWriteErr);
                    }
                } else {
                    throw new Error("Resposta inválida da Cloud Function.");
                }
            }

            // Renderizar com base no estado inicial ativo
            atualizarExibicaoFicha();

            if (modalFicha) {
                modalFicha.style.display = 'flex';
            }

        } catch (err) {
            console.error("Erro geral ao gerar Ficha Técnica:", err);
            // Fallback local caso tudo (IA e Cache) falhe
            try {
                const dataFallback = obterDadosFichaEstruturados('artistico');
                geminiFichaMarkdown = gerarFichaMarkdown(dataFallback);
                atualizarExibicaoFicha();
                if (modalFicha) {
                    modalFicha.style.display = 'flex';
                }
                showNotification("Ficha Técnica gerada localmente (Fallback de segurança).", "info");
            } catch (fallbackErr) {
                console.error("Falha inclusive no fallback local:", fallbackErr);
                showNotification("Erro ao processar: " + err.message, "error");
            }
        } finally {
            btnGenerateFicha.disabled = false;
            btnGenerateFicha.innerHTML = originalHTML;
            if (window.lucide) lucide.createIcons();
        }
    };

    if (btnGenerateFicha) {
        let clickTimeout = null;
        let clickCount = 0;

        btnGenerateFicha.addEventListener('click', () => {
            clickCount++;
            if (clickCount === 1) {
                clickTimeout = setTimeout(async () => {
                    clickCount = 0;
                    await generateFichaProcess(false);
                }, 300);
            } else if (clickCount === 2) {
                clearTimeout(clickTimeout);
                clickCount = 0;
                generateFichaProcess(true);
            }
        });
    }

    // Adicionar listeners para os seletores de Nome e Formato
    if (btnNameArtistico && btnNameCompleto) {
        btnNameArtistico.addEventListener('click', () => {
            btnNameArtistico.classList.add('active');
            btnNameCompleto.classList.remove('active');
            if (labelNameStatus) {
                labelNameStatus.textContent = '📌 Exibindo Nome Artístico (com fallback para Nome de Registro se não preenchido)';
            }
            atualizarExibicaoFicha();
        });

        btnNameCompleto.addEventListener('click', () => {
            btnNameCompleto.classList.add('active');
            btnNameArtistico.classList.remove('active');
            if (labelNameStatus) {
                labelNameStatus.textContent = '📌 Exibindo Nome Completo / de Registro (nome de registro civil dos músicos)';
            }
            atualizarExibicaoFicha();
        });
    }

    if (btnFormatMarkdown && btnFormatEmail && btnFormatLista) {
        const resetFormatButtons = () => {
            [btnFormatMarkdown, btnFormatEmail, btnFormatLista].forEach(btn => {
                btn.classList.remove('active');
            });
        };

        const setButtonActive = (btn) => {
            btn.classList.add('active');
        };

        btnFormatMarkdown.addEventListener('click', () => {
            resetFormatButtons();
            setButtonActive(btnFormatMarkdown);
            atualizarExibicaoFicha();
        });

        btnFormatEmail.addEventListener('click', () => {
            resetFormatButtons();
            setButtonActive(btnFormatEmail);
            atualizarExibicaoFicha();
        });

        btnFormatLista.addEventListener('click', () => {
            resetFormatButtons();
            setButtonActive(btnFormatLista);
            atualizarExibicaoFicha();
        });
    }

    // Ouvintes dos botões do modal
    const fecharFichaModal = () => {
        if (modalFicha) modalFicha.style.display = 'none';
    };

    if (btnCloseFicha) btnCloseFicha.addEventListener('click', fecharFichaModal);
    if (btnCloseFichaFooter) btnCloseFichaFooter.addEventListener('click', fecharFichaModal);

    if (btnCopyFicha && resultContainer) {
        btnCopyFicha.addEventListener('click', async () => {
            try {
                const isFormatEmail = btnFormatEmail.classList.contains('active');
                const isFormatLista = btnFormatLista.classList.contains('active');

                if (isFormatEmail || isFormatLista) {
                    // Copiar como Rich Text (HTML) para manter os negritos reais e a centralização
                    const htmlContent = resultContainer.innerHTML;
                    const plainText = resultContainer.textContent;

                    const blobHtml = new Blob([htmlContent], { type: 'text/html' });
                    const blobText = new Blob([plainText], { type: 'text/plain' });

                    const data = [new ClipboardItem({
                        'text/html': blobHtml,
                        'text/plain': blobText
                    })];

                    await navigator.clipboard.write(data);
                } else {
                    // Copiar como texto simples normal (Markdown)
                    await navigator.clipboard.writeText(resultContainer.textContent);
                }
                
                // Feedback visual de cópia bem-sucedida
                const originalText = btnCopyFicha.innerHTML;
                btnCopyFicha.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i> Copiado!';
                btnCopyFicha.style.background = '#4CAF50';
                if (window.lucide) lucide.createIcons();
                
                setTimeout(() => {
                    btnCopyFicha.innerHTML = originalText;
                    btnCopyFicha.style.background = '#2E8B57';
                    if (window.lucide) lucide.createIcons();
                }, 2000);
                
                showNotification("Texto copiado para a área de transferência!", "success");
            } catch (err) {
                console.error("Erro ao copiar texto:", err);
                showNotification("Erro ao copiar texto.", "error");
            }
        });
    }
}
