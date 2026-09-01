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
    signOut,
    sendPasswordResetEmail,
    reauthenticateWithCredential,
    updatePassword,
    EmailAuthProvider,
    signInWithCustomToken
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
    writeBatch,
    Timestamp
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
const toggleGoogleCalendarBtn = document.getElementById('toggle-google-calendar-btn');
const toggleGoogleCalendarStatusText = document.getElementById('toggle-google-calendar-status-text');

let selectedNotifImage = null;
let undoState = null;

// Referências para Recuperação de Senha
const forgotPasswordLink = document.getElementById('forgot-password-link');
const loginView = document.getElementById('login-view');
const recoveryView = document.getElementById('recovery-view');
const successView = document.getElementById('success-view');
const recoveryForm = document.getElementById('recovery-form');
const btnBackLogin = document.getElementById('btn-back-login');
const btnBackLoginSuccess = document.getElementById('btn-back-login-success');

// Variáveis de Proteção Anti Brute-Force
let loginAttempts = 0;
let isLoginBlocked = false;
let countdownInterval = null;

// ================= AUTHENTICATION =================

let unsubscribeToggle = null; // Guarda o listener do toggle para poder cancelar no logout
let unsubscribeAppToggle = null; // Guarda o listener do config/app para poder cancelar no logout
let unsubscribeGoogleCalendarToggle = null; // Guarda o listener do config/googleCalendar para cancelar no logout
let unsubscribeSubscribers = null; // Guarda o listener de assinantes
let unsubscribeCalendarStats = null; // Guarda o listener de estatísticas do calendário
let unsubscribeLinks = null; // Guarda o listener de links temporários
let unsubscribeEngagement = null; // Guarda o listener do gráfico de engajamento
let unsubscribeMusicians = null; // Guarda o listener da coleção de músicos
let unsubscribeIntervalTimer = null; // Guarda o listener do cronômetro de intervalo
let adminIntervalTicker = null; // Guarda o ticker em tempo real do admin
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
        initCalendarStats(); // Inicia o monitoramento de adesão ao calendário
        setupChartFilters(); // Configura os filtros do gráfico de engajamento
        initEngagementChart(); // Inicia o gráfico de engajamento com a quantidade padrão
        loadLogs(); // Carrega o histórico de logs ao logar
        loadAdminNotifications(); // Carrega a lista de notificações ativas
        setupLinks(); // Inicia configurações e listagem dos links temporários
        initManualRobot(); // Inicia o Robô OER Manual
        initLogFilters(); // Inicia os filtros do histórico
        initLogSearch();  // Inicia o campo de busca no histórico
        initLogRetryListener(); // Inicia o listener de retentativas de sincronização nos logs de erro
        initScheduleUI(); // Inicia a UI de agendamento de notificações
        initSettingsModal(); // Inicia a lógica do modal de ajustes
        initEditNotifModal(); // Inicia a lógica do modal de edição de notificações
        initEmulatorToggle(); // Inicia o toggle de emulação
        syncTickerWithLatest(); // Força sincronização do letreiro na inicialização
        initAtestadosManagement(); // Inicia a gestão de atestados médicos (Fase 3)
        try {
            initDispensasModule(); // Inicia o módulo de dispensas de bolsistas
        } catch (dispErr) {
            console.error("⚠️ [Admin] Erro ao inicializar módulo de dispensas:", dispErr);
        }
        try {
            initAtestadosHomologadosModule(); // Inicia o módulo de atestados homologados
        } catch (atestErr) {
            console.error("⚠️ [Admin] Erro ao inicializar módulo de atestados homologados:", atestErr);
        }
        initCalendarManagement(); // Inicia o módulo de calendário interativo
        initIntervalTimerControls(); // Inicia o controle do cronômetro de intervalo
        initMusiciansManagement(); // Inicia o gerenciamento de músicos (importação e busca reativa)
        initSecuritySection(); // Inicia a seção de segurança da conta
    } else {
        // Não logado
        dashboardContainer.classList.remove('active');
        loginContainer.classList.add('active');
        if (unsubscribeToggle) { unsubscribeToggle(); unsubscribeToggle = null; }
        if (unsubscribeAppToggle) { unsubscribeAppToggle(); unsubscribeAppToggle = null; }
        if (unsubscribeGoogleCalendarToggle) { unsubscribeGoogleCalendarToggle(); unsubscribeGoogleCalendarToggle = null; }
        if (unsubscribeSubscribers) { unsubscribeSubscribers(); unsubscribeSubscribers = null; }
        if (unsubscribeCalendarStats) { unsubscribeCalendarStats(); unsubscribeCalendarStats = null; }
        if (unsubscribeLinks) { unsubscribeLinks(); unsubscribeLinks = null; }
        if (unsubscribeEngagement) { unsubscribeEngagement(); unsubscribeEngagement = null; }
        if (unsubscribeMusicians) { unsubscribeMusicians(); unsubscribeMusicians = null; }
        if (unsubscribeIntervalTimer) { unsubscribeIntervalTimer(); unsubscribeIntervalTimer = null; }
        if (adminIntervalTicker) { clearInterval(adminIntervalTicker); adminIntervalTicker = null; }
        if (window.engagementChartInstance) {
            window.engagementChartInstance.destroy();
            window.engagementChartInstance = null;
        }
    }
});

// ================= TRADUÇÃO DE ERROS FIREBASE =================

function translateFirebaseError(errorCode) {
    const errors = {
        'auth/invalid-email': 'O e-mail informado não é válido.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/user-not-found': 'Nenhuma conta encontrada com este e-mail.',
        'auth/wrong-password': 'Senha incorreta. Tente novamente.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        'auth/network-request-failed': 'Falha na conexão. Verifique sua internet.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
        'auth/requires-recent-login': 'Sessão expirada. Faça login novamente.',
        'auth/email-already-in-use': 'Este e-mail já está em uso.',
        'auth/missing-password': 'Preencha o campo de senha.',
        'auth/missing-email': 'Preencha o campo de e-mail.',
    };
    return errors[errorCode] || 'Ocorreu um erro inesperado. Tente novamente.';
}

// ================= PROTEÇÃO ANTI BRUTE-FORCE =================

function triggerShake() {
    const loginCard = document.querySelector('.login-card');
    if (loginCard) {
        loginCard.classList.remove('shake');
        // Force reflow para reiniciar a animação
        void loginCard.offsetWidth;
        loginCard.classList.add('shake');
        setTimeout(() => loginCard.classList.remove('shake'), 600);
    }
}

function startCountdown(seconds) {
    isLoginBlocked = true;
    const btn = document.getElementById('btn-login');
    const countdownEl = document.getElementById('login-countdown');
    const countdownTime = document.getElementById('countdown-time');
    
    btn.disabled = true;
    countdownEl.style.display = 'flex';
    let remaining = seconds;
    countdownTime.textContent = remaining;
    
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        remaining--;
        countdownTime.textContent = remaining;
        
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            isLoginBlocked = false;
            btn.disabled = false;
            countdownEl.style.display = 'none';
        }
    }, 1000);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Submit de Login (com proteção anti brute-force e mensagens PT-BR)
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (isLoginBlocked) return;
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('btn-login');
    const errorMsg = document.getElementById('login-error');

    btn.disabled = true;
    btn.innerHTML = 'Conectando...';
    errorMsg.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Login com sucesso — reseta contador
        loginAttempts = 0;
    } catch (error) {
        loginAttempts++;
        const friendlyMsg = translateFirebaseError(error.code);
        errorMsg.textContent = friendlyMsg;
        console.error("Login erro completo:", error);
        
        // Animação de shake
        triggerShake();
        
        // Brute-force protection
        if (loginAttempts >= 5) {
            startCountdown(120); // 2 minutos
        } else if (loginAttempts >= 3) {
            startCountdown(30); // 30 segundos
        }
    } finally {
        if (!isLoginBlocked) {
            btn.disabled = false;
        }
        btn.innerHTML = 'Entrar <i data-lucide="arrow-right"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
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

// ================= RECUPERAÇÃO DE SENHA =================

function showView(viewToShow) {
    [loginView, recoveryView, successView].forEach(v => {
        if (v) v.classList.add('hidden');
    });
    if (viewToShow) viewToShow.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Link "Esqueci minha senha"
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        showView(recoveryView);
        // Pré-preenche o e-mail se já digitou no login
        const loginEmail = document.getElementById('email').value;
        const recoveryEmail = document.getElementById('recovery-email');
        if (loginEmail && recoveryEmail) {
            recoveryEmail.value = loginEmail;
        }
    });
}

// Botão "Voltar ao login"
if (btnBackLogin) {
    btnBackLogin.addEventListener('click', () => {
        showView(loginView);
        const recoveryError = document.getElementById('recovery-error');
        if (recoveryError) recoveryError.textContent = '';
    });
}

// Botão "Voltar ao login" da view de sucesso
if (btnBackLoginSuccess) {
    btnBackLoginSuccess.addEventListener('click', () => {
        showView(loginView);
    });
}

// Submit de recuperação de senha
if (recoveryForm) {
    recoveryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('recovery-email').value;
        const btn = document.getElementById('btn-send-recovery');
        const errorMsg = document.getElementById('recovery-error');
        
        btn.disabled = true;
        btn.innerHTML = 'Enviando... <i data-lucide="loader-2"></i>';
        errorMsg.textContent = '';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        try {
            await sendPasswordResetEmail(auth, email);
            showView(successView);
        } catch (error) {
            errorMsg.textContent = translateFirebaseError(error.code);
            console.error("Erro ao enviar e-mail de recuperação:", error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Enviar link de recuperação <i data-lucide="send"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    });
}

// ================= TROCA DE SENHA (MODAL AJUSTES) =================

function initSecuritySection() {
    const securityHeader = document.getElementById('security-header');
    const securityContent = document.getElementById('security-content');
    const securityChevron = document.getElementById('security-chevron');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const currentPasswordInput = document.getElementById('current-password');
    const btnChangePassword = document.getElementById('btn-change-password');
    const securityError = document.getElementById('security-error');
    const securitySuccess = document.getElementById('security-success');
    const strengthBar = document.getElementById('strength-bar-fill');
    const strengthLabel = document.getElementById('strength-label');
    const strengthContainer = document.getElementById('password-strength');
    const requirementsList = document.getElementById('password-requirements');
    
    if (!securityHeader || !securityContent) return;
    
    // Toggle expandir/colapsar
    securityHeader.addEventListener('click', () => {
        const isExpanded = securityContent.classList.contains('expanded');
        securityContent.classList.toggle('expanded');
        securityChevron.classList.toggle('expanded');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
    
    // Toggles de visibilidade de senha no modal de segurança
    document.querySelectorAll('.btn-toggle-security').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.closest('.password-wrapper').querySelector('input');
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.innerHTML = isPassword 
                ? '<i data-lucide="eye-off"></i>' 
                : '<i data-lucide="eye"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    });
    
    // Validação de força de senha em tempo real
    function checkPasswordStrength(password) {
        let score = 0;
        const checks = {
            length: password.length >= 8,
            upper: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
        };
        
        if (checks.length) score++;
        if (checks.upper) score++;
        if (checks.number) score++;
        if (checks.special) score++;
        
        return { score, checks };
    }
    
    function updateStrengthIndicator(password) {
        if (!strengthBar || !strengthLabel) return;
        
        if (!password) {
            strengthContainer.style.display = 'none';
            requirementsList.style.display = 'none';
            return;
        }
        
        strengthContainer.style.display = 'block';
        requirementsList.style.display = 'grid';
        
        const { score, checks } = checkPasswordStrength(password);
        
        // Atualiza barra
        const widths = ['0%', '25%', '50%', '75%', '100%'];
        const colors = ['#dc3545', '#dc3545', '#ffc107', '#28a745', '#28a745'];
        const labels = ['', 'Fraca', 'Média', 'Boa', 'Forte'];
        
        strengthBar.style.width = widths[score];
        strengthBar.style.backgroundColor = colors[score];
        strengthLabel.textContent = labels[score];
        strengthLabel.style.color = colors[score];
        
        // Atualiza checklist de requisitos
        const reqLength = document.getElementById('req-length');
        const reqUpper = document.getElementById('req-upper');
        const reqNumber = document.getElementById('req-number');
        const reqSpecial = document.getElementById('req-special');
        
        function updateReq(el, met) {
            if (!el) return;
            if (met) {
                el.classList.add('met');
                el.querySelector('i').setAttribute('data-lucide', 'check-circle');
            } else {
                el.classList.remove('met');
                el.querySelector('i').setAttribute('data-lucide', 'circle');
            }
        }
        
        updateReq(reqLength, checks.length);
        updateReq(reqUpper, checks.upper);
        updateReq(reqNumber, checks.number);
        updateReq(reqSpecial, checks.special);
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    function validateChangeForm() {
        if (!btnChangePassword) return;
        const current = currentPasswordInput?.value || '';
        const newPass = newPasswordInput?.value || '';
        const confirm = confirmPasswordInput?.value || '';
        const { score } = checkPasswordStrength(newPass);
        
        btnChangePassword.disabled = !(current && newPass && confirm && score >= 4);
    }
    
    // Listeners em tempo real
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', () => {
            updateStrengthIndicator(newPasswordInput.value);
            validateChangeForm();
        });
    }
    
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', validateChangeForm);
    }
    
    if (currentPasswordInput) {
        currentPasswordInput.addEventListener('input', validateChangeForm);
    }
    
    // Botão de alterar senha
    if (btnChangePassword) {
        btnChangePassword.addEventListener('click', async () => {
            const currentPass = currentPasswordInput.value;
            const newPass = newPasswordInput.value;
            const confirmPass = confirmPasswordInput.value;
            
            securityError.textContent = '';
            securitySuccess.textContent = '';
            
            // Validações
            if (newPass !== confirmPass) {
                securityError.textContent = 'As senhas não coincidem.';
                return;
            }
            
            const { score } = checkPasswordStrength(newPass);
            if (score < 4) {
                securityError.textContent = 'A senha não atende todos os requisitos.';
                return;
            }
            
            if (newPass === currentPass) {
                securityError.textContent = 'A nova senha deve ser diferente da atual.';
                return;
            }
            
            btnChangePassword.disabled = true;
            btnChangePassword.innerHTML = '<i data-lucide="loader-2"></i> Alterando...';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            try {
                const user = auth.currentUser;
                // Reautenticação obrigatória
                const credential = EmailAuthProvider.credential(user.email, currentPass);
                await reauthenticateWithCredential(user, credential);
                
                // Atualizar senha
                await updatePassword(user, newPass);
                
                // Sucesso
                securitySuccess.textContent = 'Senha alterada com sucesso!';
                showNotification('Senha alterada com sucesso!', 'success');
                
                // Limpar campos
                currentPasswordInput.value = '';
                newPasswordInput.value = '';
                confirmPasswordInput.value = '';
                updateStrengthIndicator('');
                validateChangeForm();
                
                // Limpar mensagem de sucesso após 5s
                setTimeout(() => {
                    securitySuccess.textContent = '';
                }, 5000);
                
            } catch (error) {
                console.error('Erro ao alterar senha:', error);
                securityError.textContent = translateFirebaseError(error.code);
            } finally {
                btnChangePassword.disabled = false;
                btnChangePassword.innerHTML = '<i data-lucide="shield-check"></i> Alterar Senha';
                if (typeof lucide !== 'undefined') lucide.createIcons();
                validateChangeForm();
            }
        });
    }
}

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

