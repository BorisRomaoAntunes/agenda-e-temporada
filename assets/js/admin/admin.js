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
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    limit,
    startAfter,
    getDocs
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
        loadLogs(); // Carrega o histórico de logs ao logar
        loadAdminNotifications(); // Carrega a lista de notificações ativas
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
    
    // Grava no Log Histórico
    await saveLog('pdf', `Novo PDF enviado para ${type.toUpperCase()}: v${currentData.pdfs[type].displayVersion}`, url);
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

            // Grava no Log Histórico (incluindo o detalhamento)
            await saveLog('aviso', `Notificação push enviada: "${title}"`, null, message);

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
const toggleTickerBtn = document.getElementById('toggle-ticker-btn');
const toggleTickerStatusText = document.getElementById('toggle-ticker-status-text');
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

// Inicializa os uploaders
setupUploader('agenda');
setupUploader('temporada');

// ================= LOGS / HISTÓRICO =================
// ================= GERENCIAMENTO DE NOTIFICAÇÕES (ADMIN) =================

async function loadAdminNotifications() {
    const listEl = document.getElementById('admin-notifications-list');
    if (!listEl) return;

    // Escuta em tempo real a coleção de notificações
    const notificationsRef = collection(db, 'adminNotifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(15));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = '<div class="admin-notif-empty">Nenhum comunicado ativo no site no momento.</div>';
            return;
        }

        listEl.innerHTML = ''; 
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const dateObj = new Date(data.createdAt);
            const formattedDate = dateObj.toLocaleDateString('pt-BR') + ' às ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = 'admin-notif-item';
            item.innerHTML = `
                <div class="admin-notif-content">
                    <h4 class="admin-notif-title">${data.title}</h4>
                    <p class="admin-notif-message">${data.message}</p>
                    <div class="admin-notif-meta">
                        <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Enviado em ${formattedDate}
                    </div>
                </div>
                <button class="btn-delete-notif" title="Apagar comunicado do site" data-id="${id}" data-title="${data.title}">
                    <i data-lucide="trash-2"></i>
                </button>
            `;
            listEl.appendChild(item);
        });

        // Adiciona listeners para os botões de deletar
        listEl.querySelectorAll('.btn-delete-notif').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.getAttribute('data-id');
                const title = btn.getAttribute('data-title');
                await deleteNotification(docId, title);
            });
        });

        lucide.createIcons();
    });
}

async function deleteNotification(docId, title) {
    if (!confirm(`Tem certeza que deseja apagar o comunicado "${title}"?\n\nEle desaparecerá instantaneamente do letreiro e do histórico no site dos músicos.`)) {
        return;
    }

    try {
        const notifRef = doc(db, 'adminNotifications', docId);
        await deleteDoc(notifRef);
        showNotification(`Comunicado "${title}" removido com sucesso.`, 'success');
        
        // Opcional: Grava no log que foi removido
        await saveLog('aviso', `Comunicado removido: "${title}"`, null, `O administrador removeu este aviso que estava ativo no site.`);
    } catch (error) {
        console.error("Erro ao deletar:", error);
        showNotification("Erro ao remover comunicado: " + error.message, 'error');
    }
}

// ================= LOGS / HISTÓRICO =================

async function saveLog(type, message, link = null, details = null) {
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

        await addDoc(logsRef, logData);
        
        // Recarrega logs para aparecer imediatamente
        loadLogs();
    } catch (e) {
        console.error("Erro ao salvar log: ", e);
    }
}

let lastVisibleLog = null; // Para paginação futura

