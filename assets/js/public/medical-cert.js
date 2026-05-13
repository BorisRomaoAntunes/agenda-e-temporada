/**
 * medical-cert.js — Módulo Público de Envio de Atestados
 * Gerencia a visibilidade do botão de upload e a lógica de envio para o Firebase Storage.
 */

import { db, storage } from '../firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Elementos da UI
const atestadoBtn = document.getElementById('btnAtestadoTrigger');
const uploadModal = document.getElementById('atestado-upload-modal');
const closeModalBtn = document.getElementById('btn-close-atestado-upload');
const uploadForm = document.getElementById('atestado-upload-form');
const fileInput = document.getElementById('input-atestado-file');
const progressContainer = document.getElementById('atestado-upload-progress');
const progressBar = document.getElementById('atestado-progress-inner');
const btnSubmit = document.getElementById('btn-submit-atestado');

/**
 * Monitora se a funcionalidade de atestados está habilitada pelo administrador
 */
function initAtestadosFeature() {
    onSnapshot(doc(db, "settings", "atestados"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().enabled) {
            atestadoBtn.style.display = 'flex';
            // Reinicializa ícones do Lucide
            if (window.lucide) window.lucide.createIcons();
        } else {
            atestadoBtn.style.display = 'none';
        }
    });
}

/**
 * Gerenciamento do Modal
 */
atestadoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    uploadModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
});

closeModalBtn.addEventListener('click', () => {
    closeUploadModal();
});

// Fechar ao clicar fora
uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeUploadModal();
});

function closeUploadModal() {
    uploadModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetForm();
}

function resetForm() {
    uploadForm.reset();
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
    btnSubmit.disabled = false;
    btnSubmit.querySelector('span').innerText = 'Enviar para Processamento';
}

/**
 * Lógica de Upload
 */
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const file = fileInput.files[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        alert("Por favor, envie apenas arquivos PDF ou Imagens (JPG/PNG/WebP).");
        return;
    }

    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const storagePath = `atestados_temp/${timestamp}_${cleanFileName}`;
    const storageRef = ref(storage, storagePath);

    // Iniciar upload
    btnSubmit.disabled = true;
    btnSubmit.querySelector('span').innerText = 'Enviando...';
    progressContainer.style.display = 'block';

    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            progressBar.style.width = progress + '%';
        }, 
        (error) => {
            console.error("Erro no upload:", error);
            alert("Erro ao enviar arquivo. Verifique sua conexão e tente novamente.");
            btnSubmit.disabled = false;
            btnSubmit.querySelector('span').innerText = 'Tentar Novamente';
        }, 
        () => {
            // Sucesso
            btnSubmit.querySelector('span').innerText = '✅ Enviado!';
            setTimeout(() => {
                alert("Atestado recebido com sucesso! A IA da OER irá processar as informações e notificar a administração.");
                closeUploadModal();
            }, 1000);
        }
    );
});

// Drag and Drop (Opcional, mas melhora UX)
const dropArea = document.getElementById('atestado-drop-area');
if (dropArea) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        
        // Trigger visual feedback
        const msg = dropArea.querySelector('.file-msg');
        if (msg && files[0]) msg.innerText = files[0].name;
    }, false);
}

// Inicializa
initAtestadosFeature();