async function createPdfUpdateNotice(type, displayVersion, pdfUrl = null) {
    try {
        const label = type === 'temporada' ? 'Temporada' : (type === 'agenda' ? 'Agenda' : 'Temporada e Agenda');
        let finalPdfUrl = pdfUrl;
        
        if (!finalPdfUrl) {
            try {
                const configRef = doc(db, 'config', 'pdfs');
                const docSnap = await getDoc(configRef);
                if (docSnap.exists() && docSnap.data().pdfs && docSnap.data().pdfs[type]) {
                    finalPdfUrl = docSnap.data().pdfs[type].url || null;
                }
            } catch (e) {
                console.warn("Não foi possível obter URL do PDF para o aviso:", e);
            }
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

        // Obtém o aviso atual para guardar como fallback quando o temporário expirar
        let previousNotice = null;
        try {
            const currentLatestSnap = await getDoc(doc(db, 'config', 'latestNotice'));
            if (currentLatestSnap.exists()) {
                const currentData = currentLatestSnap.data();
                // Se o aviso atual já for temporário, mantemos o previousNotice original (se houver)
                if (currentData.isTemporary && currentData.previousNotice) {
                    previousNotice = currentData.previousNotice;
                } else if (!currentData.isTemporary) {
                    previousNotice = currentData;
                }
            }
        } catch (errPrev) {
            console.warn("Erro ao buscar previousNotice:", errPrev);
        }

        const notifData = {
            title: `Atualização de ${label}`,
            message: `Foi realizada uma atualização na ${label.toLowerCase()} (Versão ${displayVersion}).`,
            isTemporary: true,
            expiresAt: expiresAt,
            pdfType: type,
            version: displayVersion,
            ...(finalPdfUrl ? { pdfUrl: finalPdfUrl, linkUrl: finalPdfUrl } : {}),
            createdAt: now.toISOString(),
            sentBy: auth.currentUser ? auth.currentUser.email : 'sistema'
        };

        // Salva no histórico de avisos (disparará a notificação push via Cloud Function)
        await addDoc(collection(db, 'adminNotifications'), notifData);

        // Atualiza o letreiro ativo com a flag de temporário e referência ao aviso anterior
        const tickerData = {
            ...notifData,
            ...(previousNotice ? { previousNotice } : {})
        };
        await setDoc(doc(db, 'config', 'latestNotice'), tickerData);

        console.log(`[Histórico] Aviso de atualização de ${type} v${displayVersion} registrado com PDF e ativado no letreiro por 24h.`);
    } catch (err) {
        console.error("Erro ao criar aviso de histórico para PDF:", err);
    }
}

async function updateFirestoreData(type, url, filename, timestamp, displayVersion) {
    const configRef = doc(db, 'config', 'pdfs');
    
    // Pega o documento atual, se existir, para não apagar o outro PDF
    const docSnap = await getDoc(configRef);
    let currentData = docSnap.exists() ? docSnap.data() : { pdfs: {} };
    if (!currentData.pdfs) currentData.pdfs = {};

    const finalVersion = displayVersion || String(timestamp);

    // Atualiza a chave específica (agenda ou temporada)
    currentData.pdfs[type] = {
        arquivo: filename,
        url: url,
        version: timestamp,
        displayVersion: finalVersion,
        updatedAt: new Date().toISOString()
    };

    // Grava de volta
    await setDoc(configRef, currentData);
    
    // Grava no Log Histórico
    await saveLog('pdf', `Novo PDF enviado para ${type.toUpperCase()}: v${currentData.pdfs[type].displayVersion}`, url);

    // Registra notificação no histórico dos músicos
    await createPdfUpdateNotice(type, finalVersion, url);

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

    // Registra notificação no histórico dos músicos
    await createPdfUpdateNotice(type, displayVersion);

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
        const linkInput = document.getElementById('notif-link');
        const currentTitle = titleInput ? titleInput.value.trim() : '';
        const currentMessage = messageInput ? messageInput.value.trim() : '';
        const currentLink = linkInput ? linkInput.value.trim() : '';

        // Se houver qualquer texto escrito, imagem selecionada ou link, roda a correção direta
        if (currentTitle || currentMessage || selectedNotifImage || currentLink) {
            correctNotificationDirectly(currentTitle, currentMessage, currentLink, selectedNotifImage);
        } else {
            // Se tudo estiver vazio, abre o modal
            openRobotModal('');
        }
    });

    // Atalho de desfazer Ctrl+Z / Cmd+Z nos campos de texto
    const titleInput = document.getElementById('notif-title');
    const messageInput = document.getElementById('notif-message');

    const handleUndo = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            if (undoState) {
                e.preventDefault();
                titleInput.value = undoState.title;
                messageInput.value = undoState.message;
                undoState = null; // Limpa para evitar múltiplos undos indesejados
                showNotification('Texto original restaurado! 🎼🤖', 'success');
            }
        }
    };

    if (titleInput) titleInput.addEventListener('keydown', handleUndo);
    if (messageInput) messageInput.addEventListener('keydown', handleUndo);

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

        // Salva estado para o desfazer (Ctrl+Z)
        undoState = {
            title: titleInput.value,
            message: messageInput.value
        };

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
async function correctNotificationDirectly(currentTitle, currentMessage, currentLink, selectedImage) {
    const btnRobot = document.getElementById('btn-ai-robot');
    const titleInput = document.getElementById('notif-title');
    const messageInput = document.getElementById('notif-message');

    if (!btnRobot || !titleInput || !messageInput) return;

    // Estado visual de carregamento no próprio botão
    btnRobot.disabled = true;
    btnRobot.classList.add('loading');

    try {
        const payload = {
            userPrompt: `Por favor, revise, corrija a gramática e melhore a redação deste aviso. 
Título atual: "${currentTitle}"
Mensagem atual: "${currentMessage}"
Retorne a sugestão ideal mantendo o contexto original.`,
            includeContext: true // Mantém o contexto de ensaios/temporada se disponível
        };

        if (currentLink) {
            payload.linkUrl = currentLink;
        }

        if (selectedImage) {
            console.log("🤖 [Robô OER] Convertendo imagem selecionada para Base64 para envio multimodal...");
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    const base64String = result.split(',')[1];
                    resolve(base64String);
                };
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(selectedImage);
            });

            payload.image = {
                inlineData: {
                    mimeType: selectedImage.type,
                    data: base64Data
                }
            };
        }

        console.log("🤖 [Robô OER] Chamando Cloud Function suggestNotificationText para correção direta...");
        const suggestTextFn = httpsCallable(functions, 'suggestNotificationText');
        const result = await suggestTextFn(payload);

        console.log("🤖 [Robô OER] Correção direta concluída com sucesso:", result.data);
        const { title, message } = result.data;

        // Salva estado para o desfazer (Ctrl+Z)
        undoState = {
            title: titleInput.value,
            message: messageInput.value
        };

        // Preenche os campos principais do aviso com os textos corrigidos
        if (title) titleInput.value = title;
        if (message) messageInput.value = message;

        // Feedback de sucesso
        showNotification('O Robô OER aprimorou o seu aviso! Use Ctrl+Z (ou Cmd+Z) se quiser desfazer. 🎼🤖', 'success');

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

    // Escuta em tempo real o estado do botão Seguir Calendário no Google
    const googleCalendarConfigRef = doc(db, 'config', 'googleCalendar');
    if (unsubscribeGoogleCalendarToggle) unsubscribeGoogleCalendarToggle();
    unsubscribeGoogleCalendarToggle = onSnapshot(googleCalendarConfigRef, (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const showButton = data.showButton === true;

        if (toggleGoogleCalendarBtn) toggleGoogleCalendarBtn.checked = showButton;
        if (toggleGoogleCalendarStatusText) {
            toggleGoogleCalendarStatusText.textContent = showButton
                ? '✅ Botão "Seguir Calendário" EXIBIDO no site público.'
                : '🔕 Botão "Seguir Calendário" OCULTO no site público.';
            toggleGoogleCalendarStatusText.style.color = showButton ? '#2E8B57' : '#888';
        }
    }, (err) => {
        console.error('[Toggle] Erro ao ouvir config/googleCalendar:', err);
        if (toggleGoogleCalendarStatusText) toggleGoogleCalendarStatusText.textContent = '⚠️ Erro ao carregar estado.';
    });

    // Evento para o Toggle de Seguir Calendário no Google
    if (toggleGoogleCalendarBtn && !toggleGoogleCalendarBtn._listenerAdded) {
        toggleGoogleCalendarBtn._listenerAdded = true;
        toggleGoogleCalendarBtn.addEventListener('change', async () => {
            const newState = toggleGoogleCalendarBtn.checked;
            toggleGoogleCalendarBtn.disabled = true;
            try {
                await setDoc(googleCalendarConfigRef, {
                    showButton: newState,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                showNotification(`Botão Seguir Calendário ${newState ? 'ATIVADO' : 'DESATIVADO'} com sucesso.`, 'success');
            } catch (err) {
                console.error('[Toggle] Erro ao atualizar botão de calendário:', err);
                showNotification('Erro ao salvar configuração: ' + err.message, 'error');
                toggleGoogleCalendarBtn.checked = !newState;
            } finally {
                toggleGoogleCalendarBtn.disabled = false;
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


// ================= MÉTRICAS DO CALENDÁRIO (REAL-TIME) =================

function initCalendarStats() {
    const totalEl = document.getElementById('calendar-stats-total');
    const breakdownEl = document.getElementById('calendar-stats-breakdown');
    if (!totalEl) return;

    if (unsubscribeCalendarStats) unsubscribeCalendarStats();

    const statsRef = doc(db, 'config', 'stats');
    unsubscribeCalendarStats = onSnapshot(statsRef, (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        const totalClicks = data.totalCalendarClicks || 0;
        const appleClicks = data.calendarClicks_apple || 0;
        const googleClicks = data.calendarClicks_google || 0;

        totalEl.innerHTML = `${totalClicks} <span>adesões</span>`;
        if (breakdownEl) {
            breakdownEl.textContent = `🍏 ${appleClicks} Apple · 🌐 ${googleClicks} Google`;
        }
        console.log(`[Admin] Métricas do Calendário: Total=${totalClicks}, Apple=${appleClicks}, Google=${googleClicks}`);
    }, (err) => {
        console.error('[Admin] Erro ao monitorar métricas do calendário:', err);
    });
}

// ================= GRÁFICO DE ENGAJAMENTO (REAL-TIME) =================

function initEngagementChart() {
    const canvas = document.getElementById('engagementChart');
    if (!canvas) return;

    if (unsubscribeEngagement) unsubscribeEngagement();

    const engagementRef = collection(db, 'engagement');

    // Gera a lista dos últimos N dias primeiro (baseado em data, não em timestamp)
    const lastDays = [];
    const allDateStrs = [];
    for (let i = currentEngagementDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Exibição dd/mm e dia da semana
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const diaSemanaStr = diasSemana[d.getDay()];
        const displayStr = `${day}/${month} (${diaSemanaStr})`;

        allDateStrs.push(dateStr);
        lastDays.push({
            dateStr: dateStr,
            displayStr: displayStr,
            uniqueVisitors: 0,
            uniqueAccesses: 0, // retrocompatibilidade
            totalPageviews: 0,
            notificationAccesses: 0,
            calendarClicks: 0
        });
    }

    // Busca os documentos pelo ID (data) — garante contiguidade mesmo em dias sem acesso
    const startDate = allDateStrs[0];
    const endDate = allDateStrs[allDateStrs.length - 1];
    const q = query(
        engagementRef,
        where('date', '>=', startDate),
        where('date', '<=', endDate)
    );

    unsubscribeEngagement = onSnapshot(q, (snapshot) => {
        // Reinicia os valores para evitar acúmulo em re-renders
        lastDays.forEach(d => {
            d.uniqueVisitors = 0;
            d.uniqueAccesses = 0;
            d.totalPageviews = 0;
            d.notificationAccesses = 0;
            d.calendarClicks = 0;
        });

        // Preenche com os dados reais retornados pelo Firestore
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateStr = docSnap.id; // YYYY-MM-DD
            const dayObj = lastDays.find(d => d.dateStr === dateStr);
            if (dayObj) {
                // Prioriza uniqueVisitors (novo), cai de volta para uniqueAccesses (legado)
                dayObj.uniqueVisitors = data.uniqueVisitors || data.uniqueAccesses || 0;
                dayObj.uniqueAccesses = data.uniqueAccesses || 0;
                dayObj.totalPageviews = data.totalPageviews || 0;
                dayObj.notificationAccesses = data.notificationAccesses || 0;
                dayObj.calendarClicks = data.calendarClicks || 0;
            }
        });

        const labels = lastDays.map(d => d.displayStr);
        const uniqueData = lastDays.map(d => d.uniqueVisitors);
        const pageviewData = lastDays.map(d => d.totalPageviews);
        const notifData = lastDays.map(d => d.notificationAccesses);
        const calendarData = lastDays.map(d => d.calendarClicks);

        renderChart(canvas, labels, uniqueData, pageviewData, notifData, calendarData);
    }, (err) => {
        console.error('[Admin] Erro ao monitorar dados de engajamento:', err);
    });
}

function renderChart(canvas, labels, uniqueData, pageviewData, notifData, calendarData = [], notifEnabled = isNotificationsEnabled) {
    if (window.engagementChartInstance) {
        window.engagementChartInstance.destroy();
        window.engagementChartInstance = null;
    }

    const ctx = canvas.getContext('2d');

    // Gradiente vermelho — Visitantes Únicos
    const gradientUnique = ctx.createLinearGradient(0, 0, 0, 200);
    gradientUnique.addColorStop(0, 'rgba(139, 0, 0, 0.22)');
    gradientUnique.addColorStop(1, 'rgba(139, 0, 0, 0.00)');

    // Gradiente azul — Pageviews Totais
    const gradientPageviews = ctx.createLinearGradient(0, 0, 0, 200);
    gradientPageviews.addColorStop(0, 'rgba(59, 130, 246, 0.18)');
    gradientPageviews.addColorStop(1, 'rgba(59, 130, 246, 0.00)');

    // Gradiente verde — Notificações
    const gradientNotif = ctx.createLinearGradient(0, 0, 0, 200);
    gradientNotif.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
    gradientNotif.addColorStop(1, 'rgba(16, 185, 129, 0.00)');

    // Gradiente roxo/índigo — Adesões ao Calendário
    const gradientCalendar = ctx.createLinearGradient(0, 0, 0, 200);
    gradientCalendar.addColorStop(0, 'rgba(99, 102, 241, 0.22)');
    gradientCalendar.addColorStop(1, 'rgba(99, 102, 241, 0.00)');

    const datasets = [
        {
            label: 'Visitantes Únicos',
            data: uniqueData,
            borderColor: '#8B0000', // Vinho OER
            backgroundColor: gradientUnique,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#8B0000',
            pointHoverRadius: 6,
            pointRadius: 4,
            order: 2
        },
        {
            label: 'Pageviews Totais',
            data: pageviewData,
            borderColor: '#3B82F6', // Azul
            backgroundColor: gradientPageviews,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            borderDash: [5, 3],
            pointBackgroundColor: '#3B82F6',
            pointHoverRadius: 5,
            pointRadius: 3,
            order: 1
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
            pointRadius: 4,
            order: 3
        });
    }

    // Dataset para Adesões ao Calendário
    datasets.push({
        label: 'Adesões Calendário',
        data: calendarData,
        borderColor: '#6366F1', // Índigo / Roxo moderno
        backgroundColor: gradientCalendar,
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#6366F1',
        pointHoverRadius: 6,
        pointRadius: 4,
        order: 4
    });

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
        const qLatest = query(collection(db, 'adminNotifications'), orderBy('createdAt', 'desc'), limit(15));
        const latestSnap = await getDocs(qLatest);
        const latestNoticeRef = doc(db, 'config', 'latestNotice');

        if (!latestSnap.empty) {
            const now = Date.now();
            let targetDoc = null;
            let fallbackManualDoc = null;

            for (const d of latestSnap.docs) {
                const data = d.data();
                if (data.isSystemNotice || data.showInTicker === false) continue;

                if (data.isTemporary) {
                    const isStillValid = data.expiresAt && new Date(data.expiresAt).getTime() > now;
                    if (isStillValid && !targetDoc) {
                        targetDoc = data;
                    }
                } else {
                    if (!targetDoc) {
                        targetDoc = data;
                    }
                    if (!fallbackManualDoc) {
                        fallbackManualDoc = data;
                    }
                }
            }

            if (targetDoc) {
                const finalData = { ...targetDoc };
                if (finalData.isTemporary && !finalData.previousNotice && fallbackManualDoc) {
                    finalData.previousNotice = fallbackManualDoc;
                }
                await setDoc(latestNoticeRef, finalData);
            } else {
                await deleteDoc(latestNoticeRef);
            }
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
    
    // Botão de retentativa para sincronização
    let retryButtonHtml = '';
    if (data.type === 'erro' && data.fileType && data.link && data.id) {
        const retries = data.retryCount || 0;
        const isDisabled = retries >= 3 ? 'disabled' : '';
        const btnText = retries >= 3 ? 'Limite Excedido (Fale com Admin)' : `Tentar Novamente (${retries}/3)`;
        retryButtonHtml = `
            <div style="margin-top: 0.6rem;">
                <button class="btn-retry-sync" data-log-id="${data.id}" ${isDisabled}>
                    <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
                    <span class="btn-retry-text">${btnText}</span>
                </button>
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
            ${retryButtonHtml}
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
            const data = { id: doc.id, ...doc.data() };
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
            const data = { id: doc.id, ...doc.data() };
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
                        allLogsCache.push({ id: doc.id, ...doc.data() });
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

function initLogRetryListener() {
    const listEl = document.getElementById('log-list');
    if (!listEl) return;

    listEl.addEventListener('click', async (e) => {
        const retryBtn = e.target.closest('.btn-retry-sync');
        if (!retryBtn) return;

        const logId = retryBtn.getAttribute('data-log-id');
        if (!logId) return;

        // Desabilita o botão e exibe carregamento
        retryBtn.disabled = true;
        const textSpan = retryBtn.querySelector('.btn-retry-text');
        const iconEl = retryBtn.querySelector('i');
        const originalText = textSpan ? textSpan.textContent : '';
        
        if (textSpan) textSpan.textContent = 'Processando...';
        if (iconEl) {
            iconEl.setAttribute('data-lucide', 'loader-2');
            iconEl.classList.add('spin');
        }
        if (window.lucide) lucide.createIcons();

        try {
            showNotification("Reprocessando o arquivo em background...", "info");
            
            const reprocessSchedulePDF = httpsCallable(functions, 'reprocessSchedulePDF', { timeout: 300000 });
            const result = await reprocessSchedulePDF({ logId });
            
            showNotification(result.data.message || "Sincronização concluída com sucesso!", "success");
            
            // Recarrega logs
            allLogsCache = null;
            loadLogs(currentLogFilter);
        } catch (err) {
            console.error("Erro ao reprocessar:", err);
            showNotification("Erro no reprocessamento: " + err.message, "error");
            
            // Recarrega logs para atualizar mensagem e contador de tentativas no card
            allLogsCache = null;
            loadLogs(currentLogFilter);
        }
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
let selectedLinkFormat = 'button'; // 'button' | 'popup'

function setupLinks() {
    const btnCreate = document.getElementById('btn-create-link');
    if (!btnCreate) return;

    const popupConfigContainer = document.getElementById('popup-config-container');
    const formatBtnOption = document.getElementById('format-option-button');
    const formatPopupOption = document.getElementById('format-option-popup');
    const linkImageUrlInput = document.getElementById('link-image-url');
    const linkImageFileInput = document.getElementById('link-image-file-input');
    const btnExtractImage = document.getElementById('btn-extract-link-image');
    const extractImageStatus = document.getElementById('extract-image-status');
    const linkImagePreviewWrapper = document.getElementById('link-image-preview-wrapper');
    const linkImagePreview = document.getElementById('link-image-preview');
    const linkImageCropperWrapper = document.getElementById('link-image-cropper-wrapper');
    const linkImageCropperSrc = document.getElementById('link-image-cropper-src');
    const btnConfirmCrop = document.getElementById('btn-confirm-crop');
    const btnRemoveLinkImage = document.getElementById('btn-remove-link-image');
    const btnEditCrop = document.getElementById('btn-edit-crop');
    const btnRemoveFinalImage = document.getElementById('btn-remove-final-image');
    const urlInput = document.getElementById('link-url');
    let cropperInstance = null;
    let currentRawImageUrl = null; // URL original antes do recorte

    // ----- Cropper.js -----
    const initCropper = (imageSrc, ratio = 1) => {
        if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
        if (!linkImageCropperSrc || !linkImageCropperWrapper) return;

        linkImageCropperSrc.crossOrigin = "anonymous";
        linkImageCropperSrc.src = imageSrc;
        linkImageCropperWrapper.style.display = 'block';
        if (linkImagePreviewWrapper) linkImagePreviewWrapper.style.display = 'none';

        // Aguarda a imagem carregar para inicializar o Cropper
        linkImageCropperSrc.onload = () => {
            if (cropperInstance) { cropperInstance.destroy(); }
            cropperInstance = new Cropper(linkImageCropperSrc, {
                aspectRatio: isNaN(ratio) ? NaN : ratio,
                viewMode: 1,
                autoCropArea: 0.9,
                movable: true,
                zoomable: true,
                rotatable: false,
                scalable: false,
                responsive: true,
                background: false
            });
        };
        if (linkImageCropperSrc.complete && linkImageCropperSrc.naturalWidth) {
            linkImageCropperSrc.onload();
        }
        if (window.lucide) lucide.createIcons();
    };

    // Botões de proporção
    document.querySelectorAll('.crop-ratio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.crop-ratio-btn').forEach(b => {
                b.style.background = 'rgba(255,255,255,0.05)';
                b.style.borderColor = 'rgba(255,255,255,0.15)';
                b.style.color = 'var(--text-secondary)';
            });
            btn.style.background = 'rgba(139,0,0,0.25)';
            btn.style.borderColor = 'rgba(139,0,0,0.5)';
            btn.style.color = '#fff';

            const ratio = parseFloat(btn.dataset.ratio);
            if (cropperInstance) cropperInstance.setAspectRatio(isNaN(ratio) ? NaN : ratio);
        });
    });

    // Confirmar recorte → exporta canvas → faz upload no Firebase Storage
    if (btnConfirmCrop) {
        btnConfirmCrop.addEventListener('click', async () => {
            if (!cropperInstance) return;
            btnConfirmCrop.disabled = true;
            btnConfirmCrop.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:16px;height:16px;"></i> Salvando...';
            if (window.lucide) lucide.createIcons();

            try {
                const canvas = cropperInstance.getCroppedCanvas({ maxWidth: 1080, maxHeight: 1080, imageSmoothingQuality: 'high' });
                if (!canvas) {
                    throw new Error('Não foi possível gerar a área recortada da imagem.');
                }
                const blob = await new Promise((res, rej) => {
                    canvas.toBlob((b) => {
                        if (b) res(b);
                        else rej(new Error('Falha ao exportar imagem do Canvas.'));
                    }, 'image/jpeg', 0.92);
                });

                const fileName = `link_popups/crop_${Date.now()}.jpg`;
                const storageRefPath = ref(storage, fileName);
                const metadata = { contentType: 'image/jpeg' };
                const uploadTask = await uploadBytesResumable(storageRefPath, blob, metadata);
                const downloadUrl = await getDownloadURL(uploadTask.ref);

                if (linkImageUrlInput) linkImageUrlInput.value = downloadUrl;
                if (linkImagePreview) linkImagePreview.src = downloadUrl;
                if (linkImagePreviewWrapper) linkImagePreviewWrapper.style.display = 'block';
                if (linkImageCropperWrapper) linkImageCropperWrapper.style.display = 'none';

                cropperInstance.destroy();
                cropperInstance = null;

                showNotification('Imagem recortada e salva com sucesso!', 'success');
                if (extractImageStatus) {
                    extractImageStatus.style.display = 'block';
                    extractImageStatus.style.color = '#2E8B57';
                    extractImageStatus.textContent = '✓ Imagem recortada e salva com sucesso!';
                }
            } catch (err) {
                console.error('Erro ao salvar recorte:', err);
                showNotification(`Erro ao salvar o recorte: ${err.message || 'Verifique as permissões'}`, 'error');
            } finally {
                btnConfirmCrop.disabled = false;
                btnConfirmCrop.innerHTML = '<i data-lucide="check"></i> Confirmar Recorte';
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    // Reeditar recorte a partir do preview final
    if (btnEditCrop) {
        btnEditCrop.addEventListener('click', () => {
            if (currentRawImageUrl) {
                initCropper(currentRawImageUrl, 1);
            }
        });
    }

    // Remover imagem (dentro do cropper)
    if (btnRemoveLinkImage) {
        btnRemoveLinkImage.addEventListener('click', () => {
            if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
            if (linkImageCropperWrapper) linkImageCropperWrapper.style.display = 'none';
            if (linkImageCropperSrc) linkImageCropperSrc.src = '';
            if (linkImageUrlInput) linkImageUrlInput.value = '';
            currentRawImageUrl = null;
            if (extractImageStatus) extractImageStatus.style.display = 'none';
        });
    }

    // Remover imagem (preview final)
    if (btnRemoveFinalImage) {
        btnRemoveFinalImage.addEventListener('click', () => {
            if (linkImagePreview) linkImagePreview.src = '';
            if (linkImagePreviewWrapper) linkImagePreviewWrapper.style.display = 'none';
            if (linkImageUrlInput) linkImageUrlInput.value = '';
            currentRawImageUrl = null;
            if (extractImageStatus) extractImageStatus.style.display = 'none';
        });
    }

    // Função central: abre o cropper com a URL bruta da imagem
    const openCropperWithUrl = (imageUrl) => {
        currentRawImageUrl = imageUrl;
        initCropper(imageUrl, 1);
        // Resetar seleção de proporção para Quadrado (padrão)
        document.querySelectorAll('.crop-ratio-btn').forEach((b, i) => {
            if (i === 0) {
                b.style.background = 'rgba(139,0,0,0.25)';
                b.style.borderColor = 'rgba(139,0,0,0.5)';
                b.style.color = '#fff';
            } else {
                b.style.background = 'rgba(255,255,255,0.05)';
                b.style.borderColor = 'rgba(255,255,255,0.15)';
                b.style.color = 'var(--text-secondary)';
            }
        });
    };

    // Alternar Formato (Botão vs Pop-up)
    const updateFormatUI = (format) => {
        selectedLinkFormat = format;
        if (format === 'popup') {
            if (formatPopupOption) {
                formatPopupOption.classList.add('active');
                formatPopupOption.style.background = 'rgba(139, 0, 0, 0.25)';
                formatPopupOption.style.borderColor = '#8B0000';
                formatPopupOption.style.color = '#fff';
            }
            if (formatBtnOption) {
                formatBtnOption.classList.remove('active');
                formatBtnOption.style.background = 'rgba(255, 255, 255, 0.03)';
                formatBtnOption.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                formatBtnOption.style.color = 'var(--text-secondary)';
            }
            if (popupConfigContainer) popupConfigContainer.style.display = 'block';
        } else {
            if (formatBtnOption) {
                formatBtnOption.classList.add('active');
                formatBtnOption.style.background = 'rgba(139, 0, 0, 0.25)';
                formatBtnOption.style.borderColor = '#8B0000';
                formatBtnOption.style.color = '#fff';
            }
            if (formatPopupOption) {
                formatPopupOption.classList.remove('active');
                formatPopupOption.style.background = 'rgba(255, 255, 255, 0.03)';
                formatPopupOption.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                formatPopupOption.style.color = 'var(--text-secondary)';
            }
            if (popupConfigContainer) popupConfigContainer.style.display = 'none';
        }
    };

    if (formatBtnOption) formatBtnOption.addEventListener('click', () => updateFormatUI('button'));
    if (formatPopupOption) formatPopupOption.addEventListener('click', () => updateFormatUI('popup'));

    const handleExtractImage = async (silent = false) => {
        const targetUrl = urlInput ? urlInput.value.trim() : '';
        if (!targetUrl) {
            if (!silent) showNotification('Insira uma URL de destino primeiro.', 'error');
            return;
        }

        try {
            if (extractImageStatus) {
                extractImageStatus.style.display = 'block';
                extractImageStatus.style.color = 'var(--text-secondary)';
                extractImageStatus.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 14px; height: 14px; vertical-align: middle;"></i> Extraindo imagem da URL...';
                if (window.lucide) lucide.createIcons();
            }

            const extractFn = httpsCallable(functions, 'extractLinkMetadata');
            const result = await extractFn({ url: targetUrl });

            if (result.data && result.data.success && (result.data.dataUrl || result.data.imageUrl)) {
                openCropperWithUrl(result.data.dataUrl || result.data.imageUrl);
                if (linkImageUrlInput) linkImageUrlInput.value = result.data.imageUrl || '';
                if (extractImageStatus) {
                    extractImageStatus.style.color = '#2E8B57';
                    extractImageStatus.textContent = '✓ Imagem obtida! Ajuste o recorte e confirme.';
                }
                if (!silent) showNotification('Imagem extraída! Ajuste o recorte e confirme.', 'success');
            } else {
                if (extractImageStatus) {
                    extractImageStatus.style.color = '#ffaa00';
                    extractImageStatus.textContent = 'Não foi possível extrair a imagem automaticamente. Você pode enviar uma imagem personalizada.';
                }
                if (!silent) showNotification('Não foi possível extrair a imagem automaticamente. Faça o upload manual da imagem.', 'warning');
            }
        } catch (err) {
            console.error('Erro na extração de imagem:', err);
            if (extractImageStatus) {
                extractImageStatus.style.color = '#ff4444';
                extractImageStatus.textContent = 'Erro no serviço de extração de imagem.';
            }
        }
    };

    if (btnExtractImage) {
        btnExtractImage.addEventListener('click', (e) => {
            e.preventDefault();
            handleExtractImage(false);
        });
    }

    if (urlInput) {
        let extractDebounceTimeout = null;
        const triggerAutoExtract = () => {
            if (selectedLinkFormat === 'popup' && urlInput.value.trim() && (!linkImageUrlInput || !linkImageUrlInput.value.trim())) {
                handleExtractImage(true);
            }
        };

        urlInput.addEventListener('blur', triggerAutoExtract);
        urlInput.addEventListener('paste', () => setTimeout(triggerAutoExtract, 100));
        urlInput.addEventListener('input', () => {
            clearTimeout(extractDebounceTimeout);
            extractDebounceTimeout = setTimeout(triggerAutoExtract, 800);
        });
    }

    if (linkImageFileInput) {
        linkImageFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                openCropperWithUrl(ev.target.result);
                if (extractImageStatus) {
                    extractImageStatus.style.display = 'block';
                    extractImageStatus.style.color = '#2E8B57';
                    extractImageStatus.textContent = '✓ Imagem carregada! Ajuste o recorte e confirme.';
                }
            };
            reader.readAsDataURL(file);
        });
    }

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
        const fromInput = document.getElementById('link-available-from');
        const untilInput = document.getElementById('link-available-until');
        
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

        const isPopup = (selectedLinkFormat === 'popup');

        // Se for Pop-up e a imagem ainda não estiver preenchida, extrai automaticamente antes de salvar
        if (isPopup && url && (!linkImageUrlInput || !linkImageUrlInput.value.trim())) {
            btnCreate.disabled = true;
            btnCreate.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Extraindo imagem da capa...';
            if (window.lucide) lucide.createIcons();
            await handleExtractImage(true);
        }

        const imageUrl = isPopup && linkImageUrlInput ? linkImageUrlInput.value.trim() : null;

        const fromVal = fromInput ? fromInput.value : '';
        const untilVal = untilInput ? untilInput.value : '';
        
        const availableFrom = fromVal ? Timestamp.fromDate(new Date(fromVal)) : null;
        const availableUntil = untilVal ? Timestamp.fromDate(new Date(untilVal)) : null;


        try {
            btnCreate.disabled = true;

            if (docId) {
                btnCreate.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Salvando...';
                if (window.lucide) lucide.createIcons();

                await updateDoc(doc(db, 'dynamicLinks', docId), {
                    name: name,
                    url: url,
                    icon: selectedIcon,
                    isPopup: isPopup,
                    imageUrl: imageUrl || null,
                    availableFrom: availableFrom,
                    availableUntil: availableUntil
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
                    isPopup: isPopup,
                    imageUrl: imageUrl || null,
                    active: true,
                    createdAt: serverTimestamp(),
                    availableFrom: availableFrom,
                    availableUntil: availableUntil
                });

                nameInput.value = '';
                urlInput.value = '';
                if (fromInput) fromInput.value = '';
                if (untilInput) untilInput.value = '';
                if (counterSpan) {
                    counterSpan.textContent = '0/30';
                    counterSpan.style.color = 'var(--text-secondary)';
                }

                window.resetLinkForm();
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

// Auxiliar para formatar data/hora Firestore Timestamp para datetime-local (YYYY-MM-DDTHH:MM)
function formatDateTimeLocal(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : (timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp));
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}


// Funções para controle de Edição de Links
window.startEditLink = function(id, name, url, icon, availableFrom, availableUntil, isPopup = false, imageUrl = '') {
    const idInput = document.getElementById('link-id');
    const nameInput = document.getElementById('link-name');
    const urlInput = document.getElementById('link-url');
    const fromInput = document.getElementById('link-available-from');
    const untilInput = document.getElementById('link-available-until');
    const formTitle = document.getElementById('link-form-title');
    const formDesc = document.getElementById('link-form-desc');
    const btnCreate = document.getElementById('btn-create-link');
    const btnCancel = document.getElementById('btn-cancel-edit-link');
    
    if (idInput) idInput.value = id;
    if (nameInput) {
        nameInput.value = name;
        const counterSpan = document.getElementById('link-name-counter');
        if (counterSpan) {
            counterSpan.textContent = `${name.length}/30`;
            counterSpan.style.color = name.length >= 30 ? '#ff4444' : 'var(--text-secondary)';
        }
    }
    if (urlInput) urlInput.value = url;
    if (fromInput) fromInput.value = availableFrom || '';
    if (untilInput) untilInput.value = availableUntil || '';

    // Ajusta Formato (Botão vs Pop-up)
    const isPopupBool = (isPopup === true || isPopup === 'true');
    const formatBtnOption = document.getElementById('format-option-button');
    const formatPopupOption = document.getElementById('format-option-popup');
    
    if (isPopupBool && formatPopupOption) {
        formatPopupOption.click();
    } else if (formatBtnOption) {
        formatBtnOption.click();
    }

    const linkImageUrlInput = document.getElementById('link-image-url');
    const linkImagePreviewWrapper = document.getElementById('link-image-preview-wrapper');
    const linkImagePreview = document.getElementById('link-image-preview');

    if (linkImageUrlInput) linkImageUrlInput.value = imageUrl || '';
    if (imageUrl && linkImagePreview && linkImagePreviewWrapper) {
        linkImagePreview.src = imageUrl;
        linkImagePreviewWrapper.style.display = 'block';
    } else if (linkImagePreviewWrapper) {
        linkImagePreviewWrapper.style.display = 'none';
    }
    
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
    const fromInput = document.getElementById('link-available-from');
    const untilInput = document.getElementById('link-available-until');
    const formTitle = document.getElementById('link-form-title');
    const formDesc = document.getElementById('link-form-desc');
    const btnCreate = document.getElementById('btn-create-link');
    const btnCancel = document.getElementById('btn-cancel-edit-link');
    
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    if (fromInput) fromInput.value = '';
    if (untilInput) untilInput.value = '';

    const formatBtnOption = document.getElementById('format-option-button');
    if (formatBtnOption) formatBtnOption.click();

    const linkImageUrlInput = document.getElementById('link-image-url');
    const linkImagePreviewWrapper = document.getElementById('link-image-preview-wrapper');
    const extractImageStatus = document.getElementById('extract-image-status');
    if (linkImageUrlInput) linkImageUrlInput.value = '';
    if (linkImagePreviewWrapper) linkImagePreviewWrapper.style.display = 'none';
    if (extractImageStatus) extractImageStatus.style.display = 'none';
    
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

            let availabilityText = '';
            if (data.availableFrom || data.availableUntil) {
                const formatTime = (ts) => {
                    const d = ts.toDate ? ts.toDate() : new Date(ts);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const weekdayAbbr = d.toLocaleDateString('pt-BR', { weekday: 'short' });
                    const capitalizedWeekday = weekdayAbbr.charAt(0).toUpperCase() + weekdayAbbr.slice(1).replace('.', '');
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    return `${day}/${month} (${capitalizedWeekday}) às ${hours}:${minutes}`;
                };
                if (data.availableFrom && data.availableUntil) {
                    availabilityText = `Disponível de ${formatTime(data.availableFrom)} até ${formatTime(data.availableUntil)}`;
                } else if (data.availableFrom) {
                    availabilityText = `Disponível a partir de ${formatTime(data.availableFrom)}`;
                } else if (data.availableUntil) {
                    availabilityText = `Disponível até ${formatTime(data.availableUntil)}`;
                }
            }

            const isPopup = data.isPopup === true;
            const imageUrl = data.imageUrl || '';

            const isPopupBadge = isPopup 
                ? `<span style="background: rgba(139, 0, 0, 0.2); color: #ef5350; font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(139, 0, 0, 0.4); display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="maximize-2" style="width: 10px; height: 10px;"></i> Pop-up Modal</span>`
                : `<span style="background: rgba(255, 255, 255, 0.08); color: var(--text-secondary); font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="mouse-pointer-click" style="width: 10px; height: 10px;"></i> Botão</span>`;

            const imgThumbHtml = imageUrl 
                ? `<div style="width: 48px; height: 48px; border-radius: 8px; overflow: hidden; background: #000; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1); margin-right: 0.75rem;"><img src="${imageUrl}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover;"></div>`
                : '';

            const item = document.createElement('div');
            item.className = 'admin-notif-item';
            
            const isChecked = data.active ? 'checked' : '';
            const iconName = data.icon || 'link';
            
            item.innerHTML = `
                <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
                    ${imgThumbHtml}
                    <div class="admin-notif-content" style="flex: 1; min-width: 0;">
                        <h4 class="admin-notif-title" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <i data-lucide="${iconName}" style="width: 18px; height: 18px; color: #8A2BE2;"></i>
                            ${data.name}
                            ${isPopupBadge}
                        </h4>
                        <p class="admin-notif-message"><a href="${data.url}" target="_blank" style="color: #2E8B57; text-decoration: none;">${data.url}</a></p>
                        <div class="admin-notif-meta">
                            <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Criado em ${formattedDate}
                            ${availabilityText ? `<br><i data-lucide="calendar" style="width: 12px; height: 12px; margin-top: 4px;"></i> <strong>${availabilityText}</strong>` : ''}
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <label class="toggle-switch">
                        <input type="checkbox" class="toggle-link-status" data-id="${id}" data-name="${data.name}" data-url="${data.url}" ${isChecked}>
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="btn-edit-notif" title="Editar Link" data-id="${id}" data-name="${data.name}" data-url="${data.url}" data-icon="${iconName}" data-from="${formatDateTimeLocal(data.availableFrom)}" data-until="${formatDateTimeLocal(data.availableUntil)}" data-popup="${isPopup}" data-image="${imageUrl}">
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
                const availableFrom = btn.getAttribute('data-from');
                const availableUntil = btn.getAttribute('data-until');
                const isPopup = btn.getAttribute('data-popup');
                const imageUrl = btn.getAttribute('data-image');
                
                window.startEditLink(docId, name, url, icon, availableFrom, availableUntil, isPopup, imageUrl);
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



// ================= CONVERSÃO DE VÍRGULA PARA PONTO ================
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
    const selectMusico = document.getElementById('atestado-select-musico');
    
    const btnDownloadDelete = document.getElementById('btn-download-delete-atestado');
    const btnDeleteOnly = document.getElementById('btn-delete-only-atestado');
    let currentAtestadoPath = ''; // Armazena o caminho do arquivo para deleção segura
    let musiciansList = [];

    // Helper: Calcular data final
    function calculateEndDate(startDateStr, days) {
        if (!startDateStr || isNaN(days) || days <= 0) return null;
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(start);
        end.setDate(start.getDate() + parseInt(days) - 1);
        return end.toISOString().split('T')[0];
    }

    // Helper: Obter array de datas no intervalo
    function getDatesInRange(startDateStr, endDateStr) {
        const dates = [];
        if (!startDateStr || !endDateStr) return dates;
        let current = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');
        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    // Helper: Carregar Músicos Ativos
    async function loadMusiciansList() {
        try {
            const musiciansRef = collection(db, "musicos");
            const snapshot = await getDocs(musiciansRef);
            musiciansList = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const status = (data.Status || '').toLowerCase().trim();
                
                if (status.includes('emm')) return;
                
                const nomeRegLower = (data['NOME REGISTRO'] || '').toLowerCase();
                const nomeArtLower = (data.NOMEARTISTICO || '').toLowerCase();
                if (nomeRegLower.includes('angela de santi') || nomeArtLower.includes('angela de santi')) return;
                if (status.includes('desligado') || data.statusFirebase === 'desligado' || data.statusFirebase === 'inativo') return;

                const isBolsistaOrMonitor = status.includes("bolsista") || status.includes("monitor") || status.includes("spalla");

                if (isBolsistaOrMonitor) {
                    const nomeArtistico = (data.NOMEARTISTICO || '').trim();
                    const nomeCompleto = (data['NOME REGISTRO'] || '').trim();
                    const nome = nomeArtistico || nomeCompleto || "Sem Nome";
                    const inst = (data.INSTRUMENTOS || data.Instrumento || data.instrumento || '').trim();
                    
                    musiciansList.push({
                        id: docSnap.id,
                        nome: nome,
                        nomeRegistro: nomeCompleto,
                        nomeArtistico: nomeArtistico,
                        instrumento: inst
                    });
                }
            });
            
            musiciansList.sort((a, b) => a.nome.localeCompare(b.nome));

            // Helper global para obter instrumento de um músico
            window.getMusicianInstrumentInfo = function(musicianId, nomeMusico) {
                if (musiciansList && musiciansList.length > 0) {
                    if (musicianId) {
                        const m = musiciansList.find(item => item.id === musicianId);
                        if (m && m.instrumento) return m.instrumento;
                    }
                    if (nomeMusico) {
                        const target = nomeMusico.toLowerCase().trim();
                        const m = musiciansList.find(item => {
                            const n = (item.nome || '').toLowerCase().trim();
                            const reg = (item.nomeRegistro || '').toLowerCase().trim();
                            const art = (item.nomeArtistico || '').toLowerCase().trim();
                            return n === target || reg === target || art === target || target.includes(art) || art.includes(target);
                        });
                        if (m && m.instrumento) return m.instrumento;
                    }
                }
                return '';
            };

            if (selectMusico) {
                selectMusico.innerHTML = '<option value="">-- Selecione o Músico --</option>';
                musiciansList.forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.id;
                    option.textContent = m.nome;
                    if (m.instrumento) option.setAttribute('data-instrumento', m.instrumento);
                    selectMusico.appendChild(option);
                });
            }

            const dispensaSelectMusico = document.getElementById('dispensa-select-musico');
            if (dispensaSelectMusico) {
                dispensaSelectMusico.innerHTML = '<option value="">-- Selecione o Músico --</option>';
                musiciansList.forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.id;
                    option.textContent = m.nome;
                    if (m.instrumento) option.setAttribute('data-instrumento', m.instrumento);
                    dispensaSelectMusico.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Erro ao carregar lista de músicos para atestados:", error);
        }
    }

    // Inicializar carregamento de músicos
    loadMusiciansList();

    // Helper: Tentar encontrar músico pelo nome extraído
    function findMatchingMusicianId(aiName) {
        if (!aiName) return "";
        const target = aiName.toLowerCase().trim();
        
        let match = musiciansList.find(m => m.nome.toLowerCase() === target);
        if (match) return match.id;
        
        match = musiciansList.find(m => target.includes(m.nome.toLowerCase()) || m.nome.toLowerCase().includes(target));
        if (match) return match.id;
        
        match = musiciansList.find(m => {
            const reg = m.nomeRegistro.toLowerCase();
            const art = m.nomeArtistico.toLowerCase();
            return target.includes(reg) || reg.includes(target) || target.includes(art) || art.includes(target);
        });
        if (match) return match.id;
        
        return "";
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

        // Selecionar o músico correspondente no dropdown
        if (selectMusico) {
            const matchedId = findMatchingMusicianId(data.nome);
            selectMusico.value = matchedId;
        }
        
        // Limpar visualizador antes de carregar
        modalPdfViewer.src = '';
        
        try {
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

    // 5. Baixar e Adicionar na Lista de Presença OER (Ação Unificada de Arquivamento e Integração)
    if (btnDownloadDelete) {
        btnDownloadDelete.addEventListener('click', async () => {
            if (!auth.currentUser) {
                showNotification('Sessão expirada ou não autorizada. Faça login novamente.', 'error');
                return;
            }

            const musicianId = selectMusico ? selectMusico.value : '';
            if (!musicianId) {
                showNotification('Por favor, selecione e vincule o músico correspondente.', 'error');
                if (selectMusico) selectMusico.focus();
                return;
            }

            const id = inputEditId.value;
            const nomeMusico = inputEditNome.value;
            const selectedMusicoText = selectMusico.options[selectMusico.selectedIndex].text;
            const cid = inputEditCid.value;
            const dias = inputEditDias.value;
            const inicio = inputEditInicio.value;
            const fim = inputEditFim.value;
            const resumo = inputEditResumo.value;
            
            if (!confirm(`Tem certeza que deseja baixar o atestado e adicionar na lista de presença do músico "${selectedMusicoText}"?\n\nIsso atualizará retroativamente as presenças marcadas como falta/pendente e removerá o arquivo do servidor.`)) {
                return;
            }

            try {
                const btn = btnDownloadDelete;
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processando...';
                if (window.lucide) lucide.createIcons();

                // 1. Salvar na coleção de atestados homologados para persistência e consulta dinâmica
                console.log("💾 [Atestados] Salvando homologação no banco...");
                const instAprovado = (typeof window.getMusicianInstrumentInfo === 'function' ? window.getMusicianInstrumentInfo(musicianId, selectedMusicoText) : '') || '';
                await addDoc(collection(db, "medicalCertificates_approved"), {
                    musicianId: musicianId,
                    nomeMusico: selectedMusicoText,
                    instrumento: instAprovado,
                    cid: cid || '',
                    dias: parseInt(dias) || 0,
                    dataInicio: inicio,
                    dataFim: fim,
                    resumo: resumo || '',
                    createdAt: new Date().toISOString(),
                    criadoPor: auth.currentUser.email || 'admin'
                });

                // 2. Atualizar Listas de Presença já existentes no Firestore (Tutti e Naipes)
                console.log("📅 [Atestados] Atualizando chamadas existentes no período...");
                const dates = getDatesInRange(inicio, fim);
                let updatedDates = [];

                for (const date of dates) {
                    const presencasRef = collection(db, "presencas");
                    const qPres = query(presencasRef, where("data", "==", date));
                    const snapPres = await getDocs(qPres);
                    const docsToUpdate = [];
                    snapPres.forEach(dSnap => docsToUpdate.push(dSnap));

                    // Fallback para documento com ID direto caso não tenha campo "data"
                    if (docsToUpdate.length === 0) {
                        const directDocRef = doc(db, "presencas", date);
                        const directSnap = await getDoc(directDocRef);
                        if (directSnap.exists()) {
                            docsToUpdate.push(directSnap);
                        }
                    }

                    for (const dSnap of docsToUpdate) {
                        const presenceData = dSnap.data();
                        const registros = presenceData.registros || {};
                        const currentStatus = registros[musicianId] ? registros[musicianId].status : 'none';
                        
                        // Altera apenas se estiver falta ou pendente ('none' ou inexistente)
                        if (currentStatus === 'falta' || currentStatus === 'none' || !registros[musicianId]) {
                            registros[musicianId] = {
                                status: 'atestado',
                                minutes: 0,
                                justificativa: cid ? `Atestado CID: ${cid}` : (resumo || 'Atestado')
                            };
                            await updateDoc(doc(db, "presencas", dSnap.id), {
                                registros: registros,
                                ultimaAtualizacao: new Date().toISOString(),
                                usuarioResponsavel: auth.currentUser.email || 'admin'
                            });
                            if (!updatedDates.includes(date)) updatedDates.push(date);
                        }
                    }
                }

                // 2. Criar Log de Auditoria
                try {
                    const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
                    const datesFormatted = updatedDates.map(d => formatBR(d)).join(', ');
                    const detailsText = `Músico Vinculado: ${selectedMusicoText} (ID: ${musicianId})\nCID: ${cid}\nPeríodo: ${formatBR(inicio)} a ${formatBR(fim)} (${dias} dias)\nDatas de Presença Atualizadas: ${updatedDates.length > 0 ? datesFormatted : 'Nenhuma (lista não iniciada ou sem faltas)'}\nParecer: ${resumo}`;
                    await saveLog("atestado", `Atestado homologado e integrado: ${nomeMusico}`, null, detailsText);
                } catch (logErr) {
                    console.error("⚠️ [Atestados] Erro no log:", logErr);
                }

                // 3. Buscar o arquivo (Blob) - FAZER ANTES DE APAGAR
                console.log("📥 [Atestados] Preparando download...");
                const fileRef = ref(storage, currentAtestadoPath);
                const blob = await getBlob(fileRef);

                // 4. Apagar do Servidor (Storage e Firestore) - FAZER ANTES DO DOWNLOAD
                console.log("🔥 [Atestados] Limpando servidor...");
                try {
                    await deleteObject(fileRef);
                } catch (e) { console.error("Erro storage:", e); }

                try {
                    const docRef = doc(db, "medicalCertificates", id);
                    await deleteDoc(docRef);
                } catch (e) { console.error("Erro firestore:", e); }

                // 5. Fechar Interface Imediatamente
                closeAtestadoModal();
                showNotification(`Homologado com sucesso! ${updatedDates.length} dia(s) atualizados.`, 'success');
                if (typeof reloadAtestadosHomologadosTable === 'function') {
                    reloadAtestadosHomologadosTable();
                }

                // 6. Disparar o Download/Preview (Último passo)
                if (blob) {
                    const blobUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    const safeNome = selectedMusicoText.replace(/\s+/g, '_');
                    link.download = `atestado_${safeNome}_${dias}_dias_${cid}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                }
            } catch (error) {
                console.error("Erro ao homologar atestado:", error);
                showNotification(`Erro ao processar homologação: ${error.message}`, 'error');
            } finally {
                btnDownloadDelete.disabled = false;
                btnDownloadDelete.innerHTML = '<i data-lucide="download-cloud"></i> Baixar e Adicionar na Lista de Presença OER';
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    // 6. Apagar Atestado Sem Adicionar na Lista
    if (btnDeleteOnly) {
        btnDeleteOnly.addEventListener('click', async () => {
            if (!auth.currentUser) {
                showNotification('Sessão expirada ou não autorizada. Faça login novamente.', 'error');
                return;
            }

            const id = inputEditId.value;
            const nomeMusico = inputEditNome.value || 'Desconhecido';

            if (!id) {
                showNotification('Nenhum atestado selecionado.', 'error');
                return;
            }

            if (!confirm(`Tem certeza que deseja apagar o atestado do músico "${nomeMusico}" sem adicionar à lista de presença?\n\nEsta ação removerá o atestado permanentemente e não poderá ser desfeita.`)) {
                return;
            }

            try {
                btnDeleteOnly.disabled = true;
                btnDeleteOnly.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Apagando...';
                if (window.lucide) lucide.createIcons();

                // 1. Apagar do Firebase Storage (se houver caminho registrado)
                if (currentAtestadoPath) {
                    try {
                        console.log("🔥 [Atestados] Removendo arquivo do Storage:", currentAtestadoPath);
                        const fileRef = ref(storage, currentAtestadoPath);
                        await deleteObject(fileRef);
                    } catch (storageErr) {
                        console.error("⚠️ [Atestados] Erro ao remover arquivo do Storage:", storageErr);
                    }
                }

                // 2. Apagar do Firestore
                console.log("🔥 [Atestados] Removendo documento do Firestore ID:", id);
                const docRef = doc(db, "medicalCertificates", id);
                await deleteDoc(docRef);

                // 3. Registrar log de auditoria
                try {
                    await saveLog("atestado", `Atestado descartado/apagado sem homologar: ${nomeMusico}`, null, `ID Atestado: ${id}`);
                } catch (logErr) {
                    console.error("⚠️ [Atestados] Erro no log de auditoria:", logErr);
                }

                closeAtestadoModal();
                showNotification('Atestado removido com sucesso.', 'info');

            } catch (err) {
                console.error("Erro ao apagar atestado:", err);
                showNotification('Erro ao apagar o atestado: ' + err.message, 'error');
            } finally {
                btnDeleteOnly.disabled = false;
                btnDeleteOnly.innerHTML = '<i data-lucide="trash-2"></i> Apagar Atestado Sem Adicionar na Lista';
                if (window.lucide) lucide.createIcons();
            }
        });
    }
}

// ================= MÓDULO DE DISPENSAS DE BOLSISTAS =================
function initDispensasModule() {
    const btnOpenModal = document.getElementById('btn-open-dispensa-modal');
    const modalDispensa = document.getElementById('dispensa-modal');
    const btnCloseModal = document.getElementById('btn-close-dispensa-modal');
    const btnCancel = document.getElementById('btn-cancel-dispensa');
    const formDispensa = document.getElementById('form-dispensa');
    
    const selectMusico = document.getElementById('dispensa-select-musico');
    const inputInicio = document.getElementById('dispensa-input-inicio');
    const inputFim = document.getElementById('dispensa-input-fim');
    const inputDescricao = document.getElementById('dispensa-input-descricao');
    const tableBody = document.getElementById('dispensas-table-body');
    const btnSave = document.getElementById('btn-save-dispensa');

    if (!btnOpenModal || !modalDispensa) return;

    // Popula select de músicos ativos buscando direto do Firestore
    async function populateMusiciansSelect() {
        if (!selectMusico) return;
        selectMusico.innerHTML = '<option value="">Carregando músicos...</option>';
        try {
            const snapshot = await getDocs(collection(db, "musicos"));
            const lista = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const status = (data.Status || '').toLowerCase().trim();
                if (status.includes('emm')) return;
                const nomeRegLower = (data['NOME REGISTRO'] || '').toLowerCase();
                const nomeArtLower = (data.NOMEARTISTICO || '').toLowerCase();
                if (nomeRegLower.includes('angela de santi') || nomeArtLower.includes('angela de santi')) return;
                if (status.includes('desligado') || data.statusFirebase === 'desligado' || data.statusFirebase === 'inativo') return;
                const isBolsistaOrMonitor = status.includes("bolsista") || status.includes("monitor") || status.includes("spalla");
                if (isBolsistaOrMonitor) {
                    const nomeArtistico = (data.NOMEARTISTICO || '').trim();
                    const nomeCompleto = (data['NOME REGISTRO'] || '').trim();
                    const inst = (data.INSTRUMENTOS || data.Instrumento || data.instrumento || '').trim();
                    lista.push({
                        id: docSnap.id,
                        nome: nomeArtistico || nomeCompleto || "Sem Nome",
                        instrumento: inst
                    });
                }
            });
            lista.sort((a, b) => a.nome.localeCompare(b.nome));
            selectMusico.innerHTML = '<option value="">-- Selecione o Músico --</option>';
            lista.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.nome;
                if (m.instrumento) opt.setAttribute('data-instrumento', m.instrumento);
                selectMusico.appendChild(opt);
            });
        } catch (err) {
            console.error("Erro ao carregar músicos para dispensa:", err);
            selectMusico.innerHTML = '<option value="">Erro ao carregar músicos</option>';
        }
    }

    function openDispensaModal() {
        if (formDispensa) formDispensa.reset();
        modalDispensa.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (window.lucide) lucide.createIcons();
        populateMusiciansSelect();
    }

    function closeDispensaModal() {
        modalDispensa.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    btnOpenModal.addEventListener('click', openDispensaModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeDispensaModal);
    if (btnCancel) btnCancel.addEventListener('click', closeDispensaModal);

    modalDispensa.addEventListener('click', (e) => {
        if (e.target === modalDispensa) closeDispensaModal();
    });

    // Salvar e Aplicar Dispensa
    if (formDispensa) {
        formDispensa.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!auth.currentUser) {
                showNotification('Sessão expirada. Faça login novamente.', 'error');
                return;
            }

            const musicianId = selectMusico ? selectMusico.value : '';
            const dataInicio = inputInicio ? inputInicio.value : '';
            const dataFim = inputFim ? inputFim.value : '';
            const descricao = inputDescricao ? inputDescricao.value.trim() : '';

            if (!musicianId) {
                showNotification('Por favor, selecione um músico ativo.', 'error');
                return;
            }
            if (!dataInicio || !dataFim) {
                showNotification('Por favor, informe a Data Inicial e Data Final.', 'error');
                return;
            }
            if (dataInicio > dataFim) {
                showNotification('A Data Inicial não pode ser maior que a Data Final.', 'error');
                return;
            }
            if (!descricao) {
                showNotification('Por favor, informe a descrição/motivo da dispensa.', 'error');
                return;
            }

            const selectedOption = selectMusico.options[selectMusico.selectedIndex];
            const nomeMusico = selectedOption ? selectedOption.text : 'Músico';
            const selectedInstrumento = selectedOption ? (selectedOption.getAttribute('data-instrumento') || (typeof window.getMusicianInstrumentInfo === 'function' ? window.getMusicianInstrumentInfo(musicianId, nomeMusico) : '')) : '';

            try {
                if (btnSave) {
                    btnSave.disabled = true;
                    btnSave.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Salvando...';
                    if (window.lucide) lucide.createIcons();
                }

                // 1. Salvar na coleção "dispensas" no Firestore
                await addDoc(collection(db, "dispensas"), {
                    musicianId: musicianId,
                    nomeMusico: nomeMusico,
                    instrumento: selectedInstrumento || '',
                    dataInicio: dataInicio,
                    dataFim: dataFim,
                    descricao: descricao,
                    criadoEm: new Date().toISOString(),
                    criadoPor: auth.currentUser.email || 'admin'
                });

                // 2. Atualizar Listas de Presença Existentes no Firestore para o período
                // Helper local para gerar array de datas
                function getDateRange(start, end) {
                    const result = [];
                    if (!start || !end) return result;
                    let cur = new Date(start + 'T00:00:00');
                    const endDate = new Date(end + 'T00:00:00');
                    while (cur <= endDate) {
                        result.push(cur.toISOString().split('T')[0]);
                        cur.setDate(cur.getDate() + 1);
                    }
                    return result;
                }
                const dates = getDateRange(dataInicio, dataFim);
                let updatedCount = 0;

                for (const date of dates) {
                    const presenceDocRef = doc(db, "presencas", date);
                    const presenceSnap = await getDoc(presenceDocRef);
                    
                    if (presenceSnap.exists()) {
                        const presenceData = presenceSnap.data();
                        const registros = presenceData.registros || {};
                        
                        registros[musicianId] = {
                            status: 'dispensa',
                            minutes: 0,
                            justificativa: descricao
                        };

                        await updateDoc(presenceDocRef, {
                            registros: registros,
                            ultimaAtualizacao: new Date().toISOString(),
                            usuarioResponsavel: auth.currentUser.email || 'admin'
                        });
                        updatedCount++;
                    }
                }

                // 3. Registrar Log de Auditoria
                try {
                    const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
                    const detailsText = `Músico: ${nomeMusico} (ID: ${musicianId})\nPeríodo: ${formatBR(dataInicio)} até ${formatBR(dataFim)}\nListas Existentes Atualizadas: ${updatedCount} data(s)\nMotivo: ${descricao}`;
                    await saveLog("dispensa", `Dispensa concedida: ${nomeMusico}`, null, detailsText);
                } catch (logErr) {
                    console.error("⚠️ [Dispensas] Erro ao salvar log:", logErr);
                }

                showNotification(`Dispensa concedida com sucesso! ${updatedCount} lista(s) de presença atualizada(s).`, 'success');
                closeDispensaModal();
                loadDispensasTable();

            } catch (err) {
                console.error("Erro ao salvar dispensa:", err);
                showNotification(`Erro ao conceder dispensa: ${err.message}`, 'error');
            } finally {
                if (btnSave) {
                    btnSave.disabled = false;
                    btnSave.innerHTML = '<i data-lucide="check-circle"></i> Salvar e Aplicar Dispensa';
                    if (window.lucide) lucide.createIcons();
                }
            }
        });
    }

    // Estado do módulo de dispensas
    let rawDispensasData = [];
    let currentDispensaFilter = 'todas';

    const searchInput = document.getElementById('dispensa-search-input');
    const chipFilters = document.querySelectorAll('.chip-dispensa-filter');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderFilteredDispensas();
        });
    }

    if (chipFilters && chipFilters.length > 0) {
        chipFilters.forEach(chip => {
            chip.addEventListener('click', () => {
                chipFilters.forEach(c => {
                    c.classList.remove('active');
                    c.style.background = 'white';
                    c.style.color = '#4c1d95';
                    c.style.borderColor = '#ddd6fe';
                });
                chip.classList.add('active');
                chip.style.background = '#7c3aed';
                chip.style.color = 'white';
                chip.style.borderColor = '#7c3aed';

                currentDispensaFilter = chip.getAttribute('data-filter') || 'todas';
                renderFilteredDispensas();
            });
        });
    }

    // Carregar Tabela de Dispensas do Firestore
    async function loadDispensasTable() {
        if (!tableBody) return;
        try {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1.5rem; color: #888;"><i data-lucide="loader-2" class="spin"></i> Carregando dispensas...</td></tr>';
            if (window.lucide) lucide.createIcons();

            const q = query(collection(db, "dispensas"), orderBy("criadoEm", "desc"));
            const snapshot = await getDocs(q);

            rawDispensasData = [];
            snapshot.forEach(docSnap => {
                rawDispensasData.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });

            renderFilteredDispensas();

        } catch (err) {
            console.error("Erro ao carregar tabela de dispensas:", err);
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem; color: #dc2626;">Erro ao carregar dispensas.</td></tr>';
        }
    }

    // Renderizar Tabela com Filtros, Busca e Ordenação por Status
    function renderFilteredDispensas() {
        if (!tableBody) return;

        const hojeStr = new Date().toISOString().split('T')[0];
        const searchVal = (searchInput ? searchInput.value : '').toLowerCase().trim();

        // 1. Processar status e prioridade de cada dispensa
        const processedList = rawDispensasData.map(item => {
            const inicio = item.dataInicio || '';
            const fim = item.dataFim || '';

            let statusKey = 'ativa';
            let statusLabel = 'Ativa';
            let priority = 1;

            if (fim && fim < hojeStr) {
                statusKey = 'encerrada';
                statusLabel = 'Encerrada';
                priority = 3;
            } else if (inicio && inicio > hojeStr) {
                statusKey = 'futura';
                statusLabel = 'Futura';
                priority = 2;
            } else {
                statusKey = 'ativa';
                statusLabel = 'Ativa';
                priority = 1;
            }

            return {
                ...item,
                _statusKey: statusKey,
                _statusLabel: statusLabel,
                _priority: priority
            };
        });

        // 2. Filtrar por Busca (nome do músico ou descrição)
        let filtered = processedList.filter(item => {
            if (!searchVal) return true;
            const nome = (item.nomeMusico || '').toLowerCase();
            const desc = (item.descricao || '').toLowerCase();
            return nome.includes(searchVal) || desc.includes(searchVal);
        });

        // 3. Filtrar por Chip de Status
        if (currentDispensaFilter !== 'todas') {
            filtered = filtered.filter(item => item._statusKey === currentDispensaFilter);
        }

        // 4. Ordenar: Ativas (1) -> Futuras (2) -> Encerradas (3)
        // Dentro do mesmo status: por dataInicio decrescente ou criadoEm decrescente
        filtered.sort((a, b) => {
            if (a._priority !== b._priority) {
                return a._priority - b._priority;
            }
            // Secundário: por dataInicio decrescente
            const dateA = a.dataInicio || a.criadoEm || '';
            const dateB = b.dataInicio || b.criadoEm || '';
            return dateB.localeCompare(dateA);
        });

        // Atualizar subtítulo com estatísticas
        const ativasHojeCount = processedList.filter(i => i._statusKey === 'ativa').length;
        const subtitleEl = document.getElementById('dispensas-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = `${ativasHojeCount} dispensa(s) ativa(s) hoje • Total de ${processedList.length} registro(s)`;
        }

        // 5. Se estiver vazio
        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2.5rem 1rem;">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
                            <div style="width: 48px; height: 48px; background: #faf5ff; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="search-x" style="width: 22px; height: 22px; color: #a78bfa;"></i>
                            </div>
                            <p style="margin: 0; font-size: 0.9rem; font-weight: 600; color: #6b7280;">Nenhuma dispensa encontrada</p>
                            <p style="margin: 0; font-size: 0.78rem; color: #9ca3af;">${searchVal ? 'Tente alterar os termos da busca ou o filtro de status.' : 'Clique em "Conceder Dispensa" para registrar uma.'}</p>
                        </div>
                    </td>
                </tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // 6. Renderizar linhas
        tableBody.innerHTML = '';
        const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';

        filtered.forEach(data => {
            const id = data.id;
            const isEncerrada = data._statusKey === 'encerrada';
            const isAtiva = data._statusKey === 'ativa';
            const isFutura = data._statusKey === 'futura';

            const tr = document.createElement('tr');

            if (isEncerrada) {
                tr.style.cssText = 'background: #f8fafc; border-bottom: 1px solid #e2e8f0; opacity: 0.78; transition: background 0.15s ease, opacity 0.15s ease;';
                tr.addEventListener('mouseenter', () => { tr.style.background = '#f1f5f9'; tr.style.opacity = '1'; });
                tr.addEventListener('mouseleave', () => { tr.style.background = '#f8fafc'; tr.style.opacity = '0.78'; });
            } else {
                tr.style.cssText = 'background: white; border-bottom: 1px solid #ede9fe; transition: background 0.15s ease;';
                tr.addEventListener('mouseenter', () => tr.style.background = '#faf5ff');
                tr.addEventListener('mouseleave', () => tr.style.background = 'white');
            }

            const dataInicioFmt = formatBR(data.dataInicio);
            const dataFimFmt = formatBR(data.dataFim);
            const dataCriacaoFmt = data.criadoEm ? new Date(data.criadoEm).toLocaleDateString('pt-BR') : '---';

            // Badge de Status
            let statusBadgeHtml = '';
            if (isAtiva) {
                statusBadgeHtml = `<span style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 0.25rem 0.65rem; border-radius: 12px; font-weight: 600; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.3rem;"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Ativa</span>`;
            } else if (isFutura) {
                statusBadgeHtml = `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 0.25rem 0.65rem; border-radius: 12px; font-weight: 600; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.3rem;"><i data-lucide="calendar" style="width: 12px; height: 12px;"></i> Futura</span>`;
            } else {
                statusBadgeHtml = `<span style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; padding: 0.25rem 0.65rem; border-radius: 12px; font-weight: 600; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.3rem;"><i data-lucide="clock" style="width: 12px; height: 12px;"></i> Encerrada</span>`;
            }

            // Estilos do Avatar e Nome
            const avatarBg = isEncerrada ? '#cbd5e1' : 'linear-gradient(135deg, #ede9fe, #ddd6fe)';
            const avatarColor = isEncerrada ? '#475569' : '#6b21a8';
            const nomeColor = isEncerrada ? '#64748b' : '#6b21a8';

            // Estilos da Badge Período
            const periodoBg = isEncerrada ? '#e2e8f0' : '#ede9fe';
            const periodoColor = isEncerrada ? '#475569' : '#6b21a8';

            tr.innerHTML = `
                <td style="padding: 0.85rem 1.1rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 32px; height: 32px; background: ${avatarBg}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.75rem; font-weight: 700; color: ${avatarColor};">${(data.nomeMusico || 'M').charAt(0).toUpperCase()}</div>
                        <span class="btn-view-dispensa-detail" data-id="${id}" style="font-weight: 600; color: ${nomeColor}; font-size: 0.875rem; cursor: pointer; text-decoration: underline; text-underline-offset: 2px;" title="Clique para ver os detalhes da dispensa">${data.nomeMusico || 'Músico'}</span>
                    </div>
                </td>
                <td style="padding: 0.85rem 1.1rem;">
                    <span style="background: ${periodoBg}; color: ${periodoColor}; padding: 0.3rem 0.75rem; border-radius: 20px; font-weight: 600; font-size: 0.78rem; white-space: nowrap;">
                        ${dataInicioFmt} → ${dataFimFmt}
                    </span>
                </td>
                <td style="padding: 0.85rem 1.1rem;">
                    ${statusBadgeHtml}
                </td>
                <td style="padding: 0.85rem 1.1rem; color: ${isEncerrada ? '#64748b' : '#4b5563'}; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${data.descricao || ''}">${data.descricao || '—'}</td>
                <td style="padding: 0.85rem 1.1rem; color: #9ca3af; font-size: 0.82rem; white-space: nowrap;">${dataCriacaoFmt}</td>
                <td style="padding: 0.85rem 1.1rem; text-align: right;">
                    <button class="btn-delete-dispensa" data-id="${id}" data-nome="${data.nomeMusico || ''}" 
                        style="background: transparent; border: 1.5px solid ${isEncerrada ? '#cbd5e1' : '#fca5a5'}; color: ${isEncerrada ? '#64748b' : '#ef4444'}; cursor: pointer; padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; transition: all 0.15s ease;"
                        onmouseover="this.style.background='${isEncerrada ? '#f1f5f9' : '#fef2f2'}'; this.style.borderColor='${isEncerrada ? '#94a3b8' : '#ef4444'}';"
                        onmouseout="this.style.background='transparent'; this.style.borderColor='${isEncerrada ? '#cbd5e1' : '#fca5a5'}';"
                        title="Cancelar / Excluir Dispensa">
                        <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i> Excluir
                    </button>
                </td>
            `;
            tr._dispensaData = data;
            tr._dispensaId = id;
            tableBody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();

        // Event listener para abrir modal de detalhe
        document.querySelectorAll('.btn-view-dispensa-detail').forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const tr = span.closest('tr');
                if (tr && tr._dispensaData) {
                    openDispensaDetalheModal(tr._dispensaData);
                }
            });
        });

        // Event listener para botões de exclusão
        document.querySelectorAll('.btn-delete-dispensa').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const nome = btn.getAttribute('data-nome');
                
                if (!confirm(`Deseja realmente cancelar/excluir a dispensa de "${nome}"?`)) return;

                try {
                    await deleteDoc(doc(db, "dispensas", id));
                    showNotification('Dispensa excluída com sucesso.', 'info');
                    try {
                        await saveLog("dispensa", `Dispensa cancelada/excluída: ${nome}`, null, `ID Dispensa: ${id}`);
                    } catch(lErr) {}
                    loadDispensasTable();
                } catch (err) {
                    console.error("Erro ao excluir dispensa:", err);
                    showNotification(`Erro ao excluir dispensa: ${err.message}`, 'error');
                }
            });
        });
    }

    // Modal de Detalhe e Edição da Dispensa
    const modalDetalhe = document.getElementById('dispensa-detalhe-modal');
    const btnCloseDetalhe = document.getElementById('btn-close-dispensa-detalhe-modal');
    const btnCloseDetalheFooter = document.getElementById('btn-close-dispensa-detalhe-footer');
    const btnCopyDetalhe = document.getElementById('btn-copy-dispensa-detalhe');
    const btnEditDetalhe = document.getElementById('btn-edit-dispensa-detalhe');
    const btnCancelEditDispensa = document.getElementById('btn-cancel-edit-dispensa');
    const btnSaveEditDispensa = document.getElementById('btn-save-edit-dispensa');

    const viewModeDiv = document.getElementById('dispensa-detalhe-view-mode');
    const editModeDiv = document.getElementById('dispensa-detalhe-edit-mode');
    const viewActionsDiv = document.getElementById('dispensa-detalhe-view-actions');
    const editActionsDiv = document.getElementById('dispensa-detalhe-edit-actions');

    const inputEditInicio = document.getElementById('edit-dispensa-input-inicio');
    const inputEditFim = document.getElementById('edit-dispensa-input-fim');
    const inputEditDescricao = document.getElementById('edit-dispensa-input-descricao');

    let currentDetalheData = null;

    function openDispensaDetalheModal(data) {
        if (!modalDetalhe) return;
        currentDetalheData = data;

        // Reset para Modo Visualização
        switchDispensaModalMode('view');

        const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
        const dInicio = data.dataInicio ? new Date(data.dataInicio + 'T00:00:00') : null;
        const dFim = data.dataFim ? new Date(data.dataFim + 'T00:00:00') : null;
        let dias = 0;
        if (dInicio && dFim) {
            dias = Math.round((dFim - dInicio) / (1000 * 60 * 60 * 24)) + 1;
        }

        const elemAvatar = document.getElementById('dispensa-detalhe-avatar');
        const elemMusico = document.getElementById('dispensa-detalhe-musico');
        const elemInstrumento = document.getElementById('dispensa-detalhe-instrumento');
        const elemPeriodo = document.getElementById('dispensa-detalhe-periodo');
        const elemDuracao = document.getElementById('dispensa-detalhe-duracao');
        const elemDescricao = document.getElementById('dispensa-detalhe-descricao');
        const elemCriadoEm = document.getElementById('dispensa-detalhe-criadoem');
        const elemCriadoPor = document.getElementById('dispensa-detalhe-criadopor');

        const instrumento = data.instrumento || (typeof window.getMusicianInstrumentInfo === 'function' ? window.getMusicianInstrumentInfo(data.musicianId, data.nomeMusico) : '') || '—';

        if (elemAvatar) elemAvatar.textContent = (data.nomeMusico || 'M').charAt(0).toUpperCase();
        if (elemMusico) elemMusico.textContent = data.nomeMusico || 'Músico';
        if (elemInstrumento) elemInstrumento.textContent = instrumento;
        if (elemPeriodo) elemPeriodo.textContent = `${formatBR(data.dataInicio)} → ${formatBR(data.dataFim)}`;
        if (elemDuracao) elemDuracao.textContent = `${dias} dia${dias !== 1 ? 's' : ''}`;
        if (elemDescricao) elemDescricao.textContent = data.descricao || 'Nenhuma observação informada.';
        if (elemCriadoEm) elemCriadoEm.textContent = data.criadoEm ? new Date(data.criadoEm).toLocaleDateString('pt-BR') + ' às ' + new Date(data.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
        if (elemCriadoPor) elemCriadoPor.textContent = data.criadoPor || 'admin';

        modalDetalhe.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (window.lucide) lucide.createIcons();
    }

    function switchDispensaModalMode(mode) {
        if (mode === 'edit') {
            if (viewModeDiv) viewModeDiv.style.display = 'none';
            if (editModeDiv) editModeDiv.style.display = 'flex';
            if (viewActionsDiv) viewActionsDiv.style.display = 'none';
            if (editActionsDiv) editActionsDiv.style.display = 'flex';
        } else {
            if (viewModeDiv) viewModeDiv.style.display = 'flex';
            if (editModeDiv) editModeDiv.style.display = 'none';
            if (viewActionsDiv) viewActionsDiv.style.display = 'flex';
            if (editActionsDiv) editActionsDiv.style.display = 'none';
        }
    }

    function closeDispensaDetalheModal() {
        if (modalDetalhe) {
            modalDetalhe.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    if (btnCloseDetalhe) btnCloseDetalhe.addEventListener('click', closeDispensaDetalheModal);
    if (btnCloseDetalheFooter) btnCloseDetalheFooter.addEventListener('click', closeDispensaDetalheModal);
    if (modalDetalhe) {
        modalDetalhe.addEventListener('click', (e) => {
            if (e.target === modalDetalhe) closeDispensaDetalheModal();
        });
    }

    if (btnEditDetalhe) {
        btnEditDetalhe.addEventListener('click', () => {
            if (!currentDetalheData) return;
            const musicoHeader = document.getElementById('edit-dispensa-musico-nome');
            if (musicoHeader) musicoHeader.textContent = `Editar Dispensa de ${currentDetalheData.nomeMusico || 'Músico'}`;

            if (inputEditInicio) inputEditInicio.value = currentDetalheData.dataInicio || '';
            if (inputEditFim) inputEditFim.value = currentDetalheData.dataFim || '';
            if (inputEditDescricao) inputEditDescricao.value = currentDetalheData.descricao || '';

            switchDispensaModalMode('edit');
            if (window.lucide) lucide.createIcons();
        });
    }

    if (btnCancelEditDispensa) {
        btnCancelEditDispensa.addEventListener('click', () => {
            switchDispensaModalMode('view');
        });
    }

    // Helper local para obter array de datas ISO YYYY-MM-DD
    function getDateRangeArray(start, end) {
        const result = [];
        if (!start || !end) return result;
        let cur = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T00:00:00');
        while (cur <= endDate) {
            result.push(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }
        return result;
    }

    // Salvar Edição da Dispensa
    if (btnSaveEditDispensa) {
        btnSaveEditDispensa.addEventListener('click', async () => {
            if (!currentDetalheData || !currentDetalheData.id) return;

            const newInicio = inputEditInicio ? inputEditInicio.value : '';
            const newFim = inputEditFim ? inputEditFim.value : '';
            const newDesc = inputEditDescricao ? inputEditDescricao.value.trim() : '';

            if (!newInicio || !newFim) {
                showNotification('Por favor, informe as Datas Inicial e Final.', 'error');
                return;
            }
            if (newInicio > newFim) {
                showNotification('A Data Inicial não pode ser maior que a Data Final.', 'error');
                return;
            }
            if (!newDesc) {
                showNotification('Por favor, informe o motivo da dispensa.', 'error');
                return;
            }

            const dispensaId = currentDetalheData.id;
            const musicianId = currentDetalheData.musicianId;

            try {
                btnSaveEditDispensa.disabled = true;
                btnSaveEditDispensa.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Salvando...';
                if (window.lucide) lucide.createIcons();

                const oldDates = getDateRangeArray(currentDetalheData.dataInicio, currentDetalheData.dataFim);
                const newDates = getDateRangeArray(newInicio, newFim);

                const removedDates = oldDates.filter(d => !newDates.includes(d));

                // 1. Remover dispensa das datas desmarcadas na presencas
                for (const date of removedDates) {
                    const presenceRef = doc(db, "presencas", date);
                    const snap = await getDoc(presenceRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const registros = data.registros || {};
                        if (registros[musicianId] && registros[musicianId].status === 'dispensa') {
                            delete registros[musicianId];
                            await updateDoc(presenceRef, {
                                registros: registros,
                                ultimaAtualizacao: new Date().toISOString(),
                                usuarioResponsavel: auth.currentUser.email || 'admin'
                            });
                        }
                    }
                }

                // 2. Atualizar ou criar dispensa nas novas datas
                for (const date of newDates) {
                    const presenceRef = doc(db, "presencas", date);
                    const snap = await getDoc(presenceRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const registros = data.registros || {};
                        registros[musicianId] = {
                            status: 'dispensa',
                            minutes: 0,
                            justificativa: newDesc
                        };
                        await updateDoc(presenceRef, {
                            registros: registros,
                            ultimaAtualizacao: new Date().toISOString(),
                            usuarioResponsavel: auth.currentUser.email || 'admin'
                        });
                    }
                }

                // 3. Atualizar o documento da dispensa no Firestore
                const updatedFields = {
                    dataInicio: newInicio,
                    dataFim: newFim,
                    descricao: newDesc,
                    editadoEm: new Date().toISOString(),
                    editadoPor: auth.currentUser.email || 'admin'
                };

                await updateDoc(doc(db, "dispensas", dispensaId), updatedFields);

                // 4. Registrar Log de Auditoria
                try {
                    const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
                    const details = `Músico: ${currentDetalheData.nomeMusico}\nPeríodo Anterior: ${formatBR(currentDetalheData.dataInicio)} a ${formatBR(currentDetalheData.dataFim)}\nNovo Período: ${formatBR(newInicio)} a ${formatBR(newFim)}\nMotivo: ${newDesc}`;
                    await saveLog("dispensa", `Dispensa editada: ${currentDetalheData.nomeMusico}`, null, details);
                } catch(lErr) {}

                showNotification('Dispensa editada com sucesso e presenças atualizadas!', 'success');
                closeDispensaDetalheModal();
                loadDispensasTable();

            } catch (err) {
                console.error("Erro ao salvar edição da dispensa:", err);
                showNotification(`Erro ao salvar alteração: ${err.message}`, 'error');
            } finally {
                btnSaveEditDispensa.disabled = false;
                btnSaveEditDispensa.innerHTML = '<i data-lucide="check"></i> Salvar Alterações';
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    if (btnCopyDetalhe) {
        btnCopyDetalhe.addEventListener('click', () => {
            if (!currentDetalheData) return;
            const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
            const dInicio = currentDetalheData.dataInicio ? new Date(currentDetalheData.dataInicio + 'T00:00:00') : null;
            const dFim = currentDetalheData.dataFim ? new Date(currentDetalheData.dataFim + 'T00:00:00') : null;
            let dias = 0;
            if (dInicio && dFim) {
                dias = Math.round((dFim - dInicio) / (1000 * 60 * 60 * 24)) + 1;
            }

            const instrumento = currentDetalheData.instrumento || (typeof window.getMusicianInstrumentInfo === 'function' ? window.getMusicianInstrumentInfo(currentDetalheData.musicianId, currentDetalheData.nomeMusico) : '') || '—';

            const texto = `DISPENSA DE BOLSISTA — OER
Músico: ${currentDetalheData.nomeMusico || 'Músico'}
Instrumento: ${instrumento}
Período: ${formatBR(currentDetalheData.dataInicio)} até ${formatBR(currentDetalheData.dataFim)} (${dias} dia${dias !== 1 ? 's' : ''})
Motivo / Justificativa: ${currentDetalheData.descricao || '-'}
Cadastrado por: ${currentDetalheData.criadoPor || 'admin'}`;

            navigator.clipboard.writeText(texto).then(() => {
                showNotification('Resumo da dispensa copiado com sucesso!', 'success');
            }).catch(() => {
                showNotification('Erro ao copiar resumo.', 'error');
            });
        });
    }

    loadDispensasTable();
}

// ================= MÓDULO DE ATESTADOS HOMOLOGADOS =================
let reloadAtestadosHomologadosTable = null;

function initAtestadosHomologadosModule() {
    const tableBody = document.getElementById('atestados-homologados-table-body');
    const searchInput = document.getElementById('atestado-homologado-search-input');
    const chipFilters = document.querySelectorAll('.chip-atestado-filter');
    const subtitleEl = document.getElementById('atestados-homologados-subtitle');

    const modalDetalhe = document.getElementById('atestado-detalhe-modal');
    const btnCloseDetalhe = document.getElementById('btn-close-atestado-detalhe-modal');
    const btnCloseDetalheFooter = document.getElementById('btn-close-atestado-detalhe-footer');
    const btnCopyDetalhe = document.getElementById('btn-copy-atestado-detalhe');
    const btnEditDetalhe = document.getElementById('btn-edit-atestado-detalhe');
    const btnDeleteDetalhe = document.getElementById('btn-delete-atestado-detalhe');
    const btnCancelEditAtestado = document.getElementById('btn-cancel-edit-atestado');
    const btnSaveEditAtestado = document.getElementById('btn-save-edit-atestado');

    const viewModeDiv = document.getElementById('atestado-detalhe-view-mode');
    const editModeDiv = document.getElementById('atestado-detalhe-edit-mode');
    const viewActionsDiv = document.getElementById('atestado-detalhe-view-actions');
    const editActionsDiv = document.getElementById('atestado-detalhe-edit-actions');

    const inputEditInicio = document.getElementById('edit-atestado-input-inicio');
    const inputEditDias = document.getElementById('edit-atestado-input-dias');
    const inputEditCid = document.getElementById('edit-atestado-input-cid');
    const inputEditResumo = document.getElementById('edit-atestado-input-resumo');

    let rawAtestadosData = [];
    let currentAtestadoFilter = 'todas';
    let currentAtestadoDetalheData = null;

    if (!tableBody) return;

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderFilteredAtestados();
        });
    }

    if (chipFilters && chipFilters.length > 0) {
        chipFilters.forEach(chip => {
            chip.addEventListener('click', () => {
                chipFilters.forEach(c => {
                    c.classList.remove('active');
                    c.style.background = 'white';
                    c.style.color = '#1e40af';
                    c.style.borderColor = '#bfdbfe';
                });
                chip.classList.add('active');
                chip.style.background = '#2563eb';
                chip.style.color = 'white';
                chip.style.borderColor = '#2563eb';

                currentAtestadoFilter = chip.getAttribute('data-filter') || 'todas';
                renderFilteredAtestados();
            });
        });
    }

    // Carregar Tabela de Atestados Homologados do Firestore
    async function loadAtestadosHomologadosTable() {
        if (!tableBody) return;
        try {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1.5rem; color: #60a5fa;"><i data-lucide="loader-2" class="spin"></i> Carregando atestados homologados...</td></tr>';
            if (window.lucide) lucide.createIcons();

            const snapshot = await getDocs(collection(db, "medicalCertificates_approved"));

            rawAtestadosData = [];
            snapshot.forEach(docSnap => {
                rawAtestadosData.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });

            renderFilteredAtestados();

        } catch (err) {
            console.error("Erro ao carregar tabela de atestados homologados:", err);
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem; color: #dc2626;">Erro ao carregar atestados homologados.</td></tr>';
        }
    }

    reloadAtestadosHomologadosTable = loadAtestadosHomologadosTable;

    // Renderizar Tabela com Filtros, Busca e Ordenação por Status
    function renderFilteredAtestados() {
        if (!tableBody) return;

        const hojeStr = new Date().toISOString().split('T')[0];
        const searchVal = (searchInput ? searchInput.value : '').toLowerCase().trim();

        // 1. Processar status e prioridade de cada atestado
        const processedList = rawAtestadosData.map(item => {
            const inicio = item.dataInicio || '';
            const fim = item.dataFim || '';

            let statusKey = 'ativa';
            let statusLabel = 'Ativo';
            let priority = 1;

            if (fim && fim < hojeStr) {
                statusKey = 'encerrada';
                statusLabel = 'Encerrado';
                priority = 3;
            } else if (inicio && inicio > hojeStr) {
                statusKey = 'futura';
                statusLabel = 'Futuro';
                priority = 2;
            } else {
                statusKey = 'ativa';
                statusLabel = 'Ativo';
                priority = 1;
            }

            return {
                ...item,
                _statusKey: statusKey,
                _statusLabel: statusLabel,
                _priority: priority
            };
        });

        // 2. Filtrar por Busca (nome do músico, CID ou resumo)
        let filtered = processedList.filter(item => {
            if (!searchVal) return true;
            const nome = (item.nomeMusico || '').toLowerCase();
            const cid = (item.cid || '').toLowerCase();
            const resumo = (item.resumo || '').toLowerCase();
            return nome.includes(searchVal) || cid.includes(searchVal) || resumo.includes(searchVal);
        });

        // 3. Filtrar por Chip de Status
        if (currentAtestadoFilter !== 'todas') {
            filtered = filtered.filter(item => item._statusKey === currentAtestadoFilter);
        }

        // 4. Ordenar: Ativos (1) -> Futuros (2) -> Encerrados (3)
        // Dentro do mesmo status: por dataInicio decrescente ou createdAt decrescente
        filtered.sort((a, b) => {
            if (a._priority !== b._priority) {
                return a._priority - b._priority;
            }
            const dateA = a.dataInicio || a.createdAt || '';
            const dateB = b.dataInicio || b.createdAt || '';
            return dateB.localeCompare(dateA);
        });

        // Atualizar subtítulo com estatísticas
        const ativosHojeCount = processedList.filter(i => i._statusKey === 'ativa').length;
        if (subtitleEl) {
            subtitleEl.textContent = `${ativosHojeCount} atestado(s) ativo(s) hoje • Total de ${processedList.length} registro(s)`;
        }

        // 5. Se estiver vazio
        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2.5rem 1rem;">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
                            <div style="width: 48px; height: 48px; background: #eff6ff; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="file-search" style="width: 22px; height: 22px; color: #3b82f6;"></i>
                            </div>
                            <p style="margin: 0; font-size: 0.9rem; font-weight: 600; color: #475569;">Nenhum atestado homologado encontrado</p>
                            <p style="margin: 0; font-size: 0.78rem; color: #94a3b8;">${searchVal ? 'Tente alterar os termos da busca ou o filtro de status.' : 'Nenhum atestado homologado cadastrado até o momento.'}</p>
                        </div>
                    </td>
                </tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // 6. Renderizar linhas
        tableBody.innerHTML = '';
        const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';

        filtered.forEach(data => {
            const id = data.id;
            const isEncerrada = data._statusKey === 'encerrada';
            const isAtiva = data._statusKey === 'ativa';
            const isFutura = data._statusKey === 'futura';

            const tr = document.createElement('tr');

            if (isEncerrada) {
                tr.style.cssText = 'background: #f8fafc; border-bottom: 1px solid #e2e8f0; opacity: 0.78; transition: background 0.15s ease, opacity 0.15s ease; cursor: pointer;';
                tr.addEventListener('mouseenter', () => { tr.style.background = '#f1f5f9'; tr.style.opacity = '1'; });
                tr.addEventListener('mouseleave', () => { tr.style.background = '#f8fafc'; tr.style.opacity = '0.78'; });
            } else {
                tr.style.cssText = 'background: white; border-bottom: 1px solid #dbeafe; transition: background 0.15s ease; cursor: pointer;';
                tr.addEventListener('mouseenter', () => tr.style.background = '#f0f7ff');
                tr.addEventListener('mouseleave', () => tr.style.background = 'white');
            }

            const dataInicioFmt = formatBR(data.dataInicio);
            const dataFimFmt = formatBR(data.dataFim);
            const dataCriacaoFmt = data.createdAt ? new Date(data.createdAt).toLocaleDateString('pt-BR') : '---';

            // Badge de Status
            let statusBadgeHtml = '';
            if (isAtiva) {
                statusBadgeHtml = `<span style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 0.25rem 0.65rem; border-radius: 12px; font-weight: 600; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.3rem;"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Ativo</span>`;
            } else if (isFutura) {
                statusBadgeHtml = `<span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 0.25rem 0.65rem; border-radius: 12px; font-weight: 600; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.3rem;"><i data-lucide="calendar" style="width: 12px; height: 12px;"></i> Futuro</span>`;
            } else {
                statusBadgeHtml = `<span style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; padding: 0.25rem 0.65rem; border-radius: 12px; font-weight: 600; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.3rem;"><i data-lucide="clock" style="width: 12px; height: 12px;"></i> Encerrado</span>`;
            }

            // Estilos do Avatar e Nome
            const avatarBg = isEncerrada ? '#cbd5e1' : 'linear-gradient(135deg, #dbeafe, #bfdbfe)';
            const avatarColor = isEncerrada ? '#475569' : '#1d4ed8';
            const nomeColor = isEncerrada ? '#64748b' : '#1d4ed8';

            // Estilos da Badge Período
            const periodoBg = isEncerrada ? '#e2e8f0' : '#eff6ff';
            const periodoColor = isEncerrada ? '#475569' : '#1d4ed8';

            // Texto Resumo / CID
            const cidText = data.cid ? `<strong>${data.cid}</strong>` : '';
            const resumoText = data.resumo || '';
            const combinedText = cidText && resumoText ? `${cidText} • ${resumoText}` : (cidText || resumoText || '—');

            tr.innerHTML = `
                <td style="padding: 0.85rem 1.1rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 32px; height: 32px; background: ${avatarBg}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.75rem; font-weight: 700; color: ${avatarColor};">${(data.nomeMusico || 'M').charAt(0).toUpperCase()}</div>
                        <span class="btn-view-atestado-detail" data-id="${id}" style="font-weight: 600; color: ${nomeColor}; font-size: 0.875rem; text-decoration: underline; text-underline-offset: 2px;" title="Clique para ver os detalhes do atestado">${data.nomeMusico || 'Músico'}</span>
                    </div>
                </td>
                <td style="padding: 0.85rem 1.1rem;">
                    <span style="background: ${periodoBg}; color: ${periodoColor}; padding: 0.3rem 0.75rem; border-radius: 20px; font-weight: 600; font-size: 0.78rem; white-space: nowrap; border: 1px solid ${isEncerrada ? '#cbd5e1' : '#bfdbfe'};">
                        ${dataInicioFmt} → ${dataFimFmt} <span style="font-size: 0.7rem; opacity: 0.85;">(${data.dias || 1}d)</span>
                    </span>
                </td>
                <td style="padding: 0.85rem 1.1rem;">
                    ${statusBadgeHtml}
                </td>
                <td style="padding: 0.85rem 1.1rem; color: ${isEncerrada ? '#64748b' : '#334155'}; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${data.cid ? 'CID: ' + data.cid + ' - ' : ''}${data.resumo || ''}">${combinedText}</td>
                <td style="padding: 0.85rem 1.1rem; color: #94a3b8; font-size: 0.82rem; white-space: nowrap;">${dataCriacaoFmt}</td>
                <td style="padding: 0.85rem 1.1rem; text-align: right;">
                    <button class="btn-view-atestado-detail-btn" data-id="${id}" 
                        style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; cursor: pointer; padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; transition: all 0.15s ease;"
                        onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#93c5fd';"
                        onmouseout="this.style.background='#eff6ff'; this.style.borderColor='#bfdbfe';"
                        title="Ver Detalhes do Atestado">
                        <i data-lucide="eye" style="width: 13px; height: 13px;"></i> Ver Detalhes
                    </button>
                </td>
            `;
            tr._atestadoData = data;
            tr._atestadoId = id;
            tableBody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();

        // Event listeners para abrir modal de detalhe
        tableBody.querySelectorAll('tr').forEach(tr => {
            tr.addEventListener('click', () => {
                if (tr._atestadoData) {
                    openAtestadoDetalheModal(tr._atestadoData);
                }
            });
        });
    }

    // Modal de Detalhe e Edição do Atestado
    function openAtestadoDetalheModal(data) {
        if (!modalDetalhe) return;
        currentAtestadoDetalheData = data;

        // Reset para Modo Visualização
        switchAtestadoModalMode('view');

        const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
        const dias = data.dias || 1;

        const elemAvatar = document.getElementById('atestado-detalhe-avatar');
        const elemMusico = document.getElementById('atestado-detalhe-musico');
        const elemInstrumento = document.getElementById('atestado-detalhe-instrumento');
        const elemPeriodo = document.getElementById('atestado-detalhe-periodo');
        const elemDuracao = document.getElementById('atestado-detalhe-duracao');
        const elemCid = document.getElementById('atestado-detalhe-cid');
        const elemResumo = document.getElementById('atestado-detalhe-resumo');
        const elemCriadoEm = document.getElementById('atestado-detalhe-criadoem');
        const elemCriadoPor = document.getElementById('atestado-detalhe-criadopor');

        const instrumento = data.instrumento || (typeof window.getMusicianInstrumentInfo === 'function' ? window.getMusicianInstrumentInfo(data.musicianId, data.nomeMusico) : '') || '—';

        if (elemAvatar) elemAvatar.textContent = (data.nomeMusico || 'M').charAt(0).toUpperCase();
        if (elemMusico) elemMusico.textContent = data.nomeMusico || 'Músico';
        if (elemInstrumento) elemInstrumento.textContent = instrumento;
        if (elemPeriodo) elemPeriodo.textContent = `${formatBR(data.dataInicio)} → ${formatBR(data.dataFim)}`;
        if (elemDuracao) elemDuracao.textContent = `${dias} dia${dias !== 1 ? 's' : ''}`;
        if (elemCid) elemCid.textContent = data.cid || 'Não informado';
        if (elemResumo) elemResumo.textContent = data.resumo || 'Nenhum parecer médico informado.';
        if (elemCriadoEm) elemCriadoEm.textContent = data.createdAt ? new Date(data.createdAt).toLocaleDateString('pt-BR') + ' às ' + new Date(data.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---';
        if (elemCriadoPor) elemCriadoPor.textContent = data.criadoPor || 'admin';

        modalDetalhe.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (window.lucide) lucide.createIcons();
    }

    function switchAtestadoModalMode(mode) {
        if (mode === 'edit') {
            if (viewModeDiv) viewModeDiv.style.display = 'none';
            if (editModeDiv) editModeDiv.style.display = 'flex';
            if (viewActionsDiv) viewActionsDiv.style.display = 'none';
            if (editActionsDiv) editActionsDiv.style.display = 'flex';
        } else {
            if (viewModeDiv) viewModeDiv.style.display = 'flex';
            if (editModeDiv) editModeDiv.style.display = 'none';
            if (viewActionsDiv) viewActionsDiv.style.display = 'flex';
            if (editActionsDiv) editActionsDiv.style.display = 'none';
        }
    }

    function closeAtestadoDetalheModal() {
        if (modalDetalhe) {
            modalDetalhe.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    if (btnCloseDetalhe) btnCloseDetalhe.addEventListener('click', closeAtestadoDetalheModal);
    if (btnCloseDetalheFooter) btnCloseDetalheFooter.addEventListener('click', closeAtestadoDetalheModal);
    if (modalDetalhe) {
        modalDetalhe.addEventListener('click', (e) => {
            if (e.target === modalDetalhe) closeAtestadoDetalheModal();
        });
    }

    if (btnEditDetalhe) {
        btnEditDetalhe.addEventListener('click', () => {
            if (!currentAtestadoDetalheData) return;
            const musicoHeader = document.getElementById('edit-atestado-musico-nome');
            if (musicoHeader) musicoHeader.textContent = `Editar Atestado de ${currentAtestadoDetalheData.nomeMusico || 'Músico'}`;

            if (inputEditInicio) inputEditInicio.value = currentAtestadoDetalheData.dataInicio || '';
            if (inputEditDias) inputEditDias.value = currentAtestadoDetalheData.dias || 1;
            if (inputEditCid) inputEditCid.value = currentAtestadoDetalheData.cid || '';
            if (inputEditResumo) inputEditResumo.value = currentAtestadoDetalheData.resumo || '';

            switchAtestadoModalMode('edit');
            if (window.lucide) lucide.createIcons();
        });
    }

    if (btnCancelEditAtestado) {
        btnCancelEditAtestado.addEventListener('click', () => {
            switchAtestadoModalMode('view');
        });
    }

    // Helper local para obter array de datas ISO YYYY-MM-DD
    function getDateRangeArray(start, end) {
        const result = [];
        if (!start || !end) return result;
        let cur = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T00:00:00');
        while (cur <= endDate) {
            result.push(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }
        return result;
    }

    // Helper para calcular data final com base na data inicio e dias
    function calcEndDateISO(startISO, daysCount) {
        if (!startISO || !daysCount) return startISO;
        const d = new Date(startISO + 'T00:00:00');
        d.setDate(d.getDate() + (parseInt(daysCount) - 1));
        return d.toISOString().split('T')[0];
    }

    // Salvar Edição do Atestado Homologado
    if (btnSaveEditAtestado) {
        btnSaveEditAtestado.addEventListener('click', async () => {
            if (!currentAtestadoDetalheData || !currentAtestadoDetalheData.id) return;

            const newInicio = inputEditInicio ? inputEditInicio.value : '';
            const newDias = inputEditDias ? parseInt(inputEditDias.value) : 0;
            const newCid = inputEditCid ? inputEditCid.value.trim() : '';
            const newResumo = inputEditResumo ? inputEditResumo.value.trim() : '';

            if (!newInicio) {
                showNotification('Por favor, informe a Data Inicial.', 'error');
                return;
            }
            if (!newDias || newDias < 1) {
                showNotification('Por favor, informe uma quantidade válida de dias (mínimo 1).', 'error');
                return;
            }

            const atestadoId = currentAtestadoDetalheData.id;
            const musicianId = currentAtestadoDetalheData.musicianId;
            const newEnd = calcEndDateISO(newInicio, newDias);

            try {
                btnSaveEditAtestado.disabled = true;
                btnSaveEditAtestado.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Salvando...';
                if (window.lucide) lucide.createIcons();

                const oldDates = getDateRangeArray(currentAtestadoDetalheData.dataInicio, currentAtestadoDetalheData.dataFim);
                const newDates = getDateRangeArray(newInicio, newEnd);

                const removedDates = oldDates.filter(d => !newDates.includes(d));

                // 1. Remover atestado das datas desmarcadas na presencas
                for (const date of removedDates) {
                    const presenceRef = doc(db, "presencas", date);
                    const snap = await getDoc(presenceRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const registros = data.registros || {};
                        if (registros[musicianId] && registros[musicianId].status === 'atestado') {
                            delete registros[musicianId];
                            await updateDoc(presenceRef, {
                                registros: registros,
                                ultimaAtualizacao: new Date().toISOString(),
                                usuarioResponsavel: auth.currentUser.email || 'admin'
                            });
                        }
                    }
                }

                // 2. Atualizar ou criar atestado nas novas datas
                for (const date of newDates) {
                    const presenceRef = doc(db, "presencas", date);
                    const snap = await getDoc(presenceRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const registros = data.registros || {};
                        registros[musicianId] = {
                            status: 'atestado',
                            minutes: 0
                        };
                        await updateDoc(presenceRef, {
                            registros: registros,
                            ultimaAtualizacao: new Date().toISOString(),
                            usuarioResponsavel: auth.currentUser.email || 'admin'
                        });
                    }
                }

                // 3. Atualizar o documento no Firestore
                const updatedFields = {
                    dataInicio: newInicio,
                    dias: newDias,
                    dataFim: newEnd,
                    cid: newCid,
                    resumo: newResumo,
                    editadoEm: new Date().toISOString(),
                    editadoPor: auth.currentUser.email || 'admin'
                };

                await updateDoc(doc(db, "medicalCertificates_approved", atestadoId), updatedFields);

                // 4. Registrar Log de Auditoria
                try {
                    const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
                    const details = `Músico: ${currentAtestadoDetalheData.nomeMusico}\nPeríodo Anterior: ${formatBR(currentAtestadoDetalheData.dataInicio)} a ${formatBR(currentAtestadoDetalheData.dataFim)} (${currentAtestadoDetalheData.dias} dias)\nNovo Período: ${formatBR(newInicio)} a ${formatBR(newEnd)} (${newDias} dias)\nCID: ${newCid}\nResumo: ${newResumo}`;
                    await saveLog("atestado", `Atestado homologado editado: ${currentAtestadoDetalheData.nomeMusico}`, null, details);
                } catch(lErr) {}

                showNotification('Atestado editado com sucesso e presenças atualizadas!', 'success');
                closeAtestadoDetalheModal();
                loadAtestadosHomologadosTable();

            } catch (err) {
                console.error("Erro ao salvar edição do atestado:", err);
                showNotification(`Erro ao salvar alteração: ${err.message}`, 'error');
            } finally {
                btnSaveEditAtestado.disabled = false;
                btnSaveEditAtestado.innerHTML = '<i data-lucide="check"></i> Salvar Alterações';
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    // Excluir Atestado Homologado
    if (btnDeleteDetalhe) {
        btnDeleteDetalhe.addEventListener('click', async () => {
            if (!currentAtestadoDetalheData || !currentAtestadoDetalheData.id) return;

            const nomeMusico = currentAtestadoDetalheData.nomeMusico || 'Músico';
            if (!confirm(`Deseja realmente cancelar/excluir o atestado homologado de "${nomeMusico}"?\n\nEsta ação removerá a marcação de atestado da lista de presença do período.`)) {
                return;
            }

            const atestadoId = currentAtestadoDetalheData.id;
            const musicianId = currentAtestadoDetalheData.musicianId;

            try {
                btnDeleteDetalhe.disabled = true;
                btnDeleteDetalhe.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Excluindo...';
                if (window.lucide) lucide.createIcons();

                // 1. Remover marcação de atestado das presencas do período
                const dates = getDateRangeArray(currentAtestadoDetalheData.dataInicio, currentAtestadoDetalheData.dataFim);
                for (const date of dates) {
                    const presenceRef = doc(db, "presencas", date);
                    const snap = await getDoc(presenceRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const registros = data.registros || {};
                        if (registros[musicianId] && registros[musicianId].status === 'atestado') {
                            delete registros[musicianId];
                            await updateDoc(presenceRef, {
                                registros: registros,
                                ultimaAtualizacao: new Date().toISOString(),
                                usuarioResponsavel: auth.currentUser.email || 'admin'
                            });
                        }
                    }
                }

                // 2. Apagar documento de medicalCertificates_approved
                await deleteDoc(doc(db, "medicalCertificates_approved", atestadoId));

                // 3. Log de Auditoria
                try {
                    await saveLog("atestado", `Atestado homologado excluído/cancelado: ${nomeMusico}`, null, `ID: ${atestadoId}`);
                } catch(lErr) {}

                showNotification('Atestado homologado excluído com sucesso.', 'info');
                closeAtestadoDetalheModal();
                loadAtestadosHomologadosTable();

            } catch (err) {
                console.error("Erro ao excluir atestado homologado:", err);
                showNotification(`Erro ao excluir atestado: ${err.message}`, 'error');
            } finally {
                btnDeleteDetalhe.disabled = false;
                btnDeleteDetalhe.innerHTML = '<i data-lucide="trash-2"></i> Excluir';
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    if (btnCopyDetalhe) {
        btnCopyDetalhe.addEventListener('click', () => {
            if (!currentAtestadoDetalheData) return;
            const formatBR = (iso) => iso ? iso.split('-').reverse().join('/') : '---';
            const dias = currentAtestadoDetalheData.dias || 1;

            const instrumento = currentAtestadoDetalheData.instrumento || (typeof window.getMusicianInstrumentInfo === 'function' ? window.getMusicianInstrumentInfo(currentAtestadoDetalheData.musicianId, currentAtestadoDetalheData.nomeMusico) : '') || '—';

            const texto = `ATESTADO MÉDICO HOMOLOGADO — OER
Músico: ${currentAtestadoDetalheData.nomeMusico || 'Músico'}
Instrumento: ${instrumento}
Período: ${formatBR(currentAtestadoDetalheData.dataInicio)} até ${formatBR(currentAtestadoDetalheData.dataFim)} (${dias} dia${dias !== 1 ? 's' : ''})
Código CID: ${currentAtestadoDetalheData.cid || 'Não informado'}
Parecer / Resumo: ${currentAtestadoDetalheData.resumo || '-'}
Homologado por: ${currentAtestadoDetalheData.criadoPor || 'admin'}`;

            navigator.clipboard.writeText(texto).then(() => {
                showNotification('Resumo do atestado copiado com sucesso!', 'success');
            }).catch(() => {
                showNotification('Erro ao copiar resumo.', 'error');
            });
        });
    }

    loadAtestadosHomologadosTable();
}

// ================= CRONÔMETRO DO INTERVALO =================
function initIntervalTimerControls() {
    const btnStart = document.getElementById('btn-interval-start');
    const btnStop = document.getElementById('btn-interval-stop');
    const durationInput = document.getElementById('interval-duration-input');
    const statusBadge = document.getElementById('interval-status-badge');
    const infoBanner = document.getElementById('interval-admin-info');
    const startTimeElem = document.getElementById('interval-start-time');
    const endTimeElem = document.getElementById('interval-end-time');

    if (!btnStart || !btnStop) return;

    const intervalRef = doc(db, 'config', 'intervalo');
    if (unsubscribeIntervalTimer) unsubscribeIntervalTimer();

    const resetUIInactive = () => {
        if (statusBadge) {
            statusBadge.className = 'admin-interval-badge';
            statusBadge.innerHTML = '<i data-lucide="circle" style="width: 8px; height: 8px; fill: currentColor;"></i> Inativo';
        }
        btnStart.style.display = 'inline-flex';
        btnStop.style.display = 'none';
        if (infoBanner) infoBanner.style.display = 'none';
        if (window.lucide) lucide.createIcons();
    };

    unsubscribeIntervalTimer = onSnapshot(intervalRef, (docSnap) => {
        if (adminIntervalTicker) {
            clearInterval(adminIntervalTicker);
            adminIntervalTicker = null;
        }

        if (docSnap.exists()) {
            const data = docSnap.data();
            const now = new Date();
            const end = data.endTime ? (data.endTime.toDate ? data.endTime.toDate() : new Date(data.endTime)) : null;

            if (data.active === true && end && end > now) {
                if (statusBadge) {
                    statusBadge.className = 'admin-interval-badge active';
                    statusBadge.innerHTML = '<i data-lucide="check-circle" style="width: 8px; height: 8px; fill: currentColor;"></i> Ativo';
                }
                btnStart.style.display = 'none';
                btnStop.style.display = 'inline-flex';

                const start = data.startedAt ? (data.startedAt.toDate ? data.startedAt.toDate() : new Date(data.startedAt)) : null;
                if (startTimeElem && start) {
                    startTimeElem.textContent = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                if (endTimeElem && end) {
                    endTimeElem.textContent = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
                if (infoBanner) infoBanner.style.display = 'block';

                // Ticker em tempo real no Admin para expirar imediatamente ao zerar
                adminIntervalTicker = setInterval(() => {
                    const currentNow = new Date();
                    if (currentNow >= end) {
                        if (adminIntervalTicker) {
                            clearInterval(adminIntervalTicker);
                            adminIntervalTicker = null;
                        }
                        resetUIInactive();
                        // Desativa no Firestore para sincronizar com todos os clientes
                        setDoc(intervalRef, {
                            active: false,
                            updatedAt: serverTimestamp()
                        }, { merge: true }).catch(err => console.error("Erro ao auto-desativar intervalo expirado:", err));
                    }
                }, 1000);

            } else {
                resetUIInactive();
            }
        } else {
            resetUIInactive();
        }
        if (window.lucide) lucide.createIcons();
    }, (error) => {
        console.error("Erro ao escutar estado do intervalo:", error);
    });

    btnStart.onclick = async () => {
        try {
            const minutes = parseInt(durationInput ? durationInput.value : 25) || 25;
            const now = new Date();
            const endTime = new Date(now.getTime() + minutes * 60 * 1000);

            btnStart.disabled = true;

            // Debug: verificar usuário e claims antes de escrever
            const currentUser = auth.currentUser;
            if (!currentUser) {
                showNotification('Sessão expirada. Faça login novamente.', 'error');
                return;
            }
            const idTokenResult = await currentUser.getIdTokenResult(true);
            console.log('[Intervalo] Email:', currentUser.email);
            console.log('[Intervalo] Claims:', JSON.stringify(idTokenResult.claims));
            console.log('[Intervalo] Admin claim:', idTokenResult.claims.admin);

            await setDoc(doc(db, 'config', 'intervalo'), {
                active: true,
                durationMinutes: minutes,
                startedAt: Timestamp.fromDate(now),
                endTime: Timestamp.fromDate(endTime),
                updatedAt: serverTimestamp()
            }, { merge: true });

            showNotification(`Cronômetro de ${minutes} minutos iniciado com sucesso!`, 'success');
        } catch (error) {
            console.error('[Intervalo] Erro ao iniciar:', error);
            showNotification(`Erro ao iniciar cronômetro: ${error.code || error.message}`, 'error');
        } finally {
            btnStart.disabled = false;
        }
    };

    btnStop.onclick = async () => {
        try {
            if (adminIntervalTicker) {
                clearInterval(adminIntervalTicker);
                adminIntervalTicker = null;
            }
            btnStop.disabled = true;
            await setDoc(doc(db, 'config', 'intervalo'), {
                active: false,
                updatedAt: serverTimestamp()
            }, { merge: true });

            showNotification("Cronômetro do intervalo parado.", "info");
        } catch (error) {
            console.error("Erro ao parar intervalo:", error);
            showNotification("Erro ao parar cronômetro do intervalo.", "error");
        } finally {
            btnStop.disabled = false;
        }
    };
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
                if (data.tipo === 'folga') tipoLabel = 'Folga';

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

    // Cards estatísticos clicáveis para cópia
    const cardTotal = document.getElementById('card-total-musicos');
    const cardBolsistas = document.getElementById('card-bolsistas');
    const cardMonitores = document.getElementById('card-monitores');
    const cardRestricoes = document.getElementById('card-restricoes');

    const copiarEmailsFiltrados = (filtroFn, tipoNome) => {
        if (!allMusicians || allMusicians.length === 0) {
            showNotification("Nenhum músico disponível para obter e-mails.", "warning");
            return;
        }

        const filtered = allMusicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            return filtroFn(m);
        });

        const rawEmails = [];
        filtered.forEach(m => {
            const raw = (m.EMAIL || '').toString().trim();
            if (raw && raw !== '' && raw !== '-') {
                raw.split(/[;,]/).forEach(e => {
                    const trimmed = e.trim();
                    if (trimmed && trimmed.includes('@')) {
                        rawEmails.push(trimmed);
                    }
                });
            }
        });

        const uniqueEmails = [...new Set(rawEmails)];

        if (uniqueEmails.length === 0) {
            showNotification(`Nenhum e-mail válido encontrado para ${tipoNome}.`, "warning");
            return;
        }

        const emailString = uniqueEmails.join('; ');

        navigator.clipboard.writeText(emailString)
            .then(() => {
                showNotification(`${uniqueEmails.length} e-mails de ${tipoNome} copiados!`, "success");
            })
            .catch(err => {
                console.error("Erro ao copiar e-mails:", err);
                showNotification("Não foi possível copiar os e-mails automaticamente.", "error");
            });
    };

    const copiarRestricoesAlimentares = () => {
        if (!allMusicians || allMusicians.length === 0) {
            showNotification("Nenhum músico disponível para consultar restrições.", "warning");
            return;
        }

        const filtered = allMusicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            const r = (m['Restrição Alimentar'] || m['Restrição Alimentar '] || '').toString().toLowerCase().trim();
            if (r === "" || r === "-" || r === "não" || r === "não se aplica" || r.includes("sem restriç") || r.includes("sem restric") || r.includes("não possui") || r.includes("nao possui")) {
                return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            showNotification("Nenhuma restrição alimentar encontrada entre os músicos ativos.", "warning");
            return;
        }

        // Agrupar por restrição alimentar normalizada mantendo capitalização adequada
        const grupos = {};
        filtered.forEach(m => {
            let r = (m['Restrição Alimentar'] || m['Restrição Alimentar '] || '').toString().trim();
            if (r.length > 0) {
                r = r.charAt(0).toUpperCase() + r.slice(1);
            }
            const nome = (m['NOME REGISTRO'] || m['NOME REGISTRO '] || m.NOME || m.Nome || m.NOMEARTISTICO || 'Músico').toString().trim();
            
            if (!grupos[r]) {
                grupos[r] = [];
            }
            grupos[r].push(nome);
        });

        // Ordenar as restrições alfabeticamente
        const restricoesOrdenadas = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        // Ordenar os nomes dentro de cada grupo alfabeticamente
        restricoesOrdenadas.forEach(r => {
            grupos[r].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        });

        // Montar a seção de resumo
        const resumoLinhas = restricoesOrdenadas.map(r => `• ${r}: ${grupos[r].length}`);

        // Montar o detalhamento
        const detalhamentoLinhas = [];
        restricoesOrdenadas.forEach(r => {
            detalhamentoLinhas.push(`[${r}]`);
            grupos[r].forEach(nome => {
                detalhamentoLinhas.push(`• ${nome}`);
            });
            detalhamentoLinhas.push(''); // linha em branco entre grupos
        });

        const totalPessoas = filtered.length;
        const textoFinal = `Restrições Alimentares (Total: ${totalPessoas})\n\n📊 Resumo:\n${resumoLinhas.join('\n')}\n\n📋 Detalhamento:\n${detalhamentoLinhas.join('\n').trim()}`;

        navigator.clipboard.writeText(textoFinal)
            .then(() => {
                showNotification(`${totalPessoas} restrições alimentares copiadas e agrupadas!`, "success");
            })
            .catch(err => {
                console.error("Erro ao copiar restrições alimentares:", err);
                showNotification("Não foi possível copiar as restrições automaticamente.", "error");
            });
    };

    if (cardTotal) {
        cardTotal.addEventListener('click', () => {
            copiarEmailsFiltrados(m => {
                const status = (m.Status || '').toString().toLowerCase();
                return status.includes('bolsista') || status.includes('monitor');
            }, "Músicos da OER");
        });
    }

    if (cardBolsistas) {
        cardBolsistas.addEventListener('click', () => {
            copiarEmailsFiltrados(m => {
                return (m.Status || '').toString().toLowerCase().includes('bolsista');
            }, "Bolsistas");
        });
    }

    if (cardMonitores) {
        cardMonitores.addEventListener('click', () => {
            copiarEmailsFiltrados(m => {
                return (m.Status || '').toString().toLowerCase().includes('monitor');
            }, "Monitores");
        });
    }

    if (cardRestricoes) {
        cardRestricoes.addEventListener('click', copiarRestricoesAlimentares);
    }

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

    // Função utilitária para tratar e segmentar múltiplos telefones de forma inteligente
    const parseTelefones = (telefoneStr) => {
        if (!telefoneStr || telefoneStr === '-') return [];
        // Garantir que o valor é tratado como string (pode vir como número do Firestore)
        const str = String(telefoneStr).trim();
        if (!str) return [];
        
        let lines = [];
        if (str.includes('\n')) {
            lines = str.split('\n');
        } else {
            lines = [str];
        }
        
        let parts = [];
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            
            if (line.includes('/')) {
                parts.push(...line.split('/'));
            } else if (line.includes(';')) {
                parts.push(...line.split(';'));
            } else {
                parts.push(line);
            }
        }
        
        const result = [];
        let accumulatedLabel = '';
        
        for (let part of parts) {
            part = part.trim();
            if (!part) continue;
            
            const cleanDigits = part.replace(/[^\d]/g, '');
            
            if (cleanDigits.length >= 8) {
                const phoneMatch = part.match(/(?:(?:\+?55\s*)?\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
                if (phoneMatch) {
                    const number = phoneMatch[0];
                    let inlineLabel = part.replace(number, '').replace(/[:\-\/]/g, '').trim();
                    
                    let finalLabel = '';
                    if (accumulatedLabel) {
                        finalLabel = accumulatedLabel;
                        if (inlineLabel) {
                            finalLabel += ` (${inlineLabel})`;
                        }
                        accumulatedLabel = '';
                    } else {
                        finalLabel = inlineLabel || 'Telefone';
                    }
                    
                    result.push({
                        display: part,
                        label: finalLabel,
                        number: number,
                        whatsappLink: obterLinkWhatsapp(number)
                    });
                } else {
                    result.push({
                        display: part,
                        label: accumulatedLabel || 'Telefone',
                        number: part,
                        whatsappLink: obterLinkWhatsapp(part)
                    });
                    accumulatedLabel = '';
                }
            } else {
                if (accumulatedLabel) {
                    accumulatedLabel += ' - ' + part;
                } else {
                    accumulatedLabel = part;
                }
            }
        }
        
        return result;
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
                allMusicians.push({ id: docSnap.id, ...data });
            });

            // Atualizar Estatísticas
            updateStats(allMusicians);
            
            // Renderizar a tabela (apenas os músicos ativos na visualização do painel)
            const ativosParaTabela = allMusicians.filter(m => m.statusFirebase !== "inativo" && m.statusFirebase !== "desligado");
            renderMusiciansTable(ativosParaTabela);
        }, (error) => {
            console.error("Erro ao escutar coleção de músicos:", error);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #dc3545; padding: 2rem;">Erro ao carregar músicos: ${error.message}</td></tr>`;
        });
    }

    // 2. Função para atualizar os cards estatísticos
    function updateStats(musicians) {
        if (!statTotal) return;
        
        // Contabiliza somente bolsistas e monitores ativos
        const validMusicians = musicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            const status = (m.Status || '').toString().toLowerCase();
            return status.includes('bolsista') || status.includes('monitor');
        });
        statTotal.textContent = validMusicians.length;
        
        const bolsistas = musicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            const status = (m.Status || '').toString().toLowerCase();
            return status.includes('bolsista');
        }).length;
        statBolsistas.textContent = bolsistas;
        
        const monitores = musicians.filter(m => {
            if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
            return (m.Status || '').toString().toLowerCase().includes('monitor');
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
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="padding: 2.5rem; text-align: center; color: #888;">Nenhum músico cadastrado ou ativo. Importe uma planilha para começar.</td></tr>`;
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
            const statusLower = (musico.Status || '').toString().toLowerCase();
            if (statusLower.includes('bolsista')) badgeClass = 'bolsista';
            else if (statusLower.includes('monitor')) badgeClass = 'monitor';
            else if (statusLower.includes('reg.titular') || statusLower.includes('titular')) badgeClass = 'reg-titular';
            else if (statusLower.includes('extra')) badgeClass = 'musico-extra';
            else if (statusLower.includes('desligado')) badgeClass = 'desligado';
            const telefones = parseTelefones(musico.TELEFONE);
            let telefoneHtml = '';
            if (telefones.length > 0) {
                telefoneHtml = `<div class="phone-list-container" style="display: flex; flex-direction: column; gap: 0.25rem;">`;
                telefones.forEach(t => {
                    telefoneHtml += `
                        <div class="phone-column-container" style="display: flex; align-items: center; gap: 0.4rem;">
                            <span class="phone-number-text" title="${t.label !== 'Telefone' ? t.label : ''}">${t.display}</span>
                            ${t.whatsappLink ? `
                            <a href="${t.whatsappLink}" target="_blank" class="whatsapp-quick-link" title="Chamar no WhatsApp (${t.label})" onclick="event.stopPropagation();">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style="fill: currentColor; width: 14px; height: 14px;">
                                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                                </svg>
                            </a>
                            ` : ''}
                        </div>
                    `;
                });
                telefoneHtml += `</div>`;
            } else {
                telefoneHtml = '-';
            }

            // Gerar múltiplos botões de WhatsApp lado a lado na nova coluna dedicada para desktop
            let whatsappHtml = '';
            const whatsappsValidos = telefones.filter(t => t.whatsappLink);
            if (whatsappsValidos.length > 0) {
                whatsappHtml = `<div class="whatsapp-col-container">`;
                whatsappsValidos.forEach((t, idx) => {
                    const labelStr = t.label && t.label !== 'Telefone' ? t.label : `Whats ${whatsappsValidos.length > 1 ? idx + 1 : ''}`;
                    whatsappHtml += `
                        <a href="${t.whatsappLink}" target="_blank" class="btn-whatsapp-col" title="Chamar no WhatsApp (${t.label})" onclick="event.stopPropagation();">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
                                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                            </svg>
                            <span>${labelStr}</span>
                        </a>
                    `;
                });
                whatsappHtml += `</div>`;
            } else {
                whatsappHtml = '-';
            }

            tr.innerHTML = `
                <td style="padding: 1rem 1.2rem; font-weight: 600; color: #333;">${musico.NOMEARTISTICO || '-'}</td>
                <td style="padding: 1rem 1.2rem; color: #495057;">${musico.INSTRUMENTOS || '-'}</td>
                <td style="padding: 1rem 1.2rem;"><span class="field-value badge ${badgeClass}">${musico.Status || '-'}</span></td>
                <td style="padding: 1rem 1.2rem; color: #666; font-size: 0.9rem;">${telefoneHtml}</td>
                <td style="padding: 1rem 1.2rem; color: #666; font-size: 0.9rem;">${whatsappHtml}</td>
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
            
            const ativosParaTabela = allMusicians.filter(m => m.statusFirebase !== "inativo" && m.statusFirebase !== "desligado");

            if (queryText === "") {
                renderMusiciansTable(ativosParaTabela);
                return;
            }

            // Dividir a busca em termos individuais separados por espaço
            const searchTerms = queryText.split(/\s+/).filter(term => term !== "");

            // 1. Filtrar músicos: todos os termos digitados devem ser encontrados em pelo menos um campo do músico (AND lógico)
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
                ].map(field => field ? field.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "");

                return searchTerms.every(term => {
                    return searchFields.some(field => field.includes(term));
                });
            });

            // 2. Calcular pontuação (score) de relevância para cada músico filtrado
            const scored = filtered.map(musico => {
                let score = 0;

                const nomeArtistico = (musico.NOMEARTISTICO || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const nomeRegistro = (musico['NOME REGISTRO'] || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const instrumento = (musico.INSTRUMENTOS || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const status = (musico.Status || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const email = (musico.EMAIL || "").toString().toLowerCase();
                const telefone = (musico.TELEFONE || "").toString().toLowerCase();
                const cpf = (musico.CPF || "").toString().toLowerCase();

                searchTerms.forEach(term => {
                    // Nome Artístico (Relevância máxima)
                    if (nomeArtistico === term) {
                        score += 1000;
                    } else if (nomeArtistico.startsWith(term)) {
                        score += 500;
                    } else if (nomeArtistico.includes(term)) {
                        score += 200;
                    }

                    // Nome de Registro (Relevância alta)
                    if (nomeRegistro === term) {
                        score += 800;
                    } else if (nomeRegistro.startsWith(term)) {
                        score += 400;
                    } else if (nomeRegistro.includes(term)) {
                        score += 150;
                    }

                    // Instrumento (Relevância moderada)
                    if (instrumento === term) {
                        score += 100;
                    } else if (instrumento.includes(term)) {
                        score += 50;
                    }

                    // Status (Relevância menor)
                    if (status === term) {
                        score += 80;
                    } else if (status.includes(term)) {
                        score += 30;
                    }

                    // Demais dados (e-mail, telefone, CPF)
                    if (email.includes(term)) score += 20;
                    if (telefone.includes(term)) score += 20;
                    if (cpf.includes(term)) score += 20;
                });

                return { musico, score };
            });

            // 3. Ordenar decrescente pelo score
            scored.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                // Primeiro critério de desempate: Status ativo (Bolsista ou Monitor)
                const aStatus = (a.musico.Status || "").toLowerCase();
                const bStatus = (b.musico.Status || "").toLowerCase();
                const aAtivo = aStatus.includes("bolsista") || aStatus.includes("monitor");
                const bAtivo = bStatus.includes("bolsista") || bStatus.includes("monitor");

                if (aAtivo !== bAtivo) {
                    return aAtivo ? -1 : 1;
                }

                // Segundo critério de desempate: Ordem Alfabética pelo Nome Artístico
                const nomeA = (a.musico.NOMEARTISTICO || "").toLowerCase();
                const nomeB = (b.musico.NOMEARTISTICO || "").toLowerCase();
                return nomeA.localeCompare(nomeB);
            });

            const sortedFiltered = scored.map(item => item.musico);
            renderMusiciansTable(sortedFiltered);
        });
    }

    // 5. Lógica da Gaveta Lateral (Drawer)
    function openMusicoDrawer(musico) {
        if (!drawer || !drawerOverlay) return;
        currentSelectedMusico = musico;

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
        
        const drawerTelefoneEl = document.getElementById('drawer-val-telefone');
        const telefones = parseTelefones(musico.TELEFONE);
        if (telefones.length > 0) {
            let html = `<div style="display: flex; flex-direction: column; gap: 0.4rem;">`;
            telefones.forEach(t => {
                html += `
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-weight: 500; font-size: 0.95rem;">${t.display}</span>
                        ${t.label !== 'Telefone' ? `<span style="font-size: 0.8rem; color: #888; background: #f0f2f5; padding: 2px 6px; border-radius: 4px;">${t.label}</span>` : ''}
                        ${t.whatsappLink ? `
                        <a href="${t.whatsappLink}" target="_blank" class="whatsapp-quick-link" title="Chamar no WhatsApp" style="display: inline-flex; align-items: center; color: #25D366; transition: transform 0.2s; padding: 2px;">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style="width: 16px; height: 16px; fill: currentColor;">
                                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                            </svg>
                        </a>
                        ` : ''}
                    </div>
                `;
            });
            html += `</div>`;
            drawerTelefoneEl.innerHTML = html;
        } else {
            drawerTelefoneEl.textContent = '-';
        }
        document.getElementById('drawer-val-cpf').textContent = formatValue(musico.CPF);
        document.getElementById('drawer-val-rg').textContent = formatValue(musico.RG);
        document.getElementById('drawer-val-pis').textContent = formatValue(musico['PIS/PASEP']);
        document.getElementById('drawer-val-nascimento').textContent = formatExcelDate(musico['DATA DE NACIMENTO ']);
        
        // Calcular idade de forma inteligente
        const idadeCalculada = calcularIdade(musico['DATA DE NACIMENTO ']) || (typeof musico.IDADE === 'number' && musico.IDADE < 120 ? musico.IDADE : null);
        document.getElementById('drawer-val-idade').textContent = idadeCalculada ? `${idadeCalculada} anos` : '-';
        const rawGenero = musico.GENERO || musico['GÊNERO'] || musico.genero || musico['Gênero'] || musico.Genero || musico['Identidade de Gênero'] || musico['IDENTIDADE DE GÊNERO'] || '';
        document.getElementById('drawer-val-genero').textContent = formatValue(rawGenero);

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

    let currentSelectedMusico = null; // Músico atualmente aberto na gaveta de leitura
    const btnEditCurrentMusico = document.getElementById('btn-edit-current-musico');

    function closeMusicoDrawer() {
        if (!drawer || !drawerOverlay) return;
        drawer.classList.remove('open');
        drawerOverlay.classList.remove('open');
    }

    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeMusicoDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeMusicoDrawer);

    if (btnEditCurrentMusico) {
        btnEditCurrentMusico.addEventListener('click', () => {
            if (currentSelectedMusico) {
                openEditMusicoDrawerDirect(currentSelectedMusico);
            }
        });
    }

    // 6. Importação da Planilha (.xlsx) com SheetJS e Modal de Confirmação (Diff)
    const modalDiff = document.getElementById('modal-confirm-import-excel');
    const btnCloseDiff = document.getElementById('btn-close-import-diff-modal');
    const btnCancelDiff = document.getElementById('btn-cancel-import-diff');
    const btnConfirmDiff = document.getElementById('btn-confirm-import-diff');
    const diffTabsContainer = document.getElementById('import-diff-tabs');
    const diffListContainer = document.getElementById('import-diff-list-container');
    const sheetNameEl = document.getElementById('import-diff-sheet-name');

    // Gaveta de Edição de Músico (Diff & Edição Direta no Banco)
    const editMusicoDrawer = document.getElementById('edit-musico-drawer');
    const editMusicoDrawerOverlay = document.getElementById('edit-musico-drawer-overlay');
    const btnCloseEditMusicoDrawer = document.getElementById('btn-close-edit-drawer');
    const btnCancelEditMusico = document.getElementById('btn-cancel-edit-musico');
    const formEditMusicoDrawer = document.getElementById('form-edit-musico-drawer');
    const editStatusSelect = document.getElementById('edit-m-status');
    const editDataSaidaContainer = document.getElementById('edit-m-container-data-saida');
    const editDataSaidaInput = document.getElementById('edit-m-data-saida');

    let pendingImportData = null; // Armazena os dados do diff antes de confirmar
    let currentEditingMusico = null; // Músico selecionado para edição

    const closeModalDiff = () => {
        if (modalDiff) modalDiff.style.display = 'none';
        pendingImportData = null;
        if (importInput) importInput.value = '';
        closeEditMusicoDrawer();
    };

    // Helper para preencher todos os campos do formulário da gaveta de edição
    const populateEditDrawerFields = (item, selectedStatus) => {
        const getVal = (val) => (val === undefined || val === null || val === '-') ? '' : val;

        // Formatar datas numéricas do Excel (ex: 39451) para texto legível DD/MM/AAAA
        const formatExcelDateStr = (val) => {
            if (!val || val === '-') return '';
            if (!isNaN(val) && typeof val === 'number') {
                const date = new Date((val - 25569) * 86400 * 1000);
                if (!isNaN(date.getTime())) {
                    const dd = String(date.getDate()).padStart(2, '0');
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const yyyy = date.getFullYear();
                    return `${dd}/${mm}/${yyyy}`;
                }
            }
            return String(val);
        };

        document.getElementById('edit-m-nome-artistico').value = getVal(item.NOMEARTISTICO || item['NOME REGISTRO'] || item.Nome);
        document.getElementById('edit-m-nome-registro').value = getVal(item['NOME REGISTRO'] || item.NOMEARTISTICO || item.Nome);
        document.getElementById('edit-m-instrumento').value = getVal(item.INSTRUMENTOS || item.Instrumento);
        document.getElementById('edit-m-cpf').value = getVal(item.CPF || item.cpfId || item.id);

        if (editStatusSelect) editStatusSelect.value = selectedStatus;

        // Data de Saída
        const hojeDataIso = new Date().toISOString().split('T')[0];
        if (editDataSaidaInput) {
            editDataSaidaInput.value = item.dataSaida || (selectedStatus === 'Inativo' || selectedStatus === 'Desligado' ? hojeDataIso : '');
        }

        const isInactive = selectedStatus === 'Inativo' || selectedStatus === 'Desligado';
        if (editDataSaidaContainer) {
            editDataSaidaContainer.style.display = isInactive ? 'block' : 'none';
        }

        // Outros campos com tratamento de datas do Excel
        document.getElementById('edit-m-escalado').value = getVal(item.Escalado);
        document.getElementById('edit-m-tipo-contrato').value = getVal(item['Tipo Contrato Prorrogáveis por igual prazo'] || item['Tipo Contrato']);
        document.getElementById('edit-m-inicio-contrato').value = formatExcelDateStr(item['INICIO OER Contrato']);
        document.getElementById('edit-m-termino-contrato').value = formatExcelDateStr(item['TERMINO OER Contrato']);
        const cadernoInput = document.getElementById('edit-m-caderno-excertos');
        if (cadernoInput) {
            cadernoInput.value = getVal(item['Data de Envio Caderno de Exceros'] || item['Data de Envio Caderno de Excertos'] || item['Data Envio Caderno de Excertos']);
        }
        document.getElementById('edit-m-email').value = getVal(item.EMAIL || item.Email);
        document.getElementById('edit-m-telefone').value = getVal(item.TELEFONE || item.Telefone);
        document.getElementById('edit-m-nascimento').value = formatExcelDateStr(item['DATA DE NACIMENTO '] || item['DATA DE NASCIMENTO'] || item.Nascimento);
        document.getElementById('edit-m-rg').value = getVal(item.RG || item.Rg);
        document.getElementById('edit-m-pis').value = getVal(item['PIS/PASEP'] || item.Pis);
        document.getElementById('edit-m-genero').value = getVal(item.GENERO || item['GÊNERO'] || item.genero || item['Identidade de Gênero'] || item.Genero);
        document.getElementById('edit-m-banco').value = getVal(item['Banco '] || item.Banco);
        document.getElementById('edit-m-agencia').value = getVal(item['Agencia '] || item.Agencia);
        document.getElementById('edit-m-conta').value = getVal(item['Conta Corrente '] || item['Conta Corrente']);
        document.getElementById('edit-m-endereco').value = getVal(item['Endereço'] || item['Endereço ']);
        document.getElementById('edit-m-cep').value = getVal(item.CEP || item.Cep);
        document.getElementById('edit-m-restricao').value = getVal(item['Restrição Alimentar'] || item['Restrição Alimentar ']);
        document.getElementById('edit-m-carro').value = getVal(item['Dados Carro']);
    };

    // Abertura da gaveta para Edição Direta no Banco Firestore
    const openEditMusicoDrawerDirect = (musico) => {
        if (!editMusicoDrawer || !editMusicoDrawerOverlay) return;
        const cpfId = musico.id || (musico.CPF ? musico.CPF.toString().replace(/[^\d]/g, "") : "");
        currentEditingMusico = { item: musico, isDirectEdit: true, cpfId: cpfId };

        const titleEl = document.getElementById('edit-drawer-title');
        const subtitleEl = document.getElementById('edit-drawer-subtitle');
        if (titleEl) {
            titleEl.innerHTML = `<i data-lucide="user-pen" style="width: 20px; height: 20px; color: var(--primary-color, #8b0000);"></i> Editar Músico - ${musico.NOMEARTISTICO || musico.Nome || 'Integrante'}`;
        }
        if (subtitleEl) {
            subtitleEl.textContent = 'Ajuste os dados cadastrais e salve para atualizar os relatórios e presença em tempo real.';
        }

        let statusVal = musico.Status || 'Bolsista';
        const statusLower = statusVal.toLowerCase();
        let selectedStatus = 'Bolsista';
        if (statusLower.includes('monitor')) selectedStatus = 'Monitor';
        else if (statusLower.includes('titular')) selectedStatus = 'Reg.Titular';
        else if (statusLower.includes('extra')) selectedStatus = 'Músico Extra';
        else if (statusLower.includes('inativo') || statusLower.includes('cancelad')) selectedStatus = 'Inativo';
        else if (statusLower.includes('desligad')) selectedStatus = 'Desligado';
        else if (statusLower.includes('bolsista')) selectedStatus = 'Bolsista';
        else selectedStatus = statusVal;

        populateEditDrawerFields(musico, selectedStatus);

        editMusicoDrawer.classList.add('open');
        editMusicoDrawerOverlay.classList.add('open');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    const openEditMusicoDrawer = (item, tabName, index) => {
        if (!editMusicoDrawer || !editMusicoDrawerOverlay) return;
        currentEditingMusico = { item, tabName, index, isDirectEdit: false, cpfId: item.cpfId || (item.CPF ? item.CPF.toString().replace(/[^\d]/g, "") : "") };

        const titleEl = document.getElementById('edit-drawer-title');
        const subtitleEl = document.getElementById('edit-drawer-subtitle');
        if (titleEl) {
            titleEl.innerHTML = `<i data-lucide="user-pen" style="width: 20px; height: 20px; color: var(--primary-color, #8b0000);"></i> Editar Integrante`;
        }
        if (subtitleEl) {
            subtitleEl.textContent = 'Ajuste os dados antes de confirmar a importação';
        }

        // Status: se for na aba Inativados, o status selecionado DEVE ser Inativo (ou Desligado)
        let selectedStatus = 'Bolsista';
        if (tabName === 'inativados') {
            const stLower = (item.Status || '').toLowerCase();
            selectedStatus = stLower.includes('desligad') ? 'Desligado' : 'Inativo';
        } else {
            let statusVal = item.Status || 'Bolsista';
            const statusLower = statusVal.toLowerCase();
            if (statusLower.includes('monitor')) selectedStatus = 'Monitor';
            else if (statusLower.includes('titular')) selectedStatus = 'Reg.Titular';
            else if (statusLower.includes('extra')) selectedStatus = 'Músico Extra';
            else if (statusLower.includes('inativo') || statusLower.includes('cancelad')) selectedStatus = 'Inativo';
            else if (statusLower.includes('desligad')) selectedStatus = 'Desligado';
            else if (statusLower.includes('bolsista')) selectedStatus = 'Bolsista';
            else selectedStatus = statusVal;
        }

        populateEditDrawerFields(item, selectedStatus);

        editMusicoDrawer.classList.add('open');
        editMusicoDrawerOverlay.classList.add('open');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    const closeEditMusicoDrawer = () => {
        if (editMusicoDrawer) editMusicoDrawer.classList.remove('open');
        if (editMusicoDrawerOverlay) editMusicoDrawerOverlay.classList.remove('open');
        currentEditingMusico = null;
    };

    if (btnCloseEditMusicoDrawer) btnCloseEditMusicoDrawer.addEventListener('click', closeEditMusicoDrawer);
    if (btnCancelEditMusico) btnCancelEditMusico.addEventListener('click', closeEditMusicoDrawer);
    if (editMusicoDrawerOverlay) editMusicoDrawerOverlay.addEventListener('click', closeEditMusicoDrawer);

    if (editStatusSelect) {
        editStatusSelect.addEventListener('change', () => {
            const st = editStatusSelect.value.toLowerCase();
            const isInactive = st === 'inativo' || st === 'desligado';
            if (editDataSaidaContainer) {
                editDataSaidaContainer.style.display = isInactive ? 'block' : 'none';
            }
            if (isInactive && editDataSaidaInput && !editDataSaidaInput.value) {
                editDataSaidaInput.value = new Date().toISOString().split('T')[0];
            }
        });
    }

    if (formEditMusicoDrawer) {
        formEditMusicoDrawer.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentEditingMusico) return;

            const newNomeArtistico = document.getElementById('edit-m-nome-artistico').value.trim();
            const newNomeRegistro = document.getElementById('edit-m-nome-registro').value.trim();
            const newInstrumento = document.getElementById('edit-m-instrumento').value.trim();
            const rawCpf = document.getElementById('edit-m-cpf').value.trim();
            const newCpfId = rawCpf.replace(/[^\d]/g, "") || currentEditingMusico.cpfId;
            const newStatus = editStatusSelect.value;
            const newDataSaida = editDataSaidaInput ? editDataSaidaInput.value : '';
            const isNowInactive = newStatus === 'Inativo' || newStatus === 'Desligado';

            // CASO 1: Edição Direta no Banco de Dados Firestore
            if (currentEditingMusico.isDirectEdit) {
                const docId = currentEditingMusico.cpfId || newCpfId;
                if (!docId) {
                    showNotification("CPF inválido ou ausente para identificar o músico no banco.", "error");
                    return;
                }

                const cadernoExcertosVal = document.getElementById('edit-m-caderno-excertos') ? document.getElementById('edit-m-caderno-excertos').value.trim() : '';

                const updatedData = {
                    NOMEARTISTICO: newNomeArtistico,
                    'NOME REGISTRO': newNomeRegistro,
                    Nome: newNomeArtistico || newNomeRegistro,
                    INSTRUMENTOS: newInstrumento,
                    Instrumento: newInstrumento,
                    CPF: rawCpf,
                    cpfId: docId,
                    Status: newStatus,
                    Escalado: document.getElementById('edit-m-escalado').value.trim(),
                    'Tipo Contrato Prorrogáveis por igual prazo': document.getElementById('edit-m-tipo-contrato').value.trim(),
                    'INICIO OER Contrato': document.getElementById('edit-m-inicio-contrato').value.trim(),
                    'TERMINO OER Contrato': document.getElementById('edit-m-termino-contrato').value.trim(),
                    'Data de Envio Caderno de Exceros': cadernoExcertosVal,
                    EMAIL: document.getElementById('edit-m-email').value.trim(),
                    TELEFONE: document.getElementById('edit-m-telefone').value.trim(),
                    'DATA DE NACIMENTO ': document.getElementById('edit-m-nascimento').value.trim(),
                    RG: document.getElementById('edit-m-rg').value.trim(),
                    'PIS/PASEP': document.getElementById('edit-m-pis').value.trim(),
                    GENERO: document.getElementById('edit-m-genero').value.trim(),
                    'Banco ': document.getElementById('edit-m-banco').value.trim(),
                    'Agencia ': document.getElementById('edit-m-agencia').value.trim(),
                    'Conta Corrente ': document.getElementById('edit-m-conta').value.trim(),
                    'Endereço': document.getElementById('edit-m-endereco').value.trim(),
                    CEP: document.getElementById('edit-m-cep').value.trim(),
                    'Restrição Alimentar': document.getElementById('edit-m-restricao').value.trim(),
                    'Dados Carro': document.getElementById('edit-m-carro').value.trim(),
                    statusFirebase: isNowInactive ? "inativo" : "ativo",
                    atualizadoEm: new Date().toISOString()
                };

                if (isNowInactive) {
                    updatedData.dataSaida = newDataSaida || new Date().toISOString().split('T')[0];
                } else {
                    updatedData.dataSaida = null;
                }

                const btnSave = document.getElementById('btn-save-edit-musico');
                if (btnSave) {
                    btnSave.disabled = true;
                    btnSave.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width:16px;height:16px;"></i> Salvando...';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }

                try {
                    const musicoDocRef = doc(db, "musicos", docId);
                    await setDoc(musicoDocRef, updatedData, { merge: true });

                    await saveLog('sistema', `Cadastro do músico ${newNomeArtistico || newNomeRegistro} atualizado diretamente no painel.`);

                    showNotification(`Músico ${newNomeArtistico || newNomeRegistro} atualizado com sucesso!`, "success");
                    closeEditMusicoDrawer();
                    closeMusicoDrawer();
                } catch (err) {
                    console.error("Erro ao salvar músico no Firestore:", err);
                    showNotification("Erro ao salvar dados do músico: " + err.message, "error");
                } finally {
                    if (btnSave) {
                        btnSave.disabled = false;
                        btnSave.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i> Salvar Alterações';
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    }
                }
                return;
            }

            // CASO 2: Edição em Memória durante o Preview do Diff do Excel
            if (!pendingImportData) return;

            const { tabName, index, cpfId } = currentEditingMusico;
            const item = currentEditingMusico.item;

            // Atualizar propriedades do item em memória
            item.NOMEARTISTICO = newNomeArtistico;
            item['NOME REGISTRO'] = newNomeRegistro;
            item.Nome = newNomeArtistico || newNomeRegistro;
            item.INSTRUMENTOS = newInstrumento;
            item.Instrumento = newInstrumento;
            item.CPF = rawCpf;
            item.cpfId = newCpfId;
            item.Status = newStatus;
            item.Escalado = document.getElementById('edit-m-escalado').value.trim();
            item['Tipo Contrato Prorrogáveis por igual prazo'] = document.getElementById('edit-m-tipo-contrato').value.trim();
            item['INICIO OER Contrato'] = document.getElementById('edit-m-inicio-contrato').value.trim();
            item['TERMINO OER Contrato'] = document.getElementById('edit-m-termino-contrato').value.trim();
            if (document.getElementById('edit-m-caderno-excertos')) {
                item['Data de Envio Caderno de Exceros'] = document.getElementById('edit-m-caderno-excertos').value.trim();
            }
            item.EMAIL = document.getElementById('edit-m-email').value.trim();
            item.TELEFONE = document.getElementById('edit-m-telefone').value.trim();
            item['DATA DE NACIMENTO '] = document.getElementById('edit-m-nascimento').value.trim();
            item.RG = document.getElementById('edit-m-rg').value.trim();
            item['PIS/PASEP'] = document.getElementById('edit-m-pis').value.trim();
            item.GENERO = document.getElementById('edit-m-genero').value.trim();
            item['Banco '] = document.getElementById('edit-m-banco').value.trim();
            item['Agencia '] = document.getElementById('edit-m-agencia').value.trim();
            item['Conta Corrente '] = document.getElementById('edit-m-conta').value.trim();
            item['Endereço'] = document.getElementById('edit-m-endereco').value.trim();
            item.CEP = document.getElementById('edit-m-cep').value.trim();
            item['Restrição Alimentar'] = document.getElementById('edit-m-restricao').value.trim();
            item['Dados Carro'] = document.getElementById('edit-m-carro').value.trim();

            if (isNowInactive) {
                item.dataSaida = newDataSaida || new Date().toISOString().split('T')[0];
                item.statusFirebase = "inativo";
            } else {
                delete item.dataSaida;
                item.statusFirebase = "ativo";
            }

            // Realocação entre abas se o status foi alterado
            let targetTab = tabName;
            if (tabName === 'inativados' && !isNowInactive) {
                targetTab = 'atualizados';
                pendingImportData.inativados.splice(index, 1);
                pendingImportData.atualizados.push(item);
            } else if (tabName !== 'inativados' && isNowInactive) {
                targetTab = 'inativados';
                pendingImportData[tabName].splice(index, 1);
                pendingImportData.inativados.push(item);
            }

            // Recalcular métricas no modal
            const elNovos = document.getElementById('diff-count-novos');
            const elAtu = document.getElementById('diff-count-atualizados');
            const elReat = document.getElementById('diff-count-reativados');
            const elInat = document.getElementById('diff-count-inativados');

            if (elNovos) elNovos.textContent = pendingImportData.novos.length;
            if (elAtu) elAtu.textContent = pendingImportData.atualizados.length;
            if (elReat) elReat.textContent = pendingImportData.reativados.length;
            if (elInat) elInat.textContent = pendingImportData.inativados.length;

            // Identificar aba ativa atual e renderizar
            const currentActiveBtn = diffTabsContainer ? diffTabsContainer.querySelector('.diff-tab-btn.active') : null;
            const activeTabName = currentActiveBtn ? currentActiveBtn.getAttribute('data-tab') : tabName;
            renderDiffTabContent(activeTabName);

            closeEditMusicoDrawer();
            showNotification("Integrativo editado com sucesso na prévia!", "success");
        });
    }

    if (btnCloseDiff) btnCloseDiff.addEventListener('click', closeModalDiff);
    if (btnCancelDiff) btnCancelDiff.addEventListener('click', closeModalDiff);

    if (diffTabsContainer) {
        diffTabsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.diff-tab-btn');
            if (!btn || !pendingImportData) return;

            diffTabsContainer.querySelectorAll('.diff-tab-btn').forEach(b => {
                b.classList.remove('active');
                b.style.borderBottom = 'none';
                b.style.color = '#64748b';
            });

            btn.classList.add('active');
            btn.style.borderBottom = '2px solid var(--primary-color, #8b0000)';
            btn.style.color = 'var(--primary-color, #8b0000)';

            const tabName = btn.getAttribute('data-tab');
            renderDiffTabContent(tabName);
        });
    }

    // Delegação de clique no botão "Editar" de cada integrante da lista do Diff
    if (diffListContainer) {
        diffListContainer.addEventListener('click', (e) => {
            const btnEdit = e.target.closest('.btn-edit-import-item');
            if (!btnEdit || !pendingImportData) return;

            const tab = btnEdit.getAttribute('data-tab');
            const idx = parseInt(btnEdit.getAttribute('data-index'), 10);
            const list = pendingImportData[tab] || [];
            const item = list[idx];

            if (item) {
                openEditMusicoDrawer(item, tab, idx);
            }
        });
    }

    // Função utilitária para converter datas do Excel / String para o formato YYYY-MM-DD
    const parseDateToYYYYMMDD = (val) => {
        if (!val || val === '-') return null;
        let d = null;
        if (!isNaN(val) && typeof val === 'number') {
            d = new Date((val - 25569) * 86400 * 1000);
        } else if (typeof val === 'string') {
            const str = val.trim();
            const partes = str.split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0], 10);
                const mes = parseInt(partes[1], 10) - 1;
                const ano = parseInt(partes[2], 10);
                d = new Date(ano, mes, dia);
            } else {
                const parsed = Date.parse(str);
                if (!isNaN(parsed)) d = new Date(parsed);
            }
        }
        if (d && !isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
        return null;
    };

    function renderDiffTabContent(tabName) {
        if (!diffListContainer || !pendingImportData) return;
        const list = pendingImportData[tabName] || [];

        if (list.length === 0) {
            diffListContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 1.5rem; font-size: 0.9rem;">Nenhum integrante nesta categoria.</div>`;
            return;
        }

        let html = `<ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">`;
        list.forEach((item, idx) => {
            const nome = item.NOMEARTISTICO || item['NOME REGISTRO'] || item.Nome || 'Músico sem nome';
            const inst = item.INSTRUMENTOS || item.Instrumento || 'Sem instrumento';
            const cpf = item.CPF || item.cpfId || '-';
            const statusLabel = item.Status || item.statusOld || '';
            const dataSaidaDisplay = item.dataSaida ? item.dataSaida.split('-').reverse().join('/') : '';

            html += `
                <li style="background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.6rem 0.8rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <div style="min-width: 0; flex: 1;">
                        <strong style="color: #1e293b; font-size: 0.9rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nome}</strong>
                        <div style="font-size: 0.78rem; color: #64748b;">${inst} &bull; CPF: ${cpf} ${statusLabel ? `&bull; <span style="font-weight:600;">${statusLabel}</span>` : ''}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
                        ${tabName === 'inativados' && dataSaidaDisplay ? `
                            <div style="background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; white-space: nowrap;">
                                Saída: ${dataSaidaDisplay}
                            </div>
                        ` : ''}
                        <button type="button" class="btn-edit-import-item" data-tab="${tabName}" data-index="${idx}" title="Editar dados antes de salvar">
                            <i data-lucide="pencil" style="width: 12px; height: 12px;"></i> <span>Editar</span>
                        </button>
                    </div>
                </li>
            `;
        });
        html += `</ul>`;
        diffListContainer.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showNotification("Lendo planilha...", "info");
            const label = document.getElementById('btn-import-excel-label');
            const originalHTML = label ? label.innerHTML : '';
            if (label) {
                label.style.pointerEvents = 'none';
                label.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 16px; height: 16px;"></i> <span>Processando...</span>';
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();

            const reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = async (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // 1. Procurar aba de dados dos músicos ativos
                    let sheetNameAtivos = workbook.SheetNames.find(name => {
                        const n = name.trim().toLowerCase();
                        return n === 'dados' || n === 'dados gerais' || n === 'músicos' || n === 'musicos';
                    });

                    if (!sheetNameAtivos) {
                        throw new Error('Aba "Dados Gerais" ou "Dados" não encontrada na planilha.');
                    }

                    const sheetAtivos = workbook.Sheets[sheetNameAtivos];
                    const rowsAtivos = XLSX.utils.sheet_to_json(sheetAtivos, { defval: "" });

                    if (rowsAtivos.length === 0) {
                        throw new Error(`A aba "${sheetNameAtivos}" está vazia.`);
                    }

                    // 2. Procurar aba de músicos cancelados / desligados para capturar a DATA DE SAÍDA
                    let sheetNameCancelados = workbook.SheetNames.find(name => {
                        const n = name.trim().toLowerCase();
                        return n.includes('cancelad') || n.includes('desligad') || n.includes('saida') || n.includes('saída');
                    });

                    const cpfToDataSaidaMap = new Map();
                    const hojeDataIso = new Date().toISOString().split('T')[0];

                    if (sheetNameCancelados) {
                        const sheetCancelados = workbook.Sheets[sheetNameCancelados];
                        const rowsCancelados = XLSX.utils.sheet_to_json(sheetCancelados, { defval: "" });
                        
                        rowsCancelados.forEach(row => {
                            let rawCpf = (row.CPF || row['CPF MÚSICO'] || row['CPF MUSICO'] || "").toString().trim();
                            if (!rawCpf) return;
                            const cpfId = rawCpf.replace(/[^\d]/g, "");
                            if (!cpfId) return;

                            // Procurar coluna de data de saída
                            let rawDataSaida = null;
                            for (const key in row) {
                                if (row.hasOwnProperty(key)) {
                                    const keyLower = key.trim().toLowerCase();
                                    if (keyLower.includes('saida') || keyLower.includes('saída') || keyLower.includes('desligamento')) {
                                        rawDataSaida = row[key];
                                        break;
                                    }
                                }
                            }

                            const parsedDate = parseDateToYYYYMMDD(rawDataSaida);
                            cpfToDataSaidaMap.set(cpfId, parsedDate || hojeDataIso);
                        });
                    }

                    // 3. Mapear músicos da planilha importada por CPF
                    const incomingMap = new Map();
                    rowsAtivos.forEach(row => {
                        let rawCpf = (row.CPF || "").toString().trim();
                        if (!rawCpf) return;
                        const cpfId = rawCpf.replace(/[^\d]/g, "");
                        if (!cpfId) return;
                        incomingMap.set(cpfId, row);
                    });

                    if (incomingMap.size === 0) {
                        throw new Error('Nenhum CPF válido encontrado na aba de músicos ativos.');
                    }

                    // 4. Buscar músicos atuais no Firestore para calcular o Diff
                    const currentDocsSnap = await getDocs(collection(db, "musicos"));
                    const firestoreMap = new Map();
                    currentDocsSnap.forEach(docSnap => {
                        firestoreMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                    });

                    const novos = [];
                    const atualizados = [];
                    const reativados = [];
                    const inativados = [];

                    // Avaliar músicos recebidos na nova planilha
                    incomingMap.forEach((rowData, cpfId) => {
                        const existingDoc = firestoreMap.get(cpfId);
                        if (!existingDoc) {
                            novos.push({ cpfId, ...rowData });
                        } else {
                            const statusAtual = existingDoc.statusFirebase || 'ativo';
                            if (statusAtual === 'inativo' || statusAtual === 'desligado') {
                                reativados.push({ cpfId, statusOld: statusAtual, ...rowData });
                            } else {
                                atualizados.push({ cpfId, ...rowData });
                            }
                        }
                    });

                    // Avaliar músicos ativos no banco de dados que NÃO constam na nova planilha
                    firestoreMap.forEach((existingDoc, cpfId) => {
                        const statusAtual = existingDoc.statusFirebase || 'ativo';
                        if (statusAtual === 'ativo' && !incomingMap.has(cpfId)) {
                            const dataSaidaFinal = cpfToDataSaidaMap.get(cpfId) || hojeDataIso;
                            inativados.push({
                                cpfId,
                                dataSaida: dataSaidaFinal,
                                ...existingDoc
                            });
                        }
                    });

                    pendingImportData = {
                        sheetName: sheetNameAtivos,
                        novos,
                        atualizados,
                        reativados,
                        inativados,
                        incomingMap,
                        cpfToDataSaidaMap
                    };

                    // Atualizar contadores no modal de diff
                    document.getElementById('diff-count-novos').textContent = novos.length;
                    document.getElementById('diff-count-atualizados').textContent = atualizados.length;
                    document.getElementById('diff-count-reativados').textContent = reativados.length;
                    document.getElementById('diff-count-inativados').textContent = inativados.length;
                    if (sheetNameEl) sheetNameEl.textContent = `Planilha: Aba "${sheetNameAtivos}" (${rowsAtivos.length} linhas)`;

                    // Selecionar aba 'novos' como padrão ou primeira com conteúdo
                    if (diffTabsContainer) {
                        diffTabsContainer.querySelectorAll('.diff-tab-btn').forEach(b => {
                            b.classList.remove('active');
                            b.style.borderBottom = 'none';
                            b.style.color = '#64748b';
                        });
                        const firstActiveBtn = diffTabsContainer.querySelector('.diff-tab-btn[data-tab="novos"]');
                        if (firstActiveBtn) {
                            firstActiveBtn.classList.add('active');
                            firstActiveBtn.style.borderBottom = '2px solid var(--primary-color, #8b0000)';
                            firstActiveBtn.style.color = 'var(--primary-color, #8b0000)';
                        }
                    }

                    renderDiffTabContent('novos');

                    if (modalDiff) modalDiff.style.display = 'flex';
                    if (typeof lucide !== 'undefined') lucide.createIcons();

                } catch (error) {
                    console.error("Erro ao ler planilha:", error);
                    showNotification("Erro na leitura da planilha: " + error.message, "error");
                    if (importInput) importInput.value = '';
                } finally {
                    if (label) {
                        label.style.pointerEvents = 'auto';
                        label.innerHTML = originalHTML;
                    }
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            };
        });
    }

    // Ação ao clicar em "Confirmar Importação" no Modal de Diff
    if (btnConfirmDiff) {
        btnConfirmDiff.addEventListener('click', async () => {
            if (!pendingImportData) return;

            btnConfirmDiff.disabled = true;
            btnConfirmDiff.innerHTML = '<i data-lucide="loader-2" class="spin" style="width: 16px; height: 16px;"></i> Salvando...';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                const { novos, atualizados, reativados, inativados } = pendingImportData;
                const batch = writeBatch(db);
                let countSaved = 0;

                // 1. Salvar Músicos Ativos (Novos, Atualizados e Reativados)
                [...novos, ...atualizados, ...reativados].forEach(item => {
                    const { cpfId, statusOld, ...rowData } = item;
                    const docRef = doc(db, "musicos", cpfId);
                    const docData = { ...rowData };

                    docData.statusFirebase = "ativo";
                    docData.dataSaida = deleteField(); // Remove dataSaida caso estivesse inativo anteriormente
                    docData.updatedAt = serverTimestamp();

                    batch.set(docRef, docData, { merge: true });
                    countSaved++;
                });

                // 2. Marcar Músicos Inativos com sua DATA DE SAÍDA e dados atualizados
                inativados.forEach(item => {
                    const { cpfId, statusOld, ...rowData } = item;
                    const docRef = doc(db, "musicos", cpfId);
                    const docData = { ...rowData };
                    docData.statusFirebase = "inativo";
                    docData.Status = docData.Status || "Inativo";
                    docData.dataSaida = item.dataSaida || new Date().toISOString().split('T')[0];
                    docData.updatedAt = serverTimestamp();

                    batch.set(docRef, docData, { merge: true });
                    countSaved++;
                });

                // 3. Atualizar carimbo de importação para invalidar cache público de ficha técnica
                const importRef = doc(db, "config", "musiciansImport");
                batch.set(importRef, { lastImportTime: serverTimestamp() }, { merge: true });

                // Commit em lote no Firestore
                await batch.commit();

                showNotification(`Sucesso! Importação concluída. ${countSaved} registros sincronizados (${inativados.length} inativados).`, "success");
                await saveLog("sistema", `Importação de planilha concluída: ${novos.length} novos, ${atualizados.length} atualizados, ${reativados.length} reativados, ${inativados.length} inativados.`, auth.currentUser?.email || "admin");

                closeModalDiff();

            } catch (err) {
                console.error("Erro ao salvar importação:", err);
                showNotification("Erro ao gravar alterações no banco: " + err.message, "error");
            } finally {
                btnConfirmDiff.disabled = false;
                btnConfirmDiff.innerHTML = '<i data-lucide="check-circle" style="width: 16px; height: 16px;"></i> Confirmar Importação';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
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

            // Filtro de segurança: ignorar Angela De Santi Pernambuco e Pedro Luís Silva Pernambuco de forma definitiva
            const nomeRegLower = (m['NOME REGISTRO'] || '').toLowerCase();
            const nomeArtLower = (m.NOMEARTISTICO || '').toLowerCase();
            if (nomeRegLower.includes('angela de santi') || nomeArtLower.includes('angela de santi')) return;
            if (nomeRegLower.includes('pedro luís silva') || nomeRegLower.includes('pedro luis silva') || nomeArtLower.includes('pedro pernambuco')) return;

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
            else if (status.includes('coo') || status.includes('coord') || status.includes('inspetor') || status.includes('produt') || status.includes('produc') || status.includes('produç') || status.includes('montage') || status.includes('montador')) {
                if (status.includes('coo') || status.includes('coord')) {
                    equipeTecnica["Coordenador Artístico"].push(nome);
                } else if (status.includes('inspetor')) {
                    equipeTecnica["Inspetor"].push(nome);
                } else if (status.includes('produt') || status.includes('produc') || status.includes('produç')) {
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
                    formattedList[0] = `${formattedList[0]}**`;
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
            if (cargo === "Coordenador Artístico") {
                // Deixa em branco (sem nomes após o cargo)
                partes.push(`**${cargo}**`);
            } else if (list.length > 0) {
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
                    formattedList[0] = `${formattedList[0]}**`;
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
            if (cargo === "Coordenador Artístico") {
                // Deixa em branco (sem nomes após o cargo)
                corpoPartes.push(`<strong>${cargo}</strong>`);
            } else if (list.length > 0) {
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
            if (cargo === "Coordenador Artístico") {
                // Deixa em branco (sem nomes após o cargo)
                html += `<strong>${cargo}</strong><br><br>`;
            } else if (list.length > 0) {
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

    // 9. Relatório de Metas e Perfil de Músicos
    const btnGenerateMetas = document.getElementById('btn-generate-metas');
    const modalMetas = document.getElementById('metas-perfil-modal-overlay');
    const btnCloseMetas = document.getElementById('btn-metas-modal-close');
    const btnCloseMetasFooter = document.getElementById('btn-close-metas-modal-footer');
    const btnCopyMetas = document.getElementById('btn-copy-metas');
    const resultMetasContainer = document.getElementById('metas-perfil-result');
    const avisoIdadeContainer = document.getElementById('metas-perfil-aviso-idade');

    const metasPorNaipe = {
        "primeiro violino": 16,
        "segundos violino": 16,
        "viola": 10,
        "violoncelo": 10,
        "contrabaixo": 8,
        "flauta": 4,
        "oboe": 4,
        "clarinete": 4,
        "fagote": 4,
        "trompa": 6,
        "trompete": 4,
        "trombone": 5,
        "tuba": 1,
        "percussao": 5,
        "piano": 1,
        "harpa": 1
    };

    const nomesExibicaoNaipes = {
        "primeiro violino": "Primeiros Violinos",
        "segundos violino": "Segundos Violinos",
        "viola": "Violas",
        "violoncelo": "Violoncelos",
        "contrabaixo": "Contrabaixos",
        "flauta": "Flautas",
        "oboe": "Oboés",
        "clarinete": "Clarinetes",
        "fagote": "Fagotes",
        "trompa": "Trompa",
        "trompete": "Trompete",
        "trombone": "Trombones",
        "tuba": "Tuba",
        "percussao": "Percussão",
        "piano": "Piano",
        "harpa": "Harpa"
    };

    const normalizarGenero = (generoVal) => {
        if (!generoVal) return 'nao_informado';
        const s = generoVal.toString().toLowerCase().trim();
        if (!s) return 'nao_informado';

        // 1. Pessoa não Binária
        if (s.includes('não bin') || s.includes('nao bin') || s.includes('non-binary') || s === 'nb' || s.includes('binárie') || s.includes('binarie')) {
            return 'nao_binario';
        }

        // 2. Prefiro não informar / Não informado
        if (s.includes('informar') || s.includes('informado') || s.includes('declarad') || s.includes('responder') || s.includes('dizer') || s.includes('branco')) {
            return 'nao_informado';
        }

        // 3. Mulher / Feminino
        if (s.startsWith('fem') || s === 'f' || s.includes('mulher')) {
            return 'mulher';
        }

        // 4. Homem / Masculino
        if (s.startsWith('masc') || s === 'm' || s.includes('homem')) {
            return 'homem';
        }

        // 5. Outra / Outro / Qualquer outro
        return 'outra';
    };

    if (btnGenerateMetas) {
        btnGenerateMetas.addEventListener('click', () => {
            if (!allMusicians || allMusicians.length === 0) {
                showNotification("Nenhum músico carregado ainda.", "warning");
                return;
            }

            // Filtrar ativos (Ignora inativos, desligados e equipe de apoio/admin)
            const ativos = allMusicians.filter(m => {
                if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
                const status = (m.Status || '').toLowerCase();
                return status.includes('bolsista') || status.includes('monitor');
            });

            const bolsistas = ativos.filter(m => (m.Status || '').toLowerCase().includes('bolsista'));
            const monitores = ativos.filter(m => (m.Status || '').toLowerCase().includes('monitor'));

            const numBolsistas = bolsistas.length;
            const numMonitores = monitores.length;
            const numGeral = numBolsistas + numMonitores;

            // Metas principais
            const metaBolsistas = 83;
            const metaMonitores = 16;
            const metaGeral = 99;

            // Formatação do Status/Falta
            const formatarMeta = (atual, meta) => {
                if (atual === meta) {
                    return `(Meta: ${meta})`;
                } else if (atual > meta) {
                    return `(Meta: ${meta} | Excedente: +${atual - meta})`;
                } else {
                    return `(Meta: ${meta} | Faltam: ${meta - atual})`;
                }
            };

            const strBolsistasMeta = formatarMeta(numBolsistas, metaBolsistas);
            const strMonitoresMeta = formatarMeta(numMonitores, metaMonitores);
            const strGeralMeta = formatarMeta(numGeral, metaGeral);

            // Excedentes por Naipe
            const contagemNaipes = {};
            ativos.forEach(m => {
                const naipeNormalizado = normalizarNaipe(m.INSTRUMENTOS);
                if (naipeNormalizado) {
                    contagemNaipes[naipeNormalizado] = (contagemNaipes[naipeNormalizado] || 0) + 1;
                }
            });

            const excedentesNaipes = [];
            Object.keys(metasPorNaipe).forEach(naipeKey => {
                const atualNaipe = contagemNaipes[naipeKey] || 0;
                const metaNaipe = metasPorNaipe[naipeKey];
                if (atualNaipe > metaNaipe) {
                    const nomeNaipe = nomesExibicaoNaipes[naipeKey] || naipeKey;
                    excedentesNaipes.push(`${nomeNaipe} +${atualNaipe - metaNaipe}`);
                }
            });

            let strExcedenteNaipes = "";
            if (excedentesNaipes.length > 0) {
                strExcedenteNaipes = `\n_(Excedente: ${excedentesNaipes.join(', ')})_`;
            }

            // Perfil dos bolsistas (Idade)
            const idadesBolsistas = [];
            let bolsistasSemIdade = 0;

            bolsistas.forEach(m => {
                const idade = calcularIdade(m['DATA DE NACIMENTO ']) || (typeof m.IDADE === 'number' && m.IDADE < 120 ? m.IDADE : null);
                if (idade !== null) {
                    idadesBolsistas.push(idade);
                } else {
                    bolsistasSemIdade++;
                }
            });

            let mediaIdade = 0;
            let maisNovo = 0;
            let maisVelho = 0;

            if (idadesBolsistas.length > 0) {
                const soma = idadesBolsistas.reduce((acc, curr) => acc + curr, 0);
                mediaIdade = Math.round(soma / idadesBolsistas.length);
                maisNovo = Math.min(...idadesBolsistas);
                maisVelho = Math.max(...idadesBolsistas);
            }

            // Gêneros (Apenas Bolsistas)
            const labelsGenero = {
                mulher: "Mulher",
                homem: "Homem",
                nao_binario: "Pessoa não Binária",
                nao_informado: "Prefiro não informar",
                outra: "Outra"
            };

            const labelsGeneroPlural = {
                mulher: "mulheres",
                homem: "homens",
                nao_binario: "pessoas não binárias",
                nao_informado: "preferem não informar",
                outra: "outras"
            };

            const ordemCategorias = ['mulher', 'homem', 'nao_binario', 'nao_informado', 'outra'];

            const generosBolsistas = {
                mulher: 0,
                homem: 0,
                nao_binario: 0,
                nao_informado: 0,
                outra: 0
            };

            bolsistas.forEach(m => {
                const rawGen = m.GENERO || m['GÊNERO'] || m.genero || m['Gênero'] || m.Genero || m['Identidade de Gênero'] || m['IDENTIDADE DE GÊNERO'] || '';
                const gen = normalizarGenero(rawGen);
                if (generosBolsistas[gen] !== undefined) {
                    generosBolsistas[gen]++;
                } else {
                    generosBolsistas.outra++;
                }
            });

            // Gêneros Geral (Bolsistas + Monitores)
            const generosGeral = {
                mulher: 0,
                homem: 0,
                nao_binario: 0,
                nao_informado: 0,
                outra: 0
            };

            ativos.forEach(m => {
                const rawGen = m.GENERO || m['GÊNERO'] || m.genero || m['Gênero'] || m.Genero || m['Identidade de Gênero'] || m['IDENTIDADE DE GÊNERO'] || '';
                const gen = normalizarGenero(rawGen);
                if (generosGeral[gen] !== undefined) {
                    generosGeral[gen]++;
                } else {
                    generosGeral.outra++;
                }
            });

            // Montar lista de Bolsistas (apenas categorias com contagem > 0)
            const linhasGeneroBolsistas = [];
            ordemCategorias.forEach(key => {
                const qtd = generosBolsistas[key];
                if (qtd > 0) {
                    linhasGeneroBolsistas.push(`${labelsGenero[key]}: ${qtd}`);
                }
            });

            const strGeneroBolsistas = linhasGeneroBolsistas.length > 0 
                ? linhasGeneroBolsistas.join('\n') 
                : 'Nenhum dado de gênero registrado.';

            // Montar nota de rodapé Total Geral (Bolsistas + Monitores) (apenas > 0)
            const partesGeral = [];
            ordemCategorias.forEach(key => {
                const qtd = generosGeral[key];
                if (qtd > 0) {
                    partesGeral.push(`${qtd} ${labelsGeneroPlural[key]}`);
                }
            });

            let strGeralGeneroNota = "";
            if (partesGeral.length > 0) {
                let textoPartes = "";
                if (partesGeral.length === 1) {
                    textoPartes = partesGeral[0];
                } else {
                    const ult = partesGeral.pop();
                    textoPartes = `${partesGeral.join(', ')} e ${ult}`;
                }
                strGeralGeneroNota = `\n\n_(obs.: Caso precise também da quantidade gênero considerando o total geral de monitores e bolsistas reunidos, os números atuais são: ${textoPartes})._`;
            }

            // Data atual da solicitação
            const dataHoje = new Date();
            const dia = String(dataHoje.getDate()).padStart(2, '0');
            const mes = String(dataHoje.getMonth() + 1).padStart(2, '0');
            const ano = dataHoje.getFullYear();
            const hora = String(dataHoje.getHours()).padStart(2, '0');
            const minuto = String(dataHoje.getMinutes()).padStart(2, '0');
            const strDataAtualizado = `${dia}/${mes}/${ano}`;

            // Gerar o relatório formatado
            const relatorioText = `*Relatório Quantidade de Musicistas OER - ${mes}/${ano}*
_(Atualizado: ${strDataAtualizado})_

*BOLSISTAS*: ${numBolsistas} atuais ${strBolsistasMeta}
*Monitores*: ${numMonitores} atuais ${strMonitoresMeta}
*Total GERAL*: ${numGeral} atuais ${strGeralMeta}${strExcedenteNaipes}

*Perfil dos Bolsistas*
*Idade:*
Média: ${mediaIdade} anos
Mais novo: ${maisNovo} anos
Mais velho: ${maisVelho} anos

*Gênero _(Apenas Bolsistas)_:*
${strGeneroBolsistas}${strGeralGeneroNota}`;

            // Preencher o modal
            if (resultMetasContainer) {
                resultMetasContainer.textContent = relatorioText;
            }

            // Mostrar aviso de idades em branco
            if (avisoIdadeContainer) {
                if (bolsistasSemIdade > 0) {
                    avisoIdadeContainer.textContent = `⚠️ Observação: ${bolsistasSemIdade} bolsista(s) foram desconsiderados do cálculo de idade por falta de data de nascimento no cadastro.`;
                    avisoIdadeContainer.style.display = 'block';
                } else {
                    avisoIdadeContainer.style.display = 'none';
                }
            }

            // Abrir o modal
            if (modalMetas) {
                modalMetas.style.display = 'flex';
            }
        });
    }

    // Ouvintes de Fechamento do Modal de Metas
    const fecharMetasModal = () => {
        if (modalMetas) modalMetas.style.display = 'none';
    };

    if (btnCloseMetas) btnCloseMetas.addEventListener('click', fecharMetasModal);
    if (btnCloseMetasFooter) btnCloseMetasFooter.addEventListener('click', fecharMetasModal);

    // Botão de Copiar Relatório de Metas
    if (btnCopyMetas && resultMetasContainer) {
        btnCopyMetas.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(resultMetasContainer.textContent);

                // Feedback visual de cópia bem-sucedida
                const originalText = btnCopyMetas.innerHTML;
                btnCopyMetas.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i> Copiado!';
                btnCopyMetas.style.background = '#4CAF50';
                if (window.lucide) lucide.createIcons();
                
                setTimeout(() => {
                    btnCopyMetas.innerHTML = originalText;
                    btnCopyMetas.style.background = '#4a5568';
                    if (window.lucide) lucide.createIcons();
                }, 2000);
                
                showNotification("Texto copiado para a área de transferência!", "success");
            } catch (err) {
                console.error("Erro ao copiar texto:", err);
                showNotification("Erro ao copiar texto.", "error");
            }
        });
    }
    
    // 10. Relatório de Presença Mensal (PDF)
    const btnGeneratePresencaMensal = document.getElementById('btn-generate-presenca-mensal');
    const modalPresencaMensal = document.getElementById('presenca-mensal-modal-overlay');
    const btnClosePresencaModal = document.getElementById('btn-presenca-modal-close');
    const btnClosePresencaModalFooter = document.getElementById('btn-close-presenca-modal-footer');
    const selectPresencaMes = document.getElementById('presenca-mensal-mes');
    const textareaConcertos = document.getElementById('presenca-mensal-concertos');
    const textareaAnotacoes = document.getElementById('presenca-mensal-anotacoes');
    const btnGeneratePresencaPdf = document.getElementById('btn-generate-presenca-pdf');
    const btnGeneratePresencaExcel = document.getElementById('btn-generate-presenca-excel');

    if (btnGeneratePresencaMensal) {
        btnGeneratePresencaMensal.addEventListener('click', () => {
            abrirModalPresencaMensal();
        });
    }

    const fecharPresencaModal = () => {
        if (modalPresencaMensal) modalPresencaMensal.style.display = 'none';
    };

    if (btnClosePresencaModal) btnClosePresencaModal.addEventListener('click', fecharPresencaModal);
    if (btnClosePresencaModalFooter) btnClosePresencaModalFooter.addEventListener('click', fecharPresencaModal);

    function abrirModalPresencaMensal() {
        if (!selectPresencaMes) return;
        
        selectPresencaMes.innerHTML = '';
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();
        
        const mesesNomes = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        
        for (let i = -6; i <= 5; i++) {
            const d = new Date(anoAtual, mesAtual + i, 1);
            const ano = d.getFullYear();
            const mes = d.getMonth();
            const valor = `${ano}-${String(mes + 1).padStart(2, '0')}`;
            const label = `${mesesNomes[mes]} / ${ano}`;
            
            const opt = document.createElement('option');
            opt.value = valor;
            opt.textContent = label;
            if (i === 0) {
                opt.selected = true;
            }
            selectPresencaMes.appendChild(opt);
        }
        
        carregarEventosCabecalho();
        
        if (modalPresencaMensal) {
            modalPresencaMensal.style.display = 'flex';
        }
    }

    if (selectPresencaMes) {
        selectPresencaMes.addEventListener('change', () => {
            carregarEventosCabecalho();
        });
    }

    async function carregarEventosCabecalho() {
        if (!selectPresencaMes || !textareaConcertos) return;
        
        textareaConcertos.value = "Buscando concertos no Firestore...";
        if (textareaAnotacoes) textareaAnotacoes.value = "";
        
        try {
            const valorMes = selectPresencaMes.value;
            const [ano, mes] = valorMes.split('-');
            const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
            const startOfMonth = `${ano}-${mes}-01`;
            const endOfMonth = `${ano}-${mes}-${ultimoDia}`;
            
            const eventosQuery = query(
                collection(db, "eventos"),
                where("date", ">=", startOfMonth),
                where("date", "<=", endOfMonth),
                orderBy("date", "asc")
            );
            
            const querySnapshot = await getDocs(eventosQuery);
            const concertos = [];
            const anotacoes = [];
            
            querySnapshot.forEach(docSnap => {
                const evt = docSnap.data();
                const diaEvt = evt.date.split('-')[2];
                const tipoLower = (evt.tipo || '').toLowerCase();
                const concertoNome = evt.concertoNome || '';
                const descricaoEnsaio = evt.descricaoEnsaio || '';
                const txtCompletoLower = `${concertoNome} ${descricaoEnsaio}`.toLowerCase();
                
                if (tipoLower === 'concerto' || txtCompletoLower.includes('concerto')) {
                    const nomeDoConcerto = evt.concertoNome || evt.descricaoEnsaio || 'Concerto';
                    concertos.push(`${diaEvt}/${mes} - ${nomeDoConcerto}`);
                } else {
                    const desc = evt.descricaoEnsaio || (evt.tipo === 'folga' ? 'Folga' : 'Ensaio');
                    anotacoes.push(`${diaEvt}/${mes} - ${desc}`);
                }
            });
            
            if (concertos.length > 0) {
                textareaConcertos.value = concertos.join('\n');
            } else {
                textareaConcertos.value = "Nenhum concerto programado para este mês.";
            }
            
            if (textareaAnotacoes) {
                if (anotacoes.length > 0) {
                    textareaAnotacoes.value = anotacoes.join('\n');
                } else {
                    textareaAnotacoes.value = "Ensaios regulares conforme cronograma.\nFolgas programadas nos dias de concerto após a apresentação.";
                }
            }
            
        } catch (err) {
            console.error("Erro ao carregar eventos para o cabeçalho:", err);
            textareaConcertos.value = "Erro ao buscar eventos do mês.";
        }
    }

    const getMusicianStatusForDate = (musico, docsDoDia, dispensasMapRef, atestadosMapRef, dataStr) => {
        const isDispensadoNoDia = dispensasMapRef && dispensasMapRef[musico.id] && dispensasMapRef[musico.id].has(dataStr);
        const isAtestadoNoDia = atestadosMapRef && atestadosMapRef[musico.id] && atestadosMapRef[musico.id].has(dataStr);

        if (!docsDoDia || docsDoDia.length === 0) {
            if (isDispensadoNoDia) {
                return { cellText: 'D', cellClass: 'status-dispensa', incP: 0, incF: 0, excelText: 'D' };
            }
            if (isAtestadoNoDia) {
                return { cellText: 'A', cellClass: 'status-atestado', incP: 0, incF: 0, excelText: 'A' };
            }
            return { cellText: '', cellClass: 'status-sem-registro', incP: 0, incF: 0, excelText: '' };
        }

        const isCanceladoNoDia = musico.dataSaida && dataStr >= musico.dataSaida;
        if (isCanceladoNoDia) {
            return { cellText: 'CL', cellClass: 'status-cancelado', incP: 0, incF: 0, excelText: 'CL' };
        }

        const dataEntradaStr = parseDateToYYYYMMDD(musico['INICIO OER Contrato'] || musico.dataEntrada || musico.inicioContrato);
        const isAntesDoInicio = dataEntradaStr && dataStr < dataEntradaStr;
        if (isAntesDoInicio) {
            return { cellText: '-', cellClass: 'status-nao-escalado', incP: 0, incF: 0, excelText: '-' };
        }

        const isDispensadoGlobal = isDispensadoNoDia;
        const isAtestadoGlobal = isAtestadoNoDia;
        const musicoInstNorm = normalizarNaipe(musico.INSTRUMENTOS || musico.Instrumento || '');
        
        const relevantDocs = docsDoDia.filter(docData => {
            if (docData.tipo === 'ensaio_naipe' && docData.naipe) {
                const naipesArr = (Array.isArray(docData.naipe) ? docData.naipe : [docData.naipe])
                    .map(n => normalizarNaipe(n))
                    .filter(Boolean);
                return naipesArr.some(nn => nn === musicoInstNorm || nn.includes(musicoInstNorm) || musicoInstNorm.includes(nn));
            }
            return true;
        });

        if (relevantDocs.length === 0) {
            if (isDispensadoGlobal) {
                return { cellText: 'D', cellClass: 'status-dispensa', incP: 0, incF: 0, excelText: 'D' };
            }
            if (isAtestadoGlobal) {
                return { cellText: 'A', cellClass: 'status-atestado', incP: 0, incF: 0, excelText: 'A' };
            }
            return { cellText: '-', cellClass: 'status-nao-escalado', incP: 0, incF: 0, excelText: '-' };
        }

        const getSymbol = (reg) => {
            if (!reg) {
                if (isDispensadoGlobal) return { symbol: 'D', status: 'dispensa', incP: 0, incF: 0, excelSym: 'D' };
                if (isAtestadoGlobal) return { symbol: 'A', status: 'atestado', incP: 0, incF: 0, excelSym: 'A' };
                return { symbol: '-', status: 'none', incP: 0, incF: 0, excelSym: '-' };
            }
            const st = reg.status;
            if (st === 'presenca') return { symbol: '✓', status: 'presenca', incP: 1, incF: 0, excelSym: 'P' };
            if (st === 'falta') {
                if (isDispensadoGlobal) return { symbol: 'D', status: 'dispensa', incP: 0, incF: 0, excelSym: 'D' };
                if (isAtestadoGlobal) return { symbol: 'A', status: 'atestado', incP: 0, incF: 0, excelSym: 'A' };
                return { symbol: 'F', status: 'falta', incP: 0, incF: 1, excelSym: 'F' };
            }
            if (st === 'atestado') return { symbol: 'A', status: 'atestado', incP: 0, incF: 0, excelSym: 'A' };
            if (st === 'dispensa') return { symbol: 'D', status: 'dispensa', incP: 0, incF: 0, excelSym: 'D' };
            if (st === 'justificado') return { symbol: 'J', status: 'justificado', incP: 0, incF: 0, excelSym: 'J' };
            if (st === 'atraso') return { symbol: reg.minutes ? `${reg.minutes}m` : 'At', status: 'atraso', incP: 1, incF: 0, excelSym: 'P' };
            if (st === 'nao_escalado') return { symbol: '-', status: 'nao_escalado', incP: 0, incF: 0, excelSym: '-' };
            if (isDispensadoGlobal) return { symbol: 'D', status: 'dispensa', incP: 0, incF: 0, excelSym: 'D' };
            if (isAtestadoGlobal) return { symbol: 'A', status: 'atestado', incP: 0, incF: 0, excelSym: 'A' };
            return { symbol: '-', status: 'none', incP: 0, incF: 0, excelSym: '-' };
        };

        if (relevantDocs.length === 1) {
            const docSingle = relevantDocs[0];
            const reg = docSingle.registros ? docSingle.registros[musico.id] : null;
            if (isDispensadoGlobal || (reg && reg.status === 'dispensa')) {
                return { cellText: 'D', cellClass: 'status-dispensa', incP: 0, incF: 0, excelText: 'D' };
            }
            if (isAtestadoGlobal || (reg && reg.status === 'atestado')) {
                return { cellText: 'A', cellClass: 'status-atestado', incP: 0, incF: 0, excelText: 'A' };
            }
            const sym = getSymbol(reg);
            let cClass = 'status-sem-registro';
            if (sym.status === 'presenca') cClass = 'status-presenca';
            else if (sym.status === 'falta') cClass = 'status-falta';
            else if (sym.status === 'atestado') cClass = 'status-atestado';
            else if (sym.status === 'dispensa') cClass = 'status-dispensa';
            else if (sym.status === 'justificado') cClass = 'status-justificado';
            else if (sym.status === 'atraso') cClass = 'status-atraso';
            else if (sym.status === 'nao_escalado') cClass = 'status-nao-escalado';

            return { cellText: sym.symbol, cellClass: cClass, incP: sym.incP, incF: sym.incF, excelText: sym.excelSym };
        }

        const naipeDoc = relevantDocs.find(d => d.tipo === 'ensaio_naipe');
        const tuttiDoc = relevantDocs.find(d => d.tipo !== 'ensaio_naipe');

        const regNaipe = (naipeDoc && naipeDoc.registros) ? naipeDoc.registros[musico.id] : null;
        const regTutti = (tuttiDoc && tuttiDoc.registros) ? tuttiDoc.registros[musico.id] : null;

        if (isDispensadoGlobal) {
            return { cellText: 'D', cellClass: 'status-dispensa', incP: 0, incF: 0, excelText: 'D' };
        }
        if (isAtestadoGlobal) {
            return { cellText: 'A', cellClass: 'status-atestado', incP: 0, incF: 0, excelText: 'A' };
        }

        const symNaipe = getSymbol(regNaipe);
        const symTutti = getSymbol(regTutti);

        let incP = symNaipe.incP + symTutti.incP;
        let incF = symNaipe.incF + symTutti.incF;

        let cellText = `N:${symNaipe.symbol} T:${symTutti.symbol}`;
        let excelText = `N:${symNaipe.excelSym}/T:${symTutti.excelSym}`;
        let cellClass = 'status-composto';
        if (symNaipe.status === 'falta' || symTutti.status === 'falta') {
            cellClass = 'status-falta';
        } else if (symNaipe.status === 'presenca' && symTutti.status === 'presenca') {
            cellClass = 'status-presenca';
        }

        return { cellText, cellClass, incP, incF, excelText };
    };

    if (btnGeneratePresencaPdf) {
        btnGeneratePresencaPdf.addEventListener('click', async () => {
            const valorMes = selectPresencaMes.value;
            const [ano, mesStr] = valorMes.split('-');
            const anoInt = parseInt(ano);
            const mesInt = parseInt(mesStr);
            const totalDias = new Date(anoInt, mesInt, 0).getDate();
            const startOfMonth = `${ano}-${mesStr}-01`;
            
            const concertosTexto = textareaConcertos.value.trim();
            const anotacoesTexto = textareaAnotacoes ? textareaAnotacoes.value.trim() : "";
            
            const originalBtnHTML = btnGeneratePresencaPdf.innerHTML;
            btnGeneratePresencaPdf.disabled = true;
            btnGeneratePresencaPdf.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Gerando...';
            if (window.lucide) lucide.createIcons();
            
            try {
                const startOfMonthQuery = `${ano}-${mesStr}-01`;
                const endOfMonthQuery = `${ano}-${mesStr}-${totalDias}`;
                
                const presencasQuery = query(
                    collection(db, "presencas"),
                    where("__name__", ">=", startOfMonthQuery),
                    where("__name__", "<=", endOfMonthQuery + "_\uffff")
                );
                
                const presencasSnapshot = await getDocs(presencasQuery);
                const presencasPorData = {};
                
                presencasSnapshot.forEach(docSnap => {
                    const dData = docSnap.data();
                    const dateKey = dData.data || docSnap.id.split('_')[0];
                    if (!presencasPorData[dateKey]) presencasPorData[dateKey] = [];
                    presencasPorData[dateKey].push({ id: docSnap.id, ...dData });
                });

                // Buscar dispensas e atestados no Firestore para o período
                const [dispensasSnapshot, atestadosSnapshot] = await Promise.all([
                    getDocs(query(collection(db, "dispensas"))),
                    getDocs(query(collection(db, "medicalCertificates_approved")))
                ]);

                const dispensasMap = {};
                dispensasSnapshot.forEach(docSnap => {
                    const dData = docSnap.data();
                    if (dData.musicianId && dData.dataInicio && dData.dataFim) {
                        if (!dispensasMap[dData.musicianId]) dispensasMap[dData.musicianId] = new Set();
                        let cur = new Date(dData.dataInicio + 'T00:00:00');
                        const end = new Date(dData.dataFim + 'T00:00:00');
                        while (cur <= end) {
                            dispensasMap[dData.musicianId].add(cur.toISOString().split('T')[0]);
                            cur.setDate(cur.getDate() + 1);
                        }
                    }
                });

                const atestadosMap = {};
                atestadosSnapshot.forEach(docSnap => {
                    const aData = docSnap.data();
                    if (aData.musicianId && aData.dataInicio && aData.dataFim) {
                        if (!atestadosMap[aData.musicianId]) atestadosMap[aData.musicianId] = new Set();
                        let cur = new Date(aData.dataInicio + 'T00:00:00');
                        const end = new Date(aData.dataFim + 'T00:00:00');
                        while (cur <= end) {
                            atestadosMap[aData.musicianId].add(cur.toISOString().split('T')[0]);
                            cur.setDate(cur.getDate() + 1);
                        }
                    }
                });
                
                const ativos = allMusicians.filter(m => {
                    // Verificar se a data de início é posterior ao final deste mês
                    const dataEntradaStr = parseDateToYYYYMMDD(m['INICIO OER Contrato'] || m.dataEntrada || m.inicioContrato);
                    if (dataEntradaStr && dataEntradaStr > endOfMonthQuery) {
                        const temRegistroNoMes = Object.values(presencasPorData).some(presDoc => 
                            Array.isArray(presDoc) ? presDoc.some(d => d.registros && d.registros[m.id]) : (presDoc && presDoc.registros && presDoc.registros[m.id])
                        );
                        if (!temRegistroNoMes) return false;
                    }

                    const statusFirebase = (m.statusFirebase || 'ativo').toLowerCase();
                    if (statusFirebase === 'ativo') return true;

                    // Se estiver inativo/desligado:
                    // 1. Incluir se possui dataSaida cadastrada no mês do relatório ou posterior
                    if (m.dataSaida && m.dataSaida >= startOfMonthQuery) {
                        return true;
                    }

                    // 2. Fallback: Incluir se possui algum registro salvo de presença/falta no mês do relatório
                    const temRegistroNoMes = Object.values(presencasPorData).some(presDoc => 
                        Array.isArray(presDoc) ? presDoc.some(d => d.registros && d.registros[m.id]) : (presDoc && presDoc.registros && presDoc.registros[m.id])
                    );
                    if (temRegistroNoMes) {
                        return true;
                    }

                    return false;
                });
                
                const ordemNaipesExibicao = [
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
                
                const musicosPorNaipe = {};
                ordemNaipesExibicao.forEach(n => {
                    musicosPorNaipe[n] = [];
                });
                musicosPorNaipe["Outros"] = [];
                
                ativos.forEach(m => {
                    const instNormalizado = normalizarNaipe(m.INSTRUMENTOS);
                    let naipeGrupo = "Outros";
                    
                    const encontrado = ordemNaipesExibicao.find(n => {
                        const nNorm = normalizarNaipe(n);
                        return nNorm === instNormalizado || nNorm.includes(instNormalizado) || instNormalizado.includes(nNorm);
                    });
                    
                    if (encontrado) {
                        naipeGrupo = encontrado;
                    }
                    
                    musicosPorNaipe[naipeGrupo].push(m);
                });
                
                Object.keys(musicosPorNaipe).forEach(n => {
                    musicosPorNaipe[n].sort((a, b) => {
                        const nomeA = (a.NOMEARTISTICO || a['NOME REGISTRO'] || '').trim().toLowerCase();
                        const nomeB = (b.NOMEARTISTICO || b['NOME REGISTRO'] || '').trim().toLowerCase();
                        return nomeA.localeCompare(nomeB);
                    });
                });
                
                const justificativas = [];
                for (let dia = 1; dia <= totalDias; dia++) {
                    const dataStr = `${ano}-${mesStr}-${String(dia).padStart(2, '0')}`;
                    const pres = presencasPorData[dataStr];
                    if (pres && pres.registros) {
                        Object.entries(pres.registros).forEach(([musicoId, registro]) => {
                            if (registro.status === 'justificado' && registro.justificativa) {
                                const musico = allMusicians.find(m => m.id === musicoId);
                                const nomeMusico = musico ? (musico.NOMEARTISTICO || musico['NOME REGISTRO']) : 'Músico Desconhecido';
                                const dataFormatada = `${String(dia).padStart(2, '0')}/${mesStr}`;
                                justificativas.push({
                                    texto: `${dataFormatada} - ${nomeMusico}: ${registro.justificativa.trim()}`
                                });
                            }
                        });
                    }
                }
                
                const mesesNomes = [
                    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
                ];
                const mesNomeExtenso = mesesNomes[mesInt - 1];
                const tituloRelatorio = `${mesNomeExtenso.toUpperCase()} / ${ano}`;
                
                const printWindow = window.open('', '_blank');
                if (!printWindow) {
                    showNotification("Por favor, permita pop-ups para abrir a janela de impressão.", "warning");
                    return;
                }
                
                // Buscar eventos do mês para identificar os dias de concerto
                const eventosQuery = query(
                    collection(db, "eventos"),
                    where("date", ">=", startOfMonthQuery),
                    where("date", "<=", endOfMonthQuery)
                );
                const eventosSnapshot = await getDocs(eventosQuery);
                const diasDeConcerto = new Set();
                
                eventosSnapshot.forEach(docSnap => {
                    const evt = docSnap.data();
                    const tipoLower = (evt.tipo || '').toLowerCase();
                    const concertoNome = evt.concertoNome || '';
                    const descricaoEnsaio = evt.descricaoEnsaio || '';
                    const txtCompletoLower = `${concertoNome} ${descricaoEnsaio}`.toLowerCase();
                    
                    if (tipoLower === 'concerto' || txtCompletoLower.includes('concerto')) {
                        const diaEvt = parseInt(evt.date.split('-')[2]);
                        diasDeConcerto.add(diaEvt);
                    }
                });

                let diasHeadersHtml = '';
                for (let dia = 1; dia <= totalDias; dia++) {
                    const dataStr = `${ano}-${mesStr}-${String(dia).padStart(2, '0')}`;
                    const presDoc = presencasPorData[dataStr];
                    const hasConcertoPres = presDoc && (
                        presDoc.tipo === 'concerto' || 
                        (Array.isArray(presDoc) && presDoc.some(p => p.tipo === 'concerto'))
                    );
                    const isConcerto = diasDeConcerto.has(dia) || hasConcertoPres;
                    const headerClass = isConcerto ? 'col-day day-concerto' : 'col-day';
                    const diaFormatado = String(dia).padStart(2, '0');
                    diasHeadersHtml += `<th class="${headerClass}">${diaFormatado}/${mesStr}</th>`;
                }
                diasHeadersHtml += `<th class="col-total-header">P</th>`;
                diasHeadersHtml += `<th class="col-total-header">F</th>`;
                
                let tbodyHtml = '';
                const naipesComMusicos = [...ordemNaipesExibicao, "Outros"].filter(n => musicosPorNaipe[n].length > 0);
                
                naipesComMusicos.forEach(naipe => {
                    tbodyHtml += `
                        <tr class="row-naipe-header">
                            <td colspan="${totalDias + 3}">${naipe.toUpperCase()}</td>
                        </tr>
                    `;
                    
                    musicosPorNaipe[naipe].forEach(musico => {
                        const nomeExibido = musico.NOMEARTISTICO || musico['NOME REGISTRO'] || 'Músico';
                        let cellsHtml = '';
                        let totalP = 0;
                        let totalF = 0;
                        
                        for (let dia = 1; dia <= totalDias; dia++) {
                            const dataStr = `${ano}-${mesStr}-${String(dia).padStart(2, '0')}`;
                            const docsDoDia = presencasPorData[dataStr] || [];
                            
                            const statusRes = getMusicianStatusForDate(musico, docsDoDia, dispensasMap, atestadosMap, dataStr);
                            totalP += statusRes.incP;
                            totalF += statusRes.incF;
                            
                            cellsHtml += `<td class="cell-status ${statusRes.cellClass}">${statusRes.cellText}</td>`;
                        }
                        
                        cellsHtml += `<td class="cell-status cell-total-p">${totalP}</td>`;
                        cellsHtml += `<td class="cell-status cell-total-f">${totalF}</td>`;
                        
                        tbodyHtml += `
                            <tr>
                                <td class="col-musico-name">${nomeExibido}</td>
                                ${cellsHtml}
                            </tr>
                        `;
                    });
                });
                
                let justificativasHtml = '';
                if (justificativas.length > 0) {
                    justificativasHtml = justificativas.map(j => `<li>${j.texto}</li>`).join('');
                } else {
                    justificativasHtml = '<li>Nenhuma justificativa de ausência registrada para este período.</li>';
                }
                
                const docHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Lista de Presença Mensal - OER</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 8mm;
        }
        
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            font-size: 7pt;
        }
        
        .report-wrapper {
            width: 100%;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        
        .header-container {
            display: grid;
            grid-template-columns: 200px 1fr 240px;
            border: 1px solid #000;
            margin-bottom: 6px;
        }
        
        .header-left {
            padding: 6px;
            border-right: 1px solid #000;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .logo-oer {
            height: 48px;
            width: auto;
        }
        
        .title-sub h1 { font-size: 11pt; margin: 0; }
        .title-sub p { font-size: 6pt; margin: 0; }
        .header-center { padding: 6px; border-right: 1px solid #000; }
        .header-right { padding: 6px; }
        .month-box { font-weight: bold; text-align: center; font-size: 10pt; }
        
        th, td { border: 1px solid #000; text-align: center; padding: 2px; }
        .col-musico-name { text-align: left; padding-left: 5px; font-weight: bold; }
        .row-naipe-header td { background: #eee; text-align: left; font-weight: bold; }
        
        .status-presenca { background-color: #dcfce7 !important; color: #166534 !important; }
        .status-falta { background-color: #fee2e2 !important; color: #991b1b !important; }
        .status-atestado { background-color: #dbeafe !important; color: #1e40af !important; }
        .status-dispensa { background-color: #e0f2fe !important; color: #075985 !important; font-weight: bold; }
        .status-justificado { background-color: #f3e8ff !important; color: #6b21a8 !important; }
        .status-atraso { background-color: #fef3c7 !important; color: #92400e !important; }
        .status-nao-escalado { background-color: #fafafa !important; color: #757575 !important; }
        .status-cancelado { background-color: #fef2f2 !important; color: #dc2626 !important; font-weight: bold; }
        .status-sem-registro { background-color: #fffde7 !important; }
        
        .footer-wrapper { margin-top: 10px; border: 1px solid #000; padding: 10px; }
        .legend-items { display: flex; gap: 10px; flex-wrap: wrap; font-size: 7pt; }
        .legend-badge { width: 14px; height: 14px; display: inline-block; border: 1px solid #000; text-align: center; margin-right: 5px; }
    </style>
</head>
<body>
    <div class="report-wrapper">
        <div class="header-container">
            <div class="header-left">
                <div class="title-sub"><h1>LISTA DE PRESENÇA</h1><p>ORQUESTRA EXPERIMENTAL DE REPERTÓRIO</p></div>
            </div>
            <div class="header-center"><strong>Concertos:</strong><br>${concertosTexto}</div>
            <div class="header-right"><div class="month-box">${tituloRelatorio}</div><strong>Anotações:</strong><br>${anotacoesTexto}</div>
        </div>
        <table>
            <thead><tr><th style="width:150px">Nome</th>${diasHeadersHtml}</tr></thead>
            <tbody>${tbodyHtml}</tbody>
        </table>
        <div class="footer-wrapper">
            <div class="legend-items">
                <div class="legend-item"><span class="legend-badge status-presenca">✓</span>Presença</div>
                <div class="legend-item"><span class="legend-badge status-falta">F</span>Falta</div>
                <div class="legend-item"><span class="legend-badge status-atestado">A</span>Atestado Médico</div>
                <div class="legend-item"><span class="legend-badge status-dispensa">D</span>Dispensado</div>
                <div class="legend-item"><span class="legend-badge status-justificado">J</span>Justificado</div>
                <div class="legend-item"><span class="legend-badge status-atraso">At</span>Atraso</div>
                <div class="legend-item"><span class="legend-badge status-cancelado">CL</span>Cancelado</div>
                <div class="legend-item"><span class="legend-badge status-nao-escalado">-</span>Não Escalado</div>
            </div>
            <div class="footer-justificativas"><strong>Justificativas:</strong><ul>${justificativasHtml}</ul></div>
        </div>
    </div>
</body>
</html>
                `;
                
                printWindow.document.open();
                printWindow.document.write(docHtml);
                printWindow.document.close();
                
                showNotification("Relatório gerado com sucesso!", "success");
                fecharPresencaModal();
                
            } catch (err) {
                console.error("Erro ao gerar relatório de presença PDF:", err);
                showNotification("Erro ao obter dados de presença no Firestore.", "error");
            } finally {
                btnGeneratePresencaPdf.disabled = false;
                btnGeneratePresencaPdf.innerHTML = originalBtnHTML;
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    if (btnGeneratePresencaExcel) {
        btnGeneratePresencaExcel.addEventListener('click', async () => {
            const valorMes = selectPresencaMes.value;
            const [ano, mesStr] = valorMes.split('-');
            const anoInt = parseInt(ano);
            const mesInt = parseInt(mesStr);
            const totalDias = new Date(anoInt, mesInt, 0).getDate();
            const startOfMonth = `${ano}-${mesStr}-01`;
            
            const concertosTexto = textareaConcertos.value.trim();
            const anotacoesTexto = textareaAnotacoes ? textareaAnotacoes.value.trim() : "";
            
            const originalBtnHTML = btnGeneratePresencaExcel.innerHTML;
            btnGeneratePresencaExcel.disabled = true;
            btnGeneratePresencaExcel.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Gerando Excel...';
            if (window.lucide) lucide.createIcons();
            
            try {
                const startOfMonthQuery = `${ano}-${mesStr}-01`;
                const endOfMonthQuery = `${ano}-${mesStr}-${totalDias}`;
                
                const presencasQuery = query(
                    collection(db, "presencas"),
                    where("__name__", ">=", startOfMonthQuery),
                    where("__name__", "<=", endOfMonthQuery + "_\uffff")
                );
                
                const presencasSnapshot = await getDocs(presencasQuery);
                const presencasPorData = {};
                
                presencasSnapshot.forEach(docSnap => {
                    const dData = docSnap.data();
                    const dateKey = dData.data || docSnap.id.split('_')[0];
                    if (!presencasPorData[dateKey]) presencasPorData[dateKey] = [];
                    presencasPorData[dateKey].push({ id: docSnap.id, ...dData });
                });

                // Buscar dispensas e atestados no Firestore para o período
                const [dispensasSnapshot, atestadosSnapshot] = await Promise.all([
                    getDocs(query(collection(db, "dispensas"))),
                    getDocs(query(collection(db, "medicalCertificates_approved")))
                ]);

                const dispensasMap = {};
                dispensasSnapshot.forEach(docSnap => {
                    const dData = docSnap.data();
                    if (dData.musicianId && dData.dataInicio && dData.dataFim) {
                        if (!dispensasMap[dData.musicianId]) dispensasMap[dData.musicianId] = new Set();
                        let cur = new Date(dData.dataInicio + 'T00:00:00');
                        const end = new Date(dData.dataFim + 'T00:00:00');
                        while (cur <= end) {
                            dispensasMap[dData.musicianId].add(cur.toISOString().split('T')[0]);
                            cur.setDate(cur.getDate() + 1);
                        }
                    }
                });

                const atestadosMap = {};
                atestadosSnapshot.forEach(docSnap => {
                    const aData = docSnap.data();
                    if (aData.musicianId && aData.dataInicio && aData.dataFim) {
                        if (!atestadosMap[aData.musicianId]) atestadosMap[aData.musicianId] = new Set();
                        let cur = new Date(aData.dataInicio + 'T00:00:00');
                        const end = new Date(aData.dataFim + 'T00:00:00');
                        while (cur <= end) {
                            atestadosMap[aData.musicianId].add(cur.toISOString().split('T')[0]);
                            cur.setDate(cur.getDate() + 1);
                        }
                    }
                });

                // Buscar eventos do mês para anotações do cabeçalho de data
                const eventosQuery = query(
                    collection(db, "eventos"),
                    where("date", ">=", startOfMonthQuery),
                    where("date", "<=", endOfMonthQuery)
                );
                const eventosSnapshot = await getDocs(eventosQuery);
                const eventosPorData = {};

                eventosSnapshot.forEach(docSnap => {
                    const evt = docSnap.data();
                    if (evt.date) {
                        if (!eventosPorData[evt.date]) eventosPorData[evt.date] = [];
                        const tipoStr = evt.tipo ? `[${evt.tipo.toUpperCase()}] ` : '';
                        const nomeEvt = evt.concertoNome || evt.descricaoEnsaio || (evt.tipo === 'folga' ? 'Folga' : 'Ensaio');
                        eventosPorData[evt.date].push(`${tipoStr}${nomeEvt}`);
                    }
                });

                const cellCommentsMap = {};
                
                const ativos = allMusicians.filter(m => {
                    // Verificar se a data de início é posterior ao final deste mês
                    const dataEntradaStr = parseDateToYYYYMMDD(m['INICIO OER Contrato'] || m.dataEntrada || m.inicioContrato);
                    if (dataEntradaStr && dataEntradaStr > endOfMonthQuery) {
                        const temRegistroNoMes = Object.values(presencasPorData).some(presDoc => 
                            Array.isArray(presDoc) ? presDoc.some(d => d.registros && d.registros[m.id]) : (presDoc && presDoc.registros && presDoc.registros[m.id])
                        );
                        if (!temRegistroNoMes) return false;
                    }

                    const statusFirebase = (m.statusFirebase || 'ativo').toLowerCase();
                    if (statusFirebase === 'ativo') return true;

                    // Se estiver inativo/desligado:
                    // 1. Incluir se possui dataSaida cadastrada no mês do relatório ou posterior
                    if (m.dataSaida && m.dataSaida >= startOfMonthQuery) {
                        return true;
                    }

                    // 2. Fallback: Incluir se possui algum registro salvo de presença/falta no mês do relatório
                    const temRegistroNoMes = Object.values(presencasPorData).some(presDoc => 
                        Array.isArray(presDoc) ? presDoc.some(d => d.registros && d.registros[m.id]) : (presDoc && presDoc.registros && presDoc.registros[m.id])
                    );
                    if (temRegistroNoMes) {
                        return true;
                    }

                    return false;
                });
                
                const ordemNaipesExibicao = [
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
                
                const musicosPorNaipe = {};
                ordemNaipesExibicao.forEach(n => {
                    musicosPorNaipe[n] = [];
                });
                musicosPorNaipe["Outros"] = [];
                
                ativos.forEach(m => {
                    const instNormalizado = normalizarNaipe(m.INSTRUMENTOS);
                    let naipeGrupo = "Outros";
                    
                    const encontrado = ordemNaipesExibicao.find(n => {
                        const nNorm = normalizarNaipe(n);
                        return nNorm === instNormalizado || nNorm.includes(instNormalizado) || instNormalizado.includes(nNorm);
                    });
                    
                    if (encontrado) {
                        naipeGrupo = encontrado;
                    }
                    
                    musicosPorNaipe[naipeGrupo].push(m);
                });
                
                Object.keys(musicosPorNaipe).forEach(n => {
                    musicosPorNaipe[n].sort((a, b) => {
                        const nomeA = (a.NOMEARTISTICO || a['NOME REGISTRO'] || '').trim().toLowerCase();
                        const nomeB = (b.NOMEARTISTICO || b['NOME REGISTRO'] || '').trim().toLowerCase();
                        return nomeA.localeCompare(nomeB);
                    });
                });
                
                const mesesNomes = [
                    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
                ];
                const mesNomeExtenso = mesesNomes[mesInt - 1];
                const tituloRelatorio = `${mesNomeExtenso.toUpperCase()} / ${ano}`;
                
                const excelRows = [];
                excelRows.push(["LISTA DE PRESENÇA - ORQUESTRA EXPERIMENTAL DE REPERTÓRIO"]);
                excelRows.push([`Mês / Ano: ${tituloRelatorio}`]);
                if (concertosTexto) {
                    excelRows.push([`Concertos / Apresentações: ${concertosTexto.replace(/\n/g, ' | ')}`]);
                }
                if (anotacoesTexto) {
                    excelRows.push([`Anotações / Folgas: ${anotacoesTexto.replace(/\n/g, ' | ')}`]);
                }
                excelRows.push([]); 

                const headerRow = ["Nome / Instrumento"];
                for (let dia = 1; dia <= totalDias; dia++) {
                    headerRow.push(`${String(dia).padStart(2, '0')}/${mesStr}`);
                }
                headerRow.push("P", "F");
                excelRows.push(headerRow);

                const getColLetter = (colIndex) => {
                    let letter = '';
                    let tempCol = colIndex;
                    while (tempCol >= 0) {
                        letter = String.fromCharCode((tempCol % 26) + 65) + letter;
                        tempCol = Math.floor(tempCol / 26) - 1;
                    }
                    return letter;
                };

                // Comentários de eventos no cabeçalho das datas
                const headerRowIndexInExcel = excelRows.length;
                for (let dia = 1; dia <= totalDias; dia++) {
                    const dataStr = `${ano}-${mesStr}-${String(dia).padStart(2, '0')}`;
                    if (eventosPorData[dataStr] && eventosPorData[dataStr].length > 0) {
                        const colLetter = getColLetter(dia);
                        const cellRef = `${colLetter}${headerRowIndexInExcel}`;
                        cellCommentsMap[cellRef] = `Atividade(s):\n${eventosPorData[dataStr].join('\n')}`;
                    }
                }

                const naipesComMusicos = [...ordemNaipesExibicao, "Outros"].filter(n => musicosPorNaipe[n].length > 0);

                naipesComMusicos.forEach(naipe => {
                    const naipeRow = [naipe.toUpperCase()];
                    excelRows.push(naipeRow);

                    musicosPorNaipe[naipe].forEach(musico => {
                        const nomeExibido = musico.NOMEARTISTICO || musico['NOME REGISTRO'] || 'Músico';
                        const rowMusico = [nomeExibido];
                        const currentExcelRowIndex = excelRows.length + 1; // Linha (1-based) no Excel

                        for (let dia = 1; dia <= totalDias; dia++) {
                            const dataStr = `${ano}-${mesStr}-${String(dia).padStart(2, '0')}`;
                            const docsDoDia = presencasPorData[dataStr] || [];

                            const statusRes = getMusicianStatusForDate(musico, docsDoDia, dispensasMap, atestadosMap, dataStr);
                            const cellText = statusRes.excelText || statusRes.cellText;

                            if (statusRes.cellClass === 'status-dispensa') {
                                const colLetter = getColLetter(dia);
                                const cellRef = `${colLetter}${currentExcelRowIndex}`;
                                cellCommentsMap[cellRef] = "Bolsista Dispensado";
                            } else if (statusRes.cellClass === 'status-atestado') {
                                const colLetter = getColLetter(dia);
                                const cellRef = `${colLetter}${currentExcelRowIndex}`;
                                cellCommentsMap[cellRef] = "Atestado Médico Homologado";
                            }
                            rowMusico.push(cellText);
                        }

                        const startCol = 'B';
                        const endCol = getColLetter(totalDias);
                        const formulaRange = `${startCol}${currentExcelRowIndex}:${endCol}${currentExcelRowIndex}`;

                        // Injetar fórmulas do Excel para somar P e F dinamicamente
                        rowMusico.push({ f: `COUNTIF(${formulaRange}, "P")` });
                        rowMusico.push({ f: `COUNTIF(${formulaRange}, "F")` });

                        excelRows.push(rowMusico);
                    });
                });

                if (typeof XLSX === 'undefined') {
                    showNotification("Erro: Biblioteca de exportação Excel (SheetJS) não encontrada.", "error");
                    return;
                }

                const worksheet = XLSX.utils.aoa_to_sheet(excelRows);

                // Aplicar anotações/comentários (.c) nas células correspondentes no SheetJS (ocultos por padrão, visíveis apenas no hover)
                Object.entries(cellCommentsMap).forEach(([cellRef, text]) => {
                    if (!worksheet[cellRef]) {
                        worksheet[cellRef] = { t: 's', v: '' };
                    }
                    const commentObj = [{ t: text, a: 'OER', hidden: true }];
                    commentObj.hidden = true;
                    worksheet[cellRef].c = commentObj;
                });
                
                // Ajustar largura das colunas
                const colWidths = [{ wch: 30 }]; // Nome
                for (let i = 1; i <= totalDias; i++) {
                    colWidths.push({ wch: 8 });
                }
                colWidths.push({ wch: 6 }, { wch: 6 }); // Totais P e F
                worksheet['!cols'] = colWidths;

                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, `Presenca_${mesStr}_${ano}`);

                // Adicionar aba de Legenda no Excel
                const legendaRows = [
                    ["LEGENDA DE SIGLAS - LISTA DE PRESENÇA OER"],
                    [],
                    ["Sigla", "Descrição / Status", "Efeito na Frequência"],
                    ["P", "Presença / Atraso", "Soma no total de Presenças (P)"],
                    ["F", "Falta Não Justificada", "Soma no total de Faltas (F)"],
                    ["A", "Atestado Médico", "Não soma como Falta (Isento)"],
                    ["D", "Dispensa Concedida", "Não soma como Falta (Isento)"],
                    ["J", "Ausência Justificada", "Não soma como Falta (Isento)"],
                    ["At", "Atraso (minutos)", "Soma no total de Presenças (P)"],
                    ["CL", "Contrato Cancelado / Desligado", "Músico inativo a partir desta data"],
                    ["-", "Não Escalado", "Músico não escalado para o ensaio/concerto"]
                ];
                const legendaSheet = XLSX.utils.aoa_to_sheet(legendaRows);
                legendaSheet['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 40 }];
                XLSX.utils.book_append_sheet(workbook, legendaSheet, "Legenda");

                XLSX.writeFile(workbook, `Lista_de_Presenca_Mensal_${mesStr}_${ano}.xlsx`);

                showNotification("Relatório Excel gerado com sucesso!", "success");
                fecharPresencaModal();

            } catch (err) {
                console.error("Erro ao gerar relatório de presença Excel:", err);
                showNotification("Erro ao gerar relatório Excel.", "error");
            } finally {
                btnGeneratePresencaExcel.disabled = false;
                btnGeneratePresencaExcel.innerHTML = originalBtnHTML;
                if (window.lucide) lucide.createIcons();
            }
        });
    }
    const btnGenerateFaltasAtrasos = document.getElementById('btn-generate-faltas-atrasos');
    const modalFaltasAtrasos = document.getElementById('faltas-atrasos-modal-overlay');
    const btnCloseFaltasAtrasos = document.getElementById('btn-faltas-atrasos-modal-close');
    const btnCloseFaltasAtrasosFooter = document.getElementById('btn-close-faltas-atrasos-modal-footer');
    const selectFaltasAtrasosMes = document.getElementById('faltas-atrasos-mes');
    const resultFaltasAtrasosContainer = document.getElementById('faltas-atrasos-result');
    const btnCopyFaltasAtrasos = document.getElementById('btn-copy-faltas-atrasos');

    if (btnGenerateFaltasAtrasos) {
        btnGenerateFaltasAtrasos.addEventListener('click', () => {
            abrirModalFaltasAtrasos();
        });
    }

    const fecharFaltasAtrasosModal = () => {
        if (modalFaltasAtrasos) modalFaltasAtrasos.style.display = 'none';
    };

    if (btnCloseFaltasAtrasos) btnCloseFaltasAtrasos.addEventListener('click', fecharFaltasAtrasosModal);
    if (btnCloseFaltasAtrasosFooter) btnCloseFaltasAtrasosFooter.addEventListener('click', fecharFaltasAtrasosModal);

    function abrirModalFaltasAtrasos() {
        if (!selectFaltasAtrasosMes) return;
        
        selectFaltasAtrasosMes.innerHTML = '';
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();
        
        const mesesNomes = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        
        for (let i = -6; i <= 5; i++) {
            const d = new Date(anoAtual, mesAtual + i, 1);
            const ano = d.getFullYear();
            const mes = d.getMonth();
            const valor = `${ano}-${String(mes + 1).padStart(2, '0')}`;
            const label = `${mesesNomes[mes]} / ${ano}`;
            
            const opt = document.createElement('option');
            opt.value = valor;
            opt.textContent = label;
            if (i === 0) {
                opt.selected = true;
            }
            selectFaltasAtrasosMes.appendChild(opt);
        }
        
        gerarRelatorioFaltasAtrasos();
        
        if (modalFaltasAtrasos) {
            modalFaltasAtrasos.style.display = 'flex';
        }
    }

    if (selectFaltasAtrasosMes) {
        selectFaltasAtrasosMes.addEventListener('change', () => {
            gerarRelatorioFaltasAtrasos();
        });
    }

    async function gerarRelatorioFaltasAtrasos() {
        if (!selectFaltasAtrasosMes || !resultFaltasAtrasosContainer) return;
        
        resultFaltasAtrasosContainer.textContent = "Buscando dados no Firestore...";
        
        try {
            const valorMes = selectFaltasAtrasosMes.value;
            const [ano, mesStr] = valorMes.split('-');
            const anoInt = parseInt(ano);
            const mesInt = parseInt(mesStr);
            const totalDias = new Date(anoInt, mesInt, 0).getDate();
            
            const startOfMonth = `${ano}-${mesStr}-01`;
            const endOfMonth = `${ano}-${mesStr}-${totalDias}`;
            
            const presencasQuery = query(
                collection(db, "presencas"),
                where("__name__", ">=", startOfMonth),
                where("__name__", "<=", endOfMonth + "_\uffff")
            );
            
            const presencasSnapshot = await getDocs(presencasQuery);
            const presencasPorData = {};
            
            presencasSnapshot.forEach(docSnap => {
                const dData = docSnap.data();
                const dateKey = dData.data || docSnap.id.split('_')[0];
                if (!presencasPorData[dateKey]) presencasPorData[dateKey] = [];
                presencasPorData[dateKey].push({ id: docSnap.id, ...dData });
            });
            
            // Buscar dispensas, atestados e eventos no Firestore para o período
            const [dispensasSnapshot, atestadosSnapshot, eventosSnapshot] = await Promise.all([
                getDocs(query(collection(db, "dispensas"))),
                getDocs(query(collection(db, "medicalCertificates_approved"))),
                getDocs(query(
                    collection(db, "eventos"),
                    where("date", ">=", startOfMonth),
                    where("date", "<=", endOfMonth)
                ))
            ]);

            const diasDeConcerto = new Set();
            eventosSnapshot.forEach(docSnap => {
                const evt = docSnap.data();
                const tipoLower = (evt.tipo || '').toLowerCase();
                const concertoNome = evt.concertoNome || '';
                const descricaoEnsaio = evt.descricaoEnsaio || '';
                const txtCompletoLower = `${concertoNome} ${descricaoEnsaio}`.toLowerCase();
                if (tipoLower === 'concerto' || txtCompletoLower.includes('concerto')) {
                    if (evt.date) diasDeConcerto.add(evt.date);
                }
            });

            const dispensasMap = {};
            dispensasSnapshot.forEach(docSnap => {
                const dData = docSnap.data();
                if (dData.musicianId && dData.dataInicio && dData.dataFim) {
                    if (!dispensasMap[dData.musicianId]) dispensasMap[dData.musicianId] = new Set();
                    let cur = new Date(dData.dataInicio + 'T00:00:00');
                    const end = new Date(dData.dataFim + 'T00:00:00');
                    while (cur <= end) {
                        dispensasMap[dData.musicianId].add(cur.toISOString().split('T')[0]);
                        cur.setDate(cur.getDate() + 1);
                    }
                }
            });

            const atestadosMap = {};
            atestadosSnapshot.forEach(docSnap => {
                const aData = docSnap.data();
                if (aData.musicianId && aData.dataInicio && aData.dataFim) {
                    if (!atestadosMap[aData.musicianId]) atestadosMap[aData.musicianId] = new Set();
                    let cur = new Date(aData.dataInicio + 'T00:00:00');
                    const end = new Date(aData.dataFim + 'T00:00:00');
                    while (cur <= end) {
                        atestadosMap[aData.musicianId].add(cur.toISOString().split('T')[0]);
                        cur.setDate(cur.getDate() + 1);
                    }
                }
            });

            // Filtrar apenas bolsistas ativos
            const bolsistas = allMusicians.filter(m => {
                if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
                const status = (m.Status || '').toLowerCase();
                if (!status.includes('bolsista')) return false;

                const dataEntradaStr = parseDateToYYYYMMDD(m['INICIO OER Contrato'] || m.dataEntrada || m.inicioContrato);
                if (dataEntradaStr && dataEntradaStr > endOfMonth) {
                    return false;
                }
                return true;
            });
            
            // Dicionário de controle: bolsistaId -> { nome, faltas: [ { dia, obs } ], pendencias: [ { dia, obs } ], atrasosMin: 0 }
            const dadosBolsistas = {};
            
            bolsistas.forEach(b => {
                const nomeExibido = (b.NOMEARTISTICO || b['NOME REGISTRO'] || '').trim();
                if (nomeExibido) {
                    dadosBolsistas[b.id] = {
                        nome: nomeExibido,
                        inst: (b.INSTRUMENTOS || b.Instrumento || ''),
                        faltas: [],
                        pendencias: [],
                        atrasosMin: 0
                    };
                }
            });
            
            // Varre as presenças do mês
            for (let dia = 1; dia <= totalDias; dia++) {
                const dataStr = `${ano}-${mesStr}-${String(dia).padStart(2, '0')}`;
                const docsDoDia = presencasPorData[dataStr] || [];
                
                docsDoDia.forEach(pres => {
                    if (pres && pres.registros) {
                        const isConcertoPres = pres.tipo === 'concerto' || diasDeConcerto.has(dataStr);
                        Object.entries(pres.registros).forEach(([musicoId, registro]) => {
                            if (dadosBolsistas[musicoId]) {
                                const bInfo = dadosBolsistas[musicoId];
                                const musicoOriginal = bolsistas.find(m => m.id === musicoId);
                                const dataEntradaBolsista = musicoOriginal ? parseDateToYYYYMMDD(musicoOriginal['INICIO OER Contrato'] || musicoOriginal.dataEntrada || musicoOriginal.inicioContrato) : null;
                                if (dataEntradaBolsista && dataStr < dataEntradaBolsista) {
                                    return; // Data anterior ao início do contrato deste bolsista
                                }

                                const musicoInstNorm = normalizarNaipe(bInfo.inst);

                                // Se for ensaio de naipe, verificar relevância
                                if (pres.tipo === 'ensaio_naipe' && pres.naipe) {
                                    const naipesArr = (Array.isArray(pres.naipe) ? pres.naipe : [pres.naipe])
                                        .map(n => normalizarNaipe(n))
                                        .filter(Boolean);
                                    const isRelevant = naipesArr.some(nn => nn === musicoInstNorm || nn.includes(musicoInstNorm) || musicoInstNorm.includes(nn));
                                    if (!isRelevant) return; // Músico não faz parte deste naipe
                                }

                                // Se possui dispensa ou atestado para esta data, não registrar falta ou pendência
                                const isDispensado = dispensasMap[musicoId] && dispensasMap[musicoId].has(dataStr);
                                const isAtestado = atestadosMap[musicoId] && atestadosMap[musicoId].has(dataStr);

                                const isPendente = registro.status === 'pendente' || registro.status === 'none';
                                const isFalta = registro.status === 'falta';

                                if (!isDispensado && !isAtestado) {
                                    if (isFalta) {
                                        let labelObs = '';
                                        if (pres.tipo === 'ensaio_naipe' && pres.naipe) {
                                            const naipeStr = Array.isArray(pres.naipe) ? pres.naipe.join(' + ') : pres.naipe;
                                            labelObs = ` (Ensaio de Naipe - ${naipeStr})`;
                                        } else if (isConcertoPres) {
                                            labelObs = ` (Concerto)`;
                                        }
                                        bInfo.faltas.push({ dia, obs: labelObs });
                                    } else if (isPendente) {
                                        let labelObs = '';
                                        if (pres.tipo === 'ensaio_naipe' && pres.naipe) {
                                            const naipeStr = Array.isArray(pres.naipe) ? pres.naipe.join(' + ') : pres.naipe;
                                            labelObs = ` (Ensaio de Naipe - ${naipeStr})`;
                                        } else if (isConcertoPres) {
                                            labelObs = ` (Concerto)`;
                                        }
                                        bInfo.pendencias.push({ dia, obs: labelObs });
                                    } else if (registro.status === 'atraso') {
                                        const min = parseInt(registro.minutes) || 0;
                                        bInfo.atrasosMin += min;
                                    }
                                }
                            }
                        });
                    }
                });
            }
            
            // 1. Processar e formatar Faltas
            const listaFaltantesLines = [];
            
            // Ordenar bolsistas por nome de exibição
            const bolsistasOrdenadosPorNome = Object.values(dadosBolsistas).sort((a, b) => a.nome.localeCompare(b.nome));
            
            bolsistasOrdenadosPorNome.forEach(b => {
                if (b.faltas.length > 0) {
                    const listDatasStr = b.faltas.map(f => `${String(f.dia).padStart(2, '0')}/${mesStr}${f.obs}`).join(', ');
                    listaFaltantesLines.push(`\t• ${b.nome} - ${listDatasStr}`);
                }
            });

            // 2. Processar e formatar Pendências
            const listaPendentesLines = [];
            bolsistasOrdenadosPorNome.forEach(b => {
                if (b.pendencias.length > 0) {
                    const listDatasStr = b.pendencias.map(p => `${String(p.dia).padStart(2, '0')}/${mesStr}${p.obs}`).join(', ');
                    listaPendentesLines.push(`\t• ${b.nome} - ${listDatasStr}`);
                }
            });
            
            // 3. Processar e formatar Atrasos (do maior para o menor)
            const listaAtrasadosLines = [];
            const bolsistasComAtraso = Object.values(dadosBolsistas)
                .filter(b => b.atrasosMin > 0)
                .sort((a, b) => b.atrasosMin - a.atrasosMin);
                
            bolsistasComAtraso.forEach(b => {
                listaAtrasadosLines.push(`\t• ${b.nome} - ${b.atrasosMin} min`);
            });
            
            const mesesNomes = [
                "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
            ];
            const mesNomeAno = `${mesesNomes[mesInt - 1]} / ${ano}`;
            
            let relatorioText = `*Lista de Faltantes e Datas (Mês de ${mesNomeAno})*\n`;
            if (listaFaltantesLines.length > 0) {
                relatorioText += listaFaltantesLines.join('\n');
            } else {
                relatorioText += "\t• Nenhum bolsista faltou neste mês.";
            }

            relatorioText += `\n\n*Lista de Bolsistas Pendentes (Mês de ${mesNomeAno})*\n`;
            if (listaPendentesLines.length > 0) {
                relatorioText += listaPendentesLines.join('\n');
            } else {
                relatorioText += "\t• Nenhum bolsista possui pendência neste mês.";
            }
            
            relatorioText += `\n\n*Lista de Atrasos - Total Acumulado (Mês de ${mesNomeAno})*\n`;
            if (listaAtrasadosLines.length > 0) {
                relatorioText += listaAtrasadosLines.join('\n');
            } else {
                relatorioText += "\t• Nenhum bolsista teve atraso registrado neste mês.";
            }
            
            resultFaltasAtrasosContainer.textContent = relatorioText;
            
        } catch (err) {
            console.error("Erro ao gerar relatório de faltas/atrasos:", err);
            resultFaltasAtrasosContainer.textContent = "Erro ao buscar dados de presença no Firestore.";
        }
    }

    if (btnCopyFaltasAtrasos && resultFaltasAtrasosContainer) {
        btnCopyFaltasAtrasos.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(resultFaltasAtrasosContainer.textContent);
                
                const originalText = btnCopyFaltasAtrasos.innerHTML;
                btnCopyFaltasAtrasos.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i> Copiado!';
                btnCopyFaltasAtrasos.style.background = '#4CAF50';
                if (window.lucide) lucide.createIcons();
                
                setTimeout(() => {
                    btnCopyFaltasAtrasos.innerHTML = originalText;
                    btnCopyFaltasAtrasos.style.background = '#b45309';
                    if (window.lucide) lucide.createIcons();
                }, 2000);
                
                showNotification("Texto copiado para a área de transferência!", "success");
            } catch (err) {
                console.error("Erro ao copiar texto:", err);
                showNotification("Erro ao copiar texto.", "error");
            }
        });
    }

    // =========================================================================
    // MODAL DE EXTRAÇÃO E CÓPIA PERSONALIZADA DE DADOS DOS MÚSICOS
    // =========================================================================
    function initMusiciansExtractorModal() {
        const cardOpen = document.getElementById('card-extrair-dados');
        const modal = document.getElementById('modal-extrair-musicos');
        const btnClose = document.getElementById('btn-close-modal-extrair');
        const btnCloseFooter = document.getElementById('btn-close-modal-extrair-footer');
        const btnCopy = document.getElementById('btn-copy-extracted');

        const fieldChips = document.querySelectorAll('.btn-field-chip');
        const sepChips = document.querySelectorAll('.btn-sep-chip');
        const btnViewNaipes = document.getElementById('btn-view-naipes');
        const btnViewAlfabetica = document.getElementById('btn-view-alfabetica');

        const btnSelectAll = document.getElementById('btn-select-all');
        const btnSelectBolsistas = document.getElementById('btn-select-bolsistas');
        const btnSelectMonitores = document.getElementById('btn-select-monitores');
        const btnSelectClear = document.getElementById('btn-select-clear');

        const searchInput = document.getElementById('extractor-search-input');
        const listContainer = document.getElementById('extractor-musicians-list');
        const selectedCountEl = document.getElementById('extractor-selected-count');
        const charCountEl = document.getElementById('extractor-char-count');
        const previewTextarea = document.getElementById('extractor-preview-text');

        if (!modal || !cardOpen) return;

        let selectedIds = new Set();
        let currentField = 'nomeArtistico';
        let currentSeparator = 'fluido';
        let currentView = 'naipes';
        let searchQuery = '';

        const openModal = () => {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            if (window.lucide) lucide.createIcons();
            renderList();
            updatePreview();
        };

        const closeModal = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        };

        cardOpen.addEventListener('click', openModal);
        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Troca de campo
        fieldChips.forEach(chip => {
            chip.addEventListener('click', () => {
                fieldChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentField = chip.dataset.field;

                // Sugestão inteligente de separador padrão para cada campo
                if (currentField === 'email') {
                    setSeparator('pontoVirgula');
                } else if (currentField === 'nomeArtistico' || currentField === 'nomeRegistro') {
                    setSeparator('fluido');
                } else if (currentField === 'telefone' || currentField === 'cpf') {
                    setSeparator('virgula');
                }

                updatePreview();
            });
        });

        const setSeparator = (sepType) => {
            currentSeparator = sepType;
            sepChips.forEach(c => {
                if (c.dataset.separator === sepType) {
                    c.classList.add('active');
                } else {
                    c.classList.remove('active');
                }
            });
        };

        // Troca de separador
        sepChips.forEach(chip => {
            chip.addEventListener('click', () => {
                sepChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentSeparator = chip.dataset.separator;
                updatePreview();
            });
        });

        // Alternar visualização (Por Naipes vs Alfabética)
        if (btnViewNaipes && btnViewAlfabetica) {
            btnViewNaipes.addEventListener('click', () => {
                currentView = 'naipes';
                btnViewNaipes.classList.add('active');
                btnViewAlfabetica.classList.remove('active');
                btnViewNaipes.style.background = '#ffffff';
                btnViewNaipes.style.color = '#1e293b';
                btnViewAlfabetica.style.background = 'transparent';
                btnViewAlfabetica.style.color = '#64748b';
                renderList();
            });

            btnViewAlfabetica.addEventListener('click', () => {
                currentView = 'alfabetica';
                btnViewAlfabetica.classList.add('active');
                btnViewNaipes.classList.remove('active');
                btnViewAlfabetica.style.background = '#ffffff';
                btnViewAlfabetica.style.color = '#1e293b';
                btnViewNaipes.style.background = 'transparent';
                btnViewNaipes.style.color = '#64748b';
                renderList();
            });
        }

        // Busca reativa
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.toLowerCase().trim();
                renderList();
            });
        }

        // Obter lista de músicos ativos e válidos
        const getActiveMusicians = () => {
            return (allMusicians || []).filter(m => {
                if (m.statusFirebase === 'desligado' || m.statusFirebase === 'inativo') return false;
                const status = (m.Status || '').toString().toLowerCase();
                return status.includes('bolsista') || status.includes('monitor');
            });
        };

        // Ações Rápidas de Seleção
        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', () => {
                const actives = getActiveMusicians();
                actives.forEach(m => selectedIds.add(m.id));
                renderList();
                updatePreview();
            });
        }

        if (btnSelectBolsistas) {
            btnSelectBolsistas.addEventListener('click', () => {
                selectedIds.clear();
                const actives = getActiveMusicians();
                actives.forEach(m => {
                    if ((m.Status || '').toString().toLowerCase().includes('bolsista')) {
                        selectedIds.add(m.id);
                    }
                });
                renderList();
                updatePreview();
            });
        }

        if (btnSelectMonitores) {
            btnSelectMonitores.addEventListener('click', () => {
                selectedIds.clear();
                const actives = getActiveMusicians();
                actives.forEach(m => {
                    if ((m.Status || '').toString().toLowerCase().includes('monitor')) {
                        selectedIds.add(m.id);
                    }
                });
                renderList();
                updatePreview();
            });
        }

        if (btnSelectClear) {
            btnSelectClear.addEventListener('click', () => {
                selectedIds.clear();
                renderList();
                updatePreview();
            });
        }

        // Renderizar a Lista de Músicos
        const renderList = () => {
            if (!listContainer) return;
            const actives = getActiveMusicians();

            // Filtrar pela busca
            const filtered = actives.filter(m => {
                if (!searchQuery) return true;
                const nomeArt = (m.NOMEARTISTICO || m['NOME ARTÍSTICO'] || '').toLowerCase();
                const nomeReg = (m['NOME REGISTRO'] || m.NOME || '').toLowerCase();
                const inst = (m.INSTRUMENTOS || m.Instrumento || '').toLowerCase();
                const status = (m.Status || '').toLowerCase();
                return nomeArt.includes(searchQuery) || nomeReg.includes(searchQuery) || inst.includes(searchQuery) || status.includes(searchQuery);
            });

            if (filtered.length === 0) {
                listContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 2rem; font-size: 0.875rem;">Nenhum músico encontrado para o filtro.</div>`;
                return;
            }

            if (currentView === 'alfabetica') {
                // Ordenação Alfabética A-Z
                filtered.sort((a, b) => {
                    const nA = (a.NOMEARTISTICO || a['NOME REGISTRO'] || a.NOME || '').trim().toLowerCase();
                    const nB = (b.NOMEARTISTICO || b['NOME REGISTRO'] || b.NOME || '').trim().toLowerCase();
                    return nA.localeCompare(nB, 'pt-BR');
                });

                let html = `<div class="extractor-musicians-grid">`;
                filtered.forEach(m => {
                    const isChecked = selectedIds.has(m.id);
                    const nome = m.NOMEARTISTICO || m['NOME REGISTRO'] || m.NOME || 'Sem nome';
                    const inst = m.INSTRUMENTOS || m.Instrumento || '';
                    const statusLower = (m.Status || '').toLowerCase();
                    const isMonitor = statusLower.includes('monitor');
                    const badgeClass = isMonitor ? 'monitor' : 'bolsista';
                    const badgeText = isMonitor ? 'Monitor' : 'Bolsista';

                    html += `
                        <div class="extractor-musician-item ${isChecked ? 'selected' : ''}" data-id="${m.id}">
                            <input type="checkbox" data-id="${m.id}" ${isChecked ? 'checked' : ''}>
                            <div class="extractor-musician-info">
                                <span class="extractor-musician-name" title="${nome}">${nome}</span>
                                <span class="extractor-musician-meta">${inst}</span>
                            </div>
                            <span class="extractor-badge ${badgeClass}">${badgeText}</span>
                        </div>
                    `;
                });
                html += `</div>`;
                listContainer.innerHTML = html;

            } else {
                // Agrupamento por Naipes
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
                    "Percussão",
                    "Outros"
                ];

                const grupos = {};
                ordemNaipes.forEach(n => { grupos[n] = []; });

                filtered.forEach(m => {
                    const instNormalizado = normalizarNaipe(m.INSTRUMENTOS || m.Instrumento || '');
                    let grupoEncontrado = "Outros";

                    const match = ordemNaipes.find(n => {
                        const nNorm = normalizarNaipe(n);
                        return nNorm === instNormalizado || nNorm.includes(instNormalizado) || instNormalizado.includes(nNorm);
                    });

                    if (match) {
                        grupoEncontrado = match;
                    }
                    grupos[grupoEncontrado].push(m);
                });

                let html = '';
                ordemNaipes.forEach(naipe => {
                    const musicosNaipe = grupos[naipe];
                    if (!musicosNaipe || musicosNaipe.length === 0) return;

                    // Ordenar músicos dentro do naipe
                    musicosNaipe.sort((a, b) => {
                        const nA = (a.NOMEARTISTICO || a['NOME REGISTRO'] || a.NOME || '').trim().toLowerCase();
                        const nB = (b.NOMEARTISTICO || b['NOME REGISTRO'] || b.NOME || '').trim().toLowerCase();
                        return nA.localeCompare(nB, 'pt-BR');
                    });

                    const allNaipeSelected = musicosNaipe.every(m => selectedIds.has(m.id));

                    html += `
                        <div class="extractor-naipe-group" data-naipe="${naipe}">
                            <div class="extractor-naipe-header" data-naipe="${naipe}">
                                <div class="extractor-naipe-title">
                                    <input type="checkbox" class="naipe-master-checkbox" data-naipe="${naipe}" ${allNaipeSelected ? 'checked' : ''}>
                                    <span>${naipe} (${musicosNaipe.length})</span>
                                </div>
                                <i data-lucide="folder" style="width: 15px; height: 15px; color: #94a3b8;"></i>
                            </div>
                            <div class="extractor-musicians-grid">
                    `;

                    musicosNaipe.forEach(m => {
                        const isChecked = selectedIds.has(m.id);
                        const nome = m.NOMEARTISTICO || m['NOME REGISTRO'] || m.NOME || 'Sem nome';
                        const inst = m.INSTRUMENTOS || m.Instrumento || '';
                        const statusLower = (m.Status || '').toLowerCase();
                        const isMonitor = statusLower.includes('monitor');
                        const badgeClass = isMonitor ? 'monitor' : 'bolsista';
                        const badgeText = isMonitor ? 'Monitor' : 'Bolsista';

                        html += `
                            <div class="extractor-musician-item ${isChecked ? 'selected' : ''}" data-id="${m.id}">
                                <input type="checkbox" data-id="${m.id}" ${isChecked ? 'checked' : ''}>
                                <div class="extractor-musician-info">
                                    <span class="extractor-musician-name" title="${nome}">${nome}</span>
                                    <span class="extractor-musician-meta">${inst}</span>
                                </div>
                                <span class="extractor-badge ${badgeClass}">${badgeText}</span>
                            </div>
                        `;
                    });

                    html += `
                            </div>
                        </div>
                    `;
                });

                listContainer.innerHTML = html;

                // Definir estado indeterminado dos headers de naipe
                document.querySelectorAll('.naipe-master-checkbox').forEach(cb => {
                    const naipe = cb.dataset.naipe;
                    const musicosNaipe = grupos[naipe] || [];
                    const allSelected = musicosNaipe.length > 0 && musicosNaipe.every(m => selectedIds.has(m.id));
                    const someSelected = !allSelected && musicosNaipe.some(m => selectedIds.has(m.id));
                    cb.indeterminate = someSelected;
                });
            }

            if (window.lucide) lucide.createIcons();

            // Event Listeners nos itens individuais
            listContainer.querySelectorAll('.extractor-musician-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.tagName === 'INPUT') return;
                    const cb = item.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.checked = !cb.checked;
                        toggleMusicianSelection(cb.dataset.id, cb.checked);
                    }
                });
            });

            listContainer.querySelectorAll('input[data-id]').forEach(cb => {
                cb.addEventListener('change', () => {
                    toggleMusicianSelection(cb.dataset.id, cb.checked);
                });
            });

            // Event Listeners no cabeçalho do naipe (checkbox do naipe)
            listContainer.querySelectorAll('.naipe-master-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const group = cb.closest('.extractor-naipe-group');
                    if (group) {
                        const items = group.querySelectorAll('input[data-id]');
                        items.forEach(itemCb => {
                            itemCb.checked = cb.checked;
                            const id = itemCb.dataset.id;
                            if (cb.checked) {
                                selectedIds.add(id);
                            } else {
                                selectedIds.delete(id);
                            }
                        });
                        renderList();
                        updatePreview();
                    }
                });
            });
        };

        const toggleMusicianSelection = (id, isSelected) => {
            if (isSelected) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
            renderList();
            updatePreview();
        };

        // Motor de Formatação dos Dados
        const updatePreview = () => {
            if (!previewTextarea) return;

            const actives = getActiveMusicians();
            const selectedMusicians = actives.filter(m => selectedIds.has(m.id));

            // Ordenar por nome
            selectedMusicians.sort((a, b) => {
                const nA = (a.NOMEARTISTICO || a['NOME REGISTRO'] || a.NOME || '').trim().toLowerCase();
                const nB = (b.NOMEARTISTICO || b['NOME REGISTRO'] || b.NOME || '').trim().toLowerCase();
                return nA.localeCompare(nB, 'pt-BR');
            });

            // Extrair valor do campo
            const values = [];
            selectedMusicians.forEach(m => {
                let val = '';
                if (currentField === 'nomeArtistico') {
                    val = (m.NOMEARTISTICO || m['NOME ARTÍSTICO'] || m['NOME REGISTRO'] || m.NOME || '').toString().trim();
                } else if (currentField === 'email') {
                    val = (m.EMAIL || m.email || '').toString().trim();
                } else if (currentField === 'telefone') {
                    val = (m['TELEFONE'] || m['Telefone'] || m['WhatsApp'] || m.TELEFONE1 || '').toString().trim();
                } else if (currentField === 'nomeRegistro') {
                    val = (m['NOME REGISTRO'] || m['NOME REGISTRO '] || m.NOME || m.Nome || m.NOMEARTISTICO || '').toString().trim();
                } else if (currentField === 'cpf') {
                    val = (m.CPF || m.cpf || m.id || '').toString().trim();
                }

                if (val && val !== '-' && val !== 'null' && val !== 'undefined') {
                    values.push(val);
                }
            });

            // Formatação com o Separador escolhido
            let formattedText = '';
            if (values.length > 0) {
                if (currentSeparator === 'fluido') {
                    if (values.length === 1) {
                        formattedText = values[0];
                    } else if (values.length === 2) {
                        formattedText = `${values[0]} e ${values[1]}`;
                    } else {
                        formattedText = `${values.slice(0, -1).join(', ')} e ${values[values.length - 1]}`;
                    }
                } else if (currentSeparator === 'pontoVirgula') {
                    formattedText = values.join('; ');
                } else if (currentSeparator === 'linha') {
                    formattedText = values.join('\n');
                } else if (currentSeparator === 'virgula') {
                    formattedText = values.join(', ');
                }
            }

            previewTextarea.value = formattedText;

            if (selectedCountEl) {
                selectedCountEl.textContent = `${selectedIds.size} selecionado${selectedIds.size === 1 ? '' : 's'}`;
            }

            if (charCountEl) {
                charCountEl.textContent = `${values.length} ite${values.length === 1 ? 'm' : 'ns'} · ${formattedText.length} caracteres`;
            }
        };

        // Copiar para Área de Transferência
        if (btnCopy) {
            btnCopy.addEventListener('click', async () => {
                const text = previewTextarea ? previewTextarea.value.trim() : '';
                if (!text) {
                    showNotification("Selecione ao menos um músico com dado válido para copiar.", "warning");
                    return;
                }

                try {
                    await navigator.clipboard.writeText(text);
                    const origHTML = btnCopy.innerHTML;
                    btnCopy.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px;"></i> Copiado!`;
                    btnCopy.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                    if (window.lucide) lucide.createIcons();

                    setTimeout(() => {
                        btnCopy.innerHTML = origHTML;
                        btnCopy.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
                        if (window.lucide) lucide.createIcons();
                    }, 2000);

                    showNotification("Dados copiados para a área de transferência!", "success");
                } catch (err) {
                    console.error("Erro ao copiar dados:", err);
                    showNotification("Não foi possível copiar automaticamente para o clipboard.", "error");
                }
            });
        }
    }

    // Inicializar Modal de Extração
    initMusiciansExtractorModal();

    // Inicializar Áreas Copiáveis do Drawer
    initCopyableFields();
}

/**
 * Adiciona a funcionalidade de copiar ao clicar nas áreas do drawer do músico.
 * Varre todos os campos (.drawer-field e .drawer-header-info), adiciona as classes 
 * e ícones, e configura o Event Listener.
 */
function initCopyableFields() {
    const fieldsToCopy = document.querySelectorAll('#musico-drawer .drawer-field, #musico-drawer .drawer-header-info');
    
    fieldsToCopy.forEach(field => {
        // Ignorar se já foi inicializado
        if (field.classList.contains('copyable-area')) return;
        
        // Adiciona classe e ícone
        field.classList.add('copyable-area');
        
        // O ícone será inserido logo no final do container
        const iconHTML = `<i data-lucide="copy" class="copy-icon-indicator"></i>`;
        
        // Em .drawer-header-info o H3 é o primeiro filho, o P o segundo
        // Nos .drawer-field, .field-value é onde o texto real está.
        // O CSS com display: inline-flex (ou grid com flex) fará o alinhamento
        field.insertAdjacentHTML('beforeend', iconHTML);
        
        field.addEventListener('click', async (e) => {
            // Evitar que cliques em links dentro do campo ativem a cópia (ex: Link do WhatsApp)
            if (e.target.closest('a') || e.target.closest('button')) {
                return;
            }

            let textToCopy = '';
            
            // Lógica de extração de texto
            if (field.classList.contains('drawer-header-info')) {
                const h3 = field.querySelector('h3');
                textToCopy = h3 ? h3.textContent.trim() : '';
            } else {
                const valEl = field.querySelector('.field-value');
                if (!valEl) return;
                
                // Limpeza especial para campo de telefone e afins, ignorando conteúdo de badges/links
                // Clone the node to manipulate and extract text cleanly
                const clone = valEl.cloneNode(true);
                const spansToRemove = clone.querySelectorAll('span:nth-child(2), a'); // Remove "Telefone", "Celular" badges e links WhatsApp
                spansToRemove.forEach(el => el.remove());
                
                textToCopy = clone.textContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                
                // Se for hífen, não há o que copiar
                if (textToCopy === '-') return;
            }
            
            if (!textToCopy) return;

            try {
                await navigator.clipboard.writeText(textToCopy);
                
                // Feedback visual
                const iconEl = field.querySelector('.copy-icon-indicator');
                if (iconEl) {
                    field.classList.add('copied');
                    iconEl.setAttribute('data-lucide', 'check');
                    if (window.lucide) window.lucide.createIcons();
                    
                    setTimeout(() => {
                        field.classList.remove('copied');
                        iconEl.setAttribute('data-lucide', 'copy');
                        if (window.lucide) window.lucide.createIcons();
                    }, 2000);
                }
            } catch (err) {
                console.error("Falha ao copiar:", err);
            }
        });
    });
    
    // Atualizar os ícones lucide recém inseridos
    if (window.lucide) {
        window.lucide.createIcons();
    }
}


