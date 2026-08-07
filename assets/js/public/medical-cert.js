/**
 * medical-cert.js — Módulo Público de Envio de Atestados
 * Gerencia a visibilidade do botão de upload e a lógica de envio para o Firebase Storage.
 *
 * v2 — Correções para compatibilidade com iPhone (iOS Safari):
 * - Usa uploadBytes em vez de uploadBytesResumable (evita protocolo resumable multi-etapa)
 * - Suporte a HEIC/HEIF (formato nativo da câmera Apple)
 * - Barra de progresso simulada para melhor UX
 */

import { db, storage } from '../firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

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
            if (docSnap.exists() && docSnap.data().atestadosEnabled === false) {
                atestadoBtn.style.display = 'none';
            } else {
                atestadoBtn.style.display = 'flex';
                // Reinicializa ícones do Lucide
                if (window.lucide) window.lucide.createIcons();
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
     * Barra de progresso simulada para uploadBytes (que não tem eventos de progresso).
     * Avança suavemente até 90%, depois salta para 100% ao concluir.
     */
    function startSimulatedProgress(progressBar, progressPercent) {
        let current = 0;
        const interval = setInterval(() => {
            // Avança mais rápido no início e desacelera conforme se aproxima de 90%
            const increment = (90 - current) * 0.06;
            current = Math.min(current + increment, 90);
            progressBar.style.width = current + '%';
            if (progressPercent) progressPercent.innerText = Math.round(current) + '%';
        }, 150);
        return interval;
    }

    /**
     * Normaliza o content-type do arquivo para garantir compatibilidade.
     * No iOS Safari, HEIC pode vir sem tipo ou com tipo incorreto.
     */
    function resolveContentType(file) {
        if (file.type) return file.type;
        // Inferir pelo nome se o tipo estiver vazio (pode acontecer no iOS)
        const ext = file.name.split('.').pop().toLowerCase();
        const extMap = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'heic': 'image/heic',
            'heif': 'image/heif',
        };
        return extMap[ext] || 'application/octet-stream';
    }

    /**
     * Lógica de Upload — usa uploadBytes para máxima compatibilidade com iOS Safari.
     * O uploadBytesResumable usa um protocolo de múltiplas requisições que pode
     * falhar no Safari iOS por restrições de CORS em sequência e gestão de sessão.
     */
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const file = fileInput.files[0];
            if (!file) return;

            // Tipos aceitos — inclui HEIC/HEIF (formato nativo de câmera do iPhone)
            const validTypes = [
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/heic',
                'image/heif',
                // iOS às vezes envia com tipo vazio; validamos pela extensão abaixo
                '',
            ];
            const validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
            const maxSize = 10 * 1024 * 1024; // 10MB

            const fileExt = file.name.split('.').pop().toLowerCase();
            const isValidType = validTypes.includes(file.type) || validExtensions.includes(fileExt);

            if (!isValidType) {
                alert("Por favor, envie apenas arquivos PDF ou Imagens (JPG, PNG, WebP, HEIC).");
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
            const contentType = resolveContentType(file);

            // Iniciar upload
            btnSubmit.disabled = true;
            const btnSpan = btnSubmit.querySelector('span');
            const progressPercent = progressContainer.querySelector('.progress-percentage');
            
            if (btnSpan) btnSpan.innerText = 'Enviando...';
            progressContainer.style.display = 'block';

            // Inicia barra de progresso simulada (uploadBytes não emite eventos de progresso)
            const progressInterval = startSimulatedProgress(progressBar, progressPercent);

            try {
                // uploadBytes: upload único e direto — sem protocolo resumable multi-etapa.
                // Muito mais estável no Safari iOS.
                await uploadBytes(storageRef, file, { contentType });

                // Upload concluído — finaliza a barra
                clearInterval(progressInterval);
                progressBar.style.width = '100%';
                if (progressPercent) progressPercent.innerText = '100%';

                if (btnSpan) btnSpan.innerText = '✅ Enviado!';
                setTimeout(() => {
                    alert("O seu atestado já está disponível para o Inspetor.");
                    closeUploadModal();
                }, 1000);

            } catch (error) {
                clearInterval(progressInterval);
                // Log detalhado para facilitar diagnóstico futuro
                console.error("Erro no upload:", error?.code, error?.message, error);
                alert("Erro ao enviar arquivo. Verifique sua conexão e tente novamente.");
                btnSubmit.disabled = false;
                if (btnSpan) btnSpan.innerText = 'Tentar Novamente';
                progressBar.style.width = '0%';
                if (progressPercent) progressPercent.innerText = '0%';
            }
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
