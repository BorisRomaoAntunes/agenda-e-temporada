/**
 * medical-cert.js — Módulo Público de Envio de Atestados
 * Gerencia a visibilidade do botão de upload e a lógica de envio para o Firebase Storage.
 */

import { db, storage } from '../firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const atestadoBtn = document.getElementById('btnAtestadoTrigger');
    const uploadModal = document.getElementById('atestado-upload-modal');
    const closeModalBtn = document.getElementById('btn-close-atestado-upload');
    const uploadForm = document.getElementById('atestado-upload-form');
    const fileInput = document.getElementById('input-atestado-file');
    const progressContainer = document.getElementById('atestado-upload-progress');
    const progressBar = document.getElementById('atestado-progress-inner');
    const btnSubmit = document.getElementById('btn-submit-atestado');
    const dropArea = document.getElementById('atestado-drop-area');

    if (!atestadoBtn || !uploadModal) return;

    /**
     * Monitora se a funcionalidade de atestados está habilitada pelo administrador
     */
    function initAtestadosFeature() {
        onSnapshot(doc(db, "config", "settings"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().atestadosEnabled) {
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
        if (uploadForm) uploadForm.reset();
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        
        // Reset visual feedback
        const zoneContent = dropArea.querySelector('.upload-zone-content');
        const fileInfo = dropArea.querySelector('.file-selected-info');
        const uploadText = dropArea.querySelector('.upload-text');
        const iconWrapper = dropArea.querySelector('.upload-icon-wrapper');
        
        if (fileInfo) fileInfo.style.display = 'none';
        if (uploadText) uploadText.style.display = 'block';
        if (iconWrapper) iconWrapper.style.display = 'flex';
        
        if (btnSubmit) {
            btnSubmit.disabled = false;
            const span = btnSubmit.querySelector('span');
            if (span) span.innerText = 'Enviar para Processamento';
        }
    }

    /**
     * Feedback Visual de Arquivo Selecionado
     */
    function handleFileSelection(file) {
        if (!file) return;
        
        const fileInfo = dropArea.querySelector('.file-selected-info');
        const uploadText = dropArea.querySelector('.upload-text');
        const iconWrapper = dropArea.querySelector('.upload-icon-wrapper');
        const fileNameDisplay = dropArea.querySelector('.file-name-display');
        
        if (fileInfo && uploadText && iconWrapper && fileNameDisplay) {
            uploadText.style.display = 'none';
            iconWrapper.style.display = 'none';
            fileInfo.style.display = 'flex';
            fileNameDisplay.innerText = file.name;
        }
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            handleFileSelection(e.target.files[0]);
        });
    }

    /**
     * Lógica de Upload
     */
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const file = fileInput.files[0];
            if (!file) return;

            // Validação de Tipo e Tamanho (Máx 10MB)
            const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
            const maxSize = 10 * 1024 * 1024; // 10MB

            if (!validTypes.includes(file.type)) {
                alert("Por favor, envie apenas arquivos PDF ou Imagens (JPG/PNG/WebP).");
                return;
            }

            if (file.size > maxSize) {
                alert("O arquivo é muito grande. O limite máximo permitido é de 10MB.");
                return;
            }

            const timestamp = Date.now();
            const cleanFileName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
            const storagePath = `atestados_temp/${timestamp}_${cleanFileName}`;
            const storageRef = ref(storage, storagePath);

            // Iniciar upload
            btnSubmit.disabled = true;
            const btnSpan = btnSubmit.querySelector('span');
            const progressPercent = progressContainer.querySelector('.progress-percentage');
            
            if (btnSpan) btnSpan.innerText = 'Enviando...';
            progressContainer.style.display = 'block';

            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                    progressBar.style.width = progress + '%';
                    if (progressPercent) progressPercent.innerText = progress + '%';
                }, 
                (error) => {
                    console.error("Erro no upload:", error);
                    alert("Erro ao enviar arquivo. Verifique sua conexão e tente novamente.");
                    btnSubmit.disabled = false;
                    if (btnSpan) btnSpan.innerText = 'Tentar Novamente';
                }, 
                () => {
                    // Mensagem de Sucesso
                    if (btnSpan) btnSpan.innerText = '✅ Enviado!';
                    setTimeout(() => {
                        alert("O seu atestado já está disponível para o Inspetor.");
                        closeUploadModal();
                    }, 1000);
                }
            );
        });
    }

    // Drag and Drop
    if (dropArea) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropArea.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropArea.classList.remove('dragover');
            }, false);
        });

        dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (fileInput) {
                fileInput.files = files;
                handleFileSelection(files[0]);
            }
        }, false);
    }

    // Inicializa
    initAtestadosFeature();
});

