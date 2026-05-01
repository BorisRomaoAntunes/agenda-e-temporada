/**
 * admin.js — Painel Administrativo OER
 * Localização: assets/js/admin/
 * 
 * Responsável por:
 * - Autenticação (login/logout)
 * - Upload de PDFs para Firebase Storage
 * - Atualização de versões no Firestore
 */

import { app } from "../firebase-config.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    collection,
    addDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytesResumable, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Inicializa serviços Firebase a partir da instância centralizada
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Referências DOM
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');
const notificationArea = document.getElementById('notification-area');

// ================= AUTHENTICATION =================

let unsubscribeToggle = null; // Guarda o listener do toggle para poder cancelar no logout

// Observador de estado de autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logado
        loginContainer.classList.remove('active');
        dashboardContainer.classList.add('active');
        document.getElementById('user-email').textContent = user.email;
        initToggleListener(); // Inicia o toggle só após autenticação
    } else {
        // Não logado
        dashboardContainer.classList.remove('active');
        loginContainer.classList.add('active');
        if (unsubscribeToggle) { unsubscribeToggle(); unsubscribeToggle = null; }
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
            selectedFile = e.target.files[0];
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
        displayVersion = displayVersion.replace(/[^\d\.]/g, '');
        
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
        displayVersion = displayVersion.replace(/[^\d\.]/g, '');
        
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
}

// ================= NOTIFICAÇÕES PUSH =================

const btnSendNotif = document.getElementById('btn-send-notif');
const inputNotifTitle = document.getElementById('notif-title');
const inputNotifMessage = document.getElementById('notif-message');

if (btnSendNotif) {
    btnSendNotif.addEventListener('click', async () => {
        const title = inputNotifTitle.value.trim();
        const message = inputNotifMessage.value.trim();

        if (!title || !message) {
            showNotification('Por favor, preencha o título e a mensagem do aviso.', 'error');
            return;
        }

        btnSendNotif.disabled = true;
        const originalText = btnSendNotif.innerHTML;
        btnSendNotif.innerHTML = '<i data-lucide="loader"></i> Enviando...';
        lucide.createIcons();

        try {
            const notifRef = collection(db, 'adminNotifications');
            await addDoc(notifRef, {
                title: title,
                message: message,
                createdAt: new Date().toISOString(),
                sentBy: auth.currentUser ? auth.currentUser.email : 'admin'
            });

            showNotification('Aviso enviado para a fila de disparo! Os músicos receberão em instantes.', 'success');
            inputNotifTitle.value = '';
            inputNotifMessage.value = '';
        } catch (error) {
            showNotification(`Erro ao enviar aviso: ${error.message}`, 'error');
            console.error('Erro:', error);
        } finally {
            btnSendNotif.disabled = false;
            btnSendNotif.innerHTML = originalText;
            lucide.createIcons();
        }
    });
}

// ================= UTILIDADES =================

function showNotification(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    
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

// ================= TOGGLE VISIBILIDADE NOTIFICAÇÕES =================

const toggleNotifBtn = document.getElementById('toggle-notif-btn');
const toggleStatusText = document.getElementById('toggle-status-text');
const settingsRef = doc(db, 'config', 'settings');

function initToggleListener() {
    // Cancela listener anterior se já existir
    if (unsubscribeToggle) unsubscribeToggle();

    // Escuta em tempo real o estado do toggle
    unsubscribeToggle = onSnapshot(settingsRef, (snap) => {
        const enabled = snap.exists() ? (snap.data().notificationsEnabled === true) : false;
        if (toggleNotifBtn) {
            toggleNotifBtn.checked = enabled;
        }
        if (toggleStatusText) {
            toggleStatusText.textContent = enabled
                ? '✅ Botão de notificação ATIVO no site dos músicos.'
                : '🔕 Botão de notificação DESATIVADO no site dos músicos.';
            toggleStatusText.style.color = enabled ? '#2E8B57' : '#888';
        }
    }, (err) => {
        console.error('[Toggle] Erro ao ouvir config/settings:', err);
        if (toggleStatusText) {
            toggleStatusText.textContent = '⚠️ Erro ao carregar estado.';
            toggleStatusText.style.color = '#dc3545';
        }
    });

    // Ao clicar no toggle: grava novo estado no Firestore
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
}

// Inicializa os uploaders
setupUploader('agenda');
setupUploader('temporada');
