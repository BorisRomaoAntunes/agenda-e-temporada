/**
 * version-tracker.js — Sistema de Rastreamento de Versões de PDFs
 * Localização: assets/js/public/
 * 
 * Extrai versão do nome do arquivo e exibe badges com indicador "NOVO"
 * Carrega PDFs dinamicamente a partir do Firebase Firestore (real-time)
 */

import { app } from "../firebase-config.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const db = getFirestore(app);

class PDFVersionTracker {
    constructor() {
        this.storageKey = 'oer_pdf_versions';
        this.configPath = 'pdf-config.json';
        this.init();
    }

    /**
     * Inicializa o sistema
     */
    async init() {
        // Aguarda DOM carregar
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            await this.start();
        }
    }

    /**
     * Inicia o carregamento dinâmico
     */
    async start() {
        try {
            // Detecta tablets e dispositivos móveis para exibir view correta
            this.handleDeviceLayout();

            // Ouve as mudanças do Firestore em tempo real
            this.listenToFirestore();
        } catch (error) {
            console.error('Erro na inicialização:', error);
            // Fallback para o arquivo local caso falhe
            this.fallbackToLocalConfig();
        }
    }

    /**
     * Escuta atualizações do Firestore em tempo real
     */
    listenToFirestore() {
        const docRef = doc(db, 'config', 'pdfs');
        onSnapshot(docRef, async (docSnap) => {
            if (docSnap.exists()) {
                const config = docSnap.data();
                this.updatePDFElements(config);
                this.setupBadges();
            } else {
                console.warn('Documento não existe no Firestore, caindo para config local');
                this.fallbackToLocalConfig();
            }
        }, (error) => {
            console.error('Erro ao escutar Firestore:', error);
            this.fallbackToLocalConfig();
        });
    }

    async fallbackToLocalConfig() {
        try {
            const config = await this.loadConfig();
            this.updatePDFElements(config);
            this.setupBadges();
        } catch (e) {
            console.error('Falha crítica ao carregar PDFs', e);
        }
    }

    /**
     * Detecta tablets e dispositivos touch e exibe a interface correta.
     * Tablets (Android, iPad, etc.) recebem a view mobile (botões de download),
     * pois navegadores móveis geralmente não renderizam PDFs em iframes.
     */
    handleDeviceLayout() {
        const ua = navigator.userAgent;

        // Detecta tablets Android (tem "Android" mas NÃO tem "Mobile" — indica tablet)
        const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);

        // Detecta iPad (iOS moderno reporta como "Macintosh" mas tem touch)
        const isIPad = /iPad/i.test(ua) ||
            (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

        // Detecta outros tablets genéricos por palavras-chave no UA
        const isGenericTablet = /Tablet|tablet/i.test(ua);

        const isTablet = isAndroidTablet || isIPad || isGenericTablet;

        // Detecta Samsung Browser
        const isSamsungBrowser = navigator.userAgent.includes('SamsungBrowser');

        if (isSamsungBrowser) {
            document.body.classList.add('force-mobile');
            console.info('[OER] Samsung Browser detectado — forçando layout mobile via CSS.');
        }

        if (isTablet) {
            // Esconde o grid de visualizadores (iframes)
            const grid = document.querySelector('.pdf-grid');
            if (grid) grid.style.display = 'none';

            // Exibe os controles mobile com botões de download
            const mobileControls = document.querySelector('.mobile-controls');
            if (mobileControls) {
                mobileControls.style.display = 'flex';
            }

            // Atualiza o texto para tablet
            const mobileMsg = mobileControls && mobileControls.querySelector('p');
            if (mobileMsg) {
                mobileMsg.textContent = 'Está no tablet? Clique em um dos botões abaixo para abrir o PDF.';
            }

            console.info('[OER] Tablet detectado — exibindo modo mobile.');
        }
    }


    /**
     * Carrega arquivo de configuração JSON (Fallback)
     */
    async loadConfig() {
        const response = await fetch(this.configPath);
        if (!response.ok) {
            throw new Error(`Erro ao carregar ${this.configPath}: ${response.status}`);
        }
        return await response.json();
    }

    /**
     * Atualiza elementos HTML com PDFs da configuração
     */
    updatePDFElements(config) {
        const { pdfs } = config;

        // Atualiza cada tipo de PDF
        Object.keys(pdfs).forEach(tipo => {
            const pdfInfo = pdfs[tipo];
            // Se vier do Firestore tem .url, se vier do local é apenas o path relativo
            const caminhoPDF = pdfInfo.url || `assets/files/${pdfInfo.arquivo}`;
            // O nome do arquivo real para controle de versão
            const nomeArquivo = pdfInfo.arquivo;
            // Versão de exibição customizada vinda do banco de dados (ex: 1.1)
            const displayVersion = pdfInfo.displayVersion;

            // Atualiza iframes (desktop)
            const iframes = document.querySelectorAll(`[data-pdf-type="${tipo}"]`);
            iframes.forEach(iframe => {
                iframe.src = caminhoPDF;
                // Atualiza também o wrapper para badges
                const wrapper = iframe.closest('.pdf-wrapper');
                if (wrapper) {
                    wrapper.setAttribute('data-pdf-path', nomeArquivo);
                    if (displayVersion) wrapper.setAttribute('data-pdf-version', displayVersion);
                }
            });

            // Atualiza botões mobile
            const botoes = document.querySelectorAll(`[data-pdf-button="${tipo}"]`);
            botoes.forEach(botao => {
                botao.href = caminhoPDF;
                botao.setAttribute('data-pdf-path', nomeArquivo);
                if (displayVersion) botao.setAttribute('data-pdf-version', displayVersion);
            });
        });
    }

    /**
     * Extrai versão do nome do arquivo
     * Formatos suportados: _v2.pdf, _v2.1.pdf, _v3.2, _2.1, v3.2
     */
    extractVersion(filename) {
        // Remove extensão se houver
        const nameWithoutExt = filename.replace(/\.pdf$/i, '');

        // Tenta padrões: _v2.1, _v2, _2.1, _2, v2.1, v2
        const patterns = [
            /_v([\d.]+)$/i,  // _v2.1 ou _v2
            /_([\d.]+)$/,    // _2.1 ou _2
            /v([\d.]+)$/i    // v2.1 ou v2
        ];

        for (const pattern of patterns) {
            const match = nameWithoutExt.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null; // Sem versão encontrada
    }

    /**
     * Obtém nome base do PDF (sem versão)
     */
    getBaseName(filename) {
        return filename
            .replace(/\.pdf$/i, '')
            .replace(/_v?[\d.]+$/i, ''); // Remove _v2.1, _v2, _2.1, etc
    }

    /**
     * Carrega versões salvas do localStorage
     */
    loadSavedVersions() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.warn('Erro ao carregar versões salvas:', e);
            return {};
        }
    }

    /**
     * Salva versões no localStorage
     */
    saveVersions(versions) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(versions));
        } catch (e) {
            console.warn('Erro ao salvar versões:', e);
        }
    }

    /**
     * Verifica se é uma nova versão
     */
    isNewVersion(baseName, currentVersion) {
        if (!currentVersion) return false;

        const savedVersions = this.loadSavedVersions();
        const savedVersion = savedVersions[baseName];

        if (!savedVersion) return true; // Primeira vez vendo

        return parseInt(currentVersion) > parseInt(savedVersion);
    }

    /**
     * Marca versão como vista
     */
    markAsSeen(baseName, version) {
        const versions = this.loadSavedVersions();
        versions[baseName] = version;
        this.saveVersions(versions);
    }

    /**
     * Cria elemento do badge
     */
    createBadge(version, isNew, type) {
        const badge = document.createElement('div');
        badge.className = 'version-badge';
        if (isNew) badge.classList.add('new');

        // Cria a estrela do badge
        const badgeStar = document.createElement('div');
        badgeStar.className = 'badge-star';

        const versionSpan = document.createElement('span');
        versionSpan.className = 'badge-version';
        versionSpan.textContent = `v${version}`;

        badgeStar.appendChild(versionSpan);
        badge.appendChild(badgeStar);

        // Se for novo, adiciona o label
        if (isNew) {
            const labelText = type === 'temporada' ? 'ATUALIZAÇÃO TEMPORADA' : 'ATUALIZAÇÃO AGENDA';
            const labelSpan = document.createElement('span');
            labelSpan.className = 'badge-new-label';
            labelSpan.textContent = labelText;
            badge.appendChild(labelSpan);
        }

        return badge;
    }

    /**
     * Configura badges para todos os PDFs
     */
    setupBadges() {
        // Encontra todos os elementos com PDFs
        const pdfElements = document.querySelectorAll('[data-pdf-path]');

        pdfElements.forEach(element => {
            const pdfPath = element.getAttribute('data-pdf-path');
            const displayVersion = element.getAttribute('data-pdf-version');
            const filename = pdfPath.split('/').pop();

            // Pega a versão do atributo customizado (Firestore) ou extrai do arquivo antigo
            const version = displayVersion || this.extractVersion(filename);
            if (!version) return; // Sem versão no nome ou no bd

            const baseName = this.getBaseName(filename);
            const isNew = this.isNewVersion(baseName, version);
            // Tenta obter o tipo do PDF (temporada ou agenda)
            let type = element.getAttribute('data-pdf-type') || element.getAttribute('data-pdf-button');

            // Se não encontrou no elemento, tenta nos filhos (importante para o wrapper no desktop)
            if (!type) {
                const childWithType = element.querySelector('[data-pdf-type]');
                if (childWithType) type = childWithType.getAttribute('data-pdf-type');
            }

            // Cria e adiciona badge
            const badge = this.createBadge(version, isNew, type);
            element.appendChild(badge);

            // Adiciona listener para marcar como visto ao clicar diretamente
            element.addEventListener('click', () => {
                this.markAsSeen(baseName, version);
                if (badge && badge.parentNode) {
                    badge.remove();
                }
            });
        });

        // Configura remoção por interação global (Desktop)
        this.setupDesktopInteraction();
    }

    /**
     * Remove badges automaticamente ao detectar movimento ou clique no desktop
     */
    setupDesktopInteraction() {
        // Apenas para desktop (largura > 768px)
        if (window.innerWidth <= 768) return;

        const handleInteraction = () => {
            // Remove os listeners imediatamente para garantir que o timer seja disparado apenas uma vez
            window.removeEventListener('mousemove', handleInteraction);
            window.removeEventListener('click', handleInteraction);

            // Aguarda 3 segundos antes de iniciar o processo de remoção
            setTimeout(() => {
                const badges = document.querySelectorAll('.version-badge');
                if (badges.length === 0) return;

                badges.forEach(badge => {
                    const element = badge.closest('[data-pdf-path]');
                    if (element) {
                        const pdfPath = element.getAttribute('data-pdf-path');
                        if (pdfPath) {
                            const filename = pdfPath.split('/').pop();
                            const version = this.extractVersion(filename);
                            const baseName = this.getBaseName(filename);
                            if (version) this.markAsSeen(baseName, version);
                        }
                    }

                    // Efeito suave de saída antes de remover
                    badge.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                    badge.style.opacity = '0';
                    badge.style.transform = 'translateY(-20px) rotate(30deg) scale(0.8)';

                    setTimeout(() => {
                        if (badge.parentNode) badge.remove();
                    }, 500);
                });
            }, 3000);
        };

        // Adiciona listeners globais
        window.addEventListener('mousemove', handleInteraction, { once: false });
        window.addEventListener('click', handleInteraction, { once: false });
    }
}

// Inicializa automaticamente
new PDFVersionTracker();