async function loadLogs() {
    const listEl = document.getElementById('log-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<div class="loading-logs"><i data-lucide="loader"></i> Carregando histórico...</div>';
    lucide.createIcons();
    
    try {
        const logsRef = collection(db, 'adminLogs');
        const q = query(logsRef, orderBy('createdAt', 'desc'), limit(50));
        const querySnapshot = await getDocs(q);
        
        listEl.innerHTML = ''; // Limpa "Carregando"
        
        if (querySnapshot.empty) {
            listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Nenhum histórico registrado ainda.</div>';
            if(document.getElementById('btn-load-more-logs')) document.getElementById('btn-load-more-logs').style.display = 'none';
            return;
        }

        lastVisibleLog = querySnapshot.docs[querySnapshot.docs.length - 1];
        
        // Mostrar o botão de ver mais apenas se vieram 50 (pode haver mais)
        const btnMore = document.getElementById('btn-load-more-logs');
        if (btnMore) {
            btnMore.style.display = querySnapshot.docs.length === 50 ? 'inline-block' : 'none';
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateObj = new Date(data.createdAt);
            const formattedDate = dateObj.toLocaleDateString('pt-BR');
            const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            const iconName = data.type === 'aviso' ? 'bell-ring' : 'folder-up';
            
            let linkHtml = '';
            if (data.link) {
                linkHtml = `<a href="${data.link}" target="_blank" class="log-link"><i data-lucide="external-link"></i> Ver Arquivo</a>`;
            }
            
            const li = document.createElement('li');
            li.className = 'log-item';
            li.innerHTML = `
                <div class="log-icon type-${data.type}">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="log-content">
                    <p>${data.message}</p>
                    ${data.details ? `<p class="log-details">${data.details}</p>` : ''}
                    <span>Enviado por: ${data.user}</span>
                    ${linkHtml}
                </div>
                <div class="log-time">
                    <i data-lucide="clock"></i> ${formattedDate} às ${formattedTime}
                </div>
            `;
            listEl.appendChild(li);
        });
        
        lucide.createIcons();
        
    } catch (e) {
        console.error("Erro ao carregar logs: ", e);
        listEl.innerHTML = '<div style="color:red; padding:1rem; text-align:center;">Erro ao carregar histórico.</div>';
    }
}

const btnLoadMoreLogs = document.getElementById('btn-load-more-logs');
if (btnLoadMoreLogs) {
    btnLoadMoreLogs.addEventListener('click', async () => {
        if (!lastVisibleLog) return;
        
        btnLoadMoreLogs.innerHTML = '<i data-lucide="loader"></i> Carregando...';
        lucide.createIcons();
        
        try {
            const logsRef = collection(db, 'adminLogs');
            const q = query(logsRef, orderBy('createdAt', 'desc'), startAfter(lastVisibleLog), limit(50));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                btnLoadMoreLogs.style.display = 'none';
                return;
            }

            lastVisibleLog = querySnapshot.docs[querySnapshot.docs.length - 1];

            const listEl = document.getElementById('log-list');
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const dateObj = new Date(data.createdAt);
                const formattedDate = dateObj.toLocaleDateString('pt-BR');
                const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                
                const iconName = data.type === 'aviso' ? 'bell-ring' : 'folder-up';
                
                let linkHtml = '';
                if (data.link) {
                    linkHtml = `<a href="${data.link}" target="_blank" class="log-link"><i data-lucide="external-link"></i> Ver Arquivo</a>`;
                }
                
                const li = document.createElement('li');
                li.className = 'log-item';
                li.innerHTML = `
                    <div class="log-icon type-${data.type}">
                        <i data-lucide="${iconName}"></i>
                    </div>
                    <div class="log-content">
                        <p>${data.message}</p>
                        ${data.details ? `<p class="log-details" style="font-size: 0.85rem; color: #666; margin-top: 4px; font-weight: normal; font-style: italic; background: #f0f0f0; padding: 6px 10px; border-radius: 6px; border-left: 2px solid #ccc;">${data.details}</p>` : ''}
                        <span>Enviado por: ${data.user}</span>
                        ${linkHtml}
                    </div>
                    <div class="log-time">
                        <i data-lucide="clock"></i> ${formattedDate} às ${formattedTime}
                    </div>
                `;
                listEl.appendChild(li);
            });
            
            lucide.createIcons();
            btnLoadMoreLogs.innerHTML = 'Ver mais antigos';
            
            // Se vieram menos de 50, significa que acabou
            if (querySnapshot.docs.length < 50) {
                btnLoadMoreLogs.style.display = 'none';
            }
            
        } catch (e) {
            console.error("Erro ao carregar mais logs: ", e);
            btnLoadMoreLogs.innerHTML = 'Erro. Tentar novamente';
        }
    });
}
