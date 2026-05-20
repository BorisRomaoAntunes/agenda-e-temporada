import { db } from "../firebase-config.js";
import { collection, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const calendarioSection = document.getElementById('calendario-section');
const pdfGrid = document.querySelector('.pdf-grid');
const mobileButtons = document.querySelector('.mobile-buttons');
const btnMesModal = document.getElementById('btn-open-mes-modal');
const mesModal = document.getElementById('mes-modal');
const btnCloseMesModal = document.getElementById('btn-close-mes-modal');
const mesModalBody = document.getElementById('mes-modal-body');
const mesAtualLabel = document.getElementById('mes-atual-label');
const calendarioStrip = document.getElementById('calendario-strip');
const eventosContainer = document.getElementById('calendario-eventos');
const avisosSemanaContainer = document.getElementById('avisos-semana-container');
const btnHoje = document.getElementById('btn-hoje');
const filtroBtns = document.querySelectorAll('.filtro-btn');
const proximaAtividadeTicker = document.getElementById('proxima-atividade-ticker');

// State
let eventosCache = [];
let avisosSemanaCache = [];
let dataSelecionada = new Date();
let mesVisivelAtual = new Date();
let filtroAtual = 'todos'; // todos, ensaio_tutti, ensaio_naipe, concerto

// Initialize
function initCalendario() {
    console.log("[Calendário] Inicializando Módulo...");
    
    // Verificação de elementos críticos
    console.log("[Calendário] Verificando elementos DOM:", {
        calendarioSection: !!calendarioSection,
        pdfGrid: !!pdfGrid,
        mobileButtons: !!mobileButtons
    });

    setupListeners();
    checkFeatureFlag();
}

function checkFeatureFlag() {
    const configRef = doc(db, 'config', 'app');
    console.log("[Calendário] Escutando mudanças na flag de feature...");
    
    onSnapshot(configRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const showCalendar = data.show_new_calendar === true;
            console.log("[Calendário] Flag 'show_new_calendar' recebida:", showCalendar);
            
            toggleCalendarVisibility(showCalendar);
            
            if (showCalendar) {
                loadEventos();
                loadAvisosSemana();
            }
        } else {
            console.warn("[Calendário] Documento de configuração 'config/app' não encontrado.");
            toggleCalendarVisibility(false);
        }
    }, (error) => {
        console.error("[Calendário] Erro ao escutar flag:", error);
    });
}

function toggleCalendarVisibility(show) {
    console.log("[Calendário] Alternando visibilidade. Show =", show);
    
    if (show) {
        if (pdfGrid) pdfGrid.style.display = 'none';
        if (mobileButtons) mobileButtons.style.display = 'none';
        if (calendarioSection) {
            calendarioSection.style.display = 'block';
            console.log("[Calendário] Seção de calendário ativada (display: block)");
        }
    } else {
        if (pdfGrid) pdfGrid.style.display = 'flex';
        if (mobileButtons) mobileButtons.style.display = 'flex';
        if (calendarioSection) {
            calendarioSection.style.display = 'none';
            console.log("[Calendário] Seção de calendário desativada (display: none)");
        }
    }
}

function loadEventos() {
    const cachedEventos = localStorage.getItem('oer_eventos_cache');
    const cacheTime = localStorage.getItem('oer_eventos_cache_time');
    
    if (cachedEventos && cacheTime && (Date.now() - parseInt(cacheTime) < 3600000)) {
        eventosCache = JSON.parse(cachedEventos);
        renderizarRegua();
        renderizarEventosDiaSelecionado();
    }

    const eventosRef = collection(db, 'eventos');
    onSnapshot(eventosRef, { includeMetadataChanges: true }, (snapshot) => {
        const events = [];
        snapshot.forEach(doc => {
            events.push({ id: doc.id, ...doc.data() });
        });
        eventosCache = events;
        localStorage.setItem('oer_eventos_cache', JSON.stringify(events));
        localStorage.setItem('oer_eventos_cache_time', Date.now().toString());
        
        renderizarRegua();
        renderizarEventosDiaSelecionado();
    }, (error) => {
        console.error("Erro ao carregar eventos:", error);
        // Fallback to cache ignoring TTL if offline
        if (!navigator.onLine && cachedEventos) {
            eventosCache = JSON.parse(cachedEventos);
            renderizarRegua();
            renderizarEventosDiaSelecionado();
        }
    });
}

function loadAvisosSemana() {
    const cachedAvisos = localStorage.getItem('oer_avisos_cache');
    const cacheTime = localStorage.getItem('oer_avisos_cache_time');
    
    if (cachedAvisos && cacheTime && (Date.now() - parseInt(cacheTime) < 3600000)) {
        avisosSemanaCache = JSON.parse(cachedAvisos);
        renderizarAvisosSemana();
    }

    const avisosRef = collection(db, 'avisos_semana');
    onSnapshot(avisosRef, { includeMetadataChanges: true }, (snapshot) => {
        const avisos = [];
        snapshot.forEach(doc => {
            avisos.push({ id: doc.id, ...doc.data() });
        });
        avisosSemanaCache = avisos;
        localStorage.setItem('oer_avisos_cache', JSON.stringify(avisos));
        localStorage.setItem('oer_avisos_cache_time', Date.now().toString());
        
        renderizarAvisosSemana();
    }, (error) => {
        console.error("Erro ao carregar avisos:", error);
        if (!navigator.onLine && cachedAvisos) {
            avisosSemanaCache = JSON.parse(cachedAvisos);
            renderizarAvisosSemana();
        }
    });
}

function setupListeners() {
    // Sempre abre no dia atual — ignorar parâmetro de URL para evitar abrir em datas antigas
    // Limpa qualquer ?data= da URL sem recarregar a página
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('data')) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
    }

    // Garante que sempre inicia hoje
    dataSelecionada = new Date();
    dataSelecionada.setHours(0,0,0,0);
    mesVisivelAtual = new Date(dataSelecionada);

    btnHoje.addEventListener('click', () => {
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        dataSelecionada = hoje;
        mesVisivelAtual = new Date(dataSelecionada);
        
        // Resetar filtro para ver hoje
        filtroAtual = 'todos';
        filtroBtns.forEach(b => {
            b.classList.remove('ativo');
            if (b.dataset.filtro === 'todos') b.classList.add('ativo');
        });

        renderizarRegua();
        renderizarEventosDiaSelecionado();
    });

    filtroBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filtroBtns.forEach(b => b.classList.remove('ativo'));
            e.currentTarget.classList.add('ativo');
            filtroAtual = e.currentTarget.getAttribute('data-filtro');
            renderizarRegua();
            renderizarEventosDiaSelecionado();
        });
    });

    btnMesModal.addEventListener('click', () => {
        abrirMesModal();
    });

    btnCloseMesModal.addEventListener('click', () => {
        mesModal.style.display = 'none';
    });
    
    // IntersectionObserver setup happens inside renderizarRegua now
}

function renderizarRegua() {
    calendarioStrip.innerHTML = '';
    
    // Gera 60 dias antes e 120 dias depois
    const hoje = new Date(dataSelecionada);
    const startDate = new Date(hoje);
    startDate.setDate(startDate.getDate() - 60);
    
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    
    mesAtualLabel.textContent = `${meses[mesVisivelAtual.getMonth()]} ${mesVisivelAtual.getFullYear()}`;
    
    let elToScroll = null;

    for (let i = 0; i < 180; i++) {
        const dateObj = new Date(startDate);
        dateObj.setDate(startDate.getDate() + i);
        dateObj.setHours(0,0,0,0);
        
        const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        
        // Find events for this day
        const eventsForDay = eventosCache.filter(e => e.date === dateStr);
        
        const card = document.createElement('div');
        card.className = 'dia-card';
        card.dataset.date = dateStr;
        card.dataset.month = dateObj.getMonth();
        card.dataset.year = dateObj.getFullYear();
        
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        const isHoje = dateObj.getTime() === hoje.getTime();
        const isSelecionado = dateObj.getTime() === dataSelecionada.getTime();
        
        if (isSelecionado) {
            card.classList.add('selecionado');
            elToScroll = card;
        }
        if (isHoje) {
            card.classList.add('hoje');
        }

        // Apply filters to diminish non-matching days (optional, can just show dots)
        if (filtroAtual !== 'todos') {
            const hasMatchingEvent = eventsForDay.some(e => e.tipo === filtroAtual);
            if (!hasMatchingEvent && eventsForDay.length > 0) {
                card.classList.add('opaco');
            }
        }

        const spanDiaSemana = document.createElement('span');
        spanDiaSemana.className = 'dia-semana';
        spanDiaSemana.textContent = diasSemana[dateObj.getDay()];

        const spanDiaMes = document.createElement('span');
        spanDiaMes.className = 'dia-mes';
        spanDiaMes.textContent = dateObj.getDate();
        
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'dots-container';
        
        eventsForDay.slice(0,3).forEach(e => {
            const dot = document.createElement('span');
            dot.className = `dot dot-${e.tipo === 'ensaio_tutti' ? 'tutti' : (e.tipo === 'concerto' ? 'concerto' : 'naipe')}`;
            dotsContainer.appendChild(dot);
        });
        if(eventsForDay.length > 3) {
            const dotPlus = document.createElement('span');
            dotPlus.className = 'dot-plus';
            dotPlus.textContent = '+';
            dotsContainer.appendChild(dotPlus);
        }

        card.appendChild(spanDiaSemana);
        card.appendChild(spanDiaMes);
        card.appendChild(dotsContainer);
        
        card.addEventListener('click', () => {
            document.querySelectorAll('.dia-card').forEach(c => c.classList.remove('selecionado'));
            card.classList.add('selecionado');
            dataSelecionada = dateObj;
            mesVisivelAtual = new Date(dataSelecionada);
            mesAtualLabel.textContent = `${meses[mesVisivelAtual.getMonth()]} ${mesVisivelAtual.getFullYear()}`;
            renderizarEventosDiaSelecionado();
            
            // Centralizar o card clicado no strip com scroll suave
            const containerRect = calendarioStrip.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const cardCenterRelativo = (cardRect.left - containerRect.left)
                + calendarioStrip.scrollLeft
                + (cardRect.width / 2);
            calendarioStrip.scrollTo({
                left: Math.max(0, cardCenterRelativo - containerRect.width / 2),
                behavior: 'smooth'
            });

            // update URL
            const url = new URL(window.location);
            url.searchParams.set('data', dateStr);
            window.history.pushState({}, '', url);
        });

        calendarioStrip.appendChild(card);
    }
    
    // Scroll para centralizar o dia selecionado no strip
    if (elToScroll) {
        const centrarCard = (behavior = 'smooth') => {
            // getBoundingClientRect é relativo ao viewport, então calculamos a diferença
            // para obter a posição do card dentro do container de scroll
            const containerRect = calendarioStrip.getBoundingClientRect();
            const cardRect = elToScroll.getBoundingClientRect();
            
            // Posição do centro do card em relação ao início do container de scroll
            const cardCenterRelativo = (cardRect.left - containerRect.left)
                + calendarioStrip.scrollLeft
                + (cardRect.width / 2);
            
            // Queremos que o centro do card fique no centro do container
            const targetScroll = cardCenterRelativo - (containerRect.width / 2);
            
            calendarioStrip.scrollTo({
                left: Math.max(0, targetScroll),
                behavior
            });
        };

        // Duplo rAF garante que o flex layout foi calculado pelo browser
        requestAnimationFrame(() => {
            requestAnimationFrame(() => centrarCard('instant'));
        });
    }
    
    setupIntersectionObserver();
}

let stripObserver;
function setupIntersectionObserver() {
    if (stripObserver) {
        stripObserver.disconnect();
    }

    const observerOptions = {
        root: calendarioStrip,
        rootMargin: '0px',
        threshold: 0.5 // trigger when 50% of the card is visible
    };

    stripObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const month = parseInt(entry.target.dataset.month);
                const year = parseInt(entry.target.dataset.year);
                
                // Only update label if it's different to avoid flutter
                if (mesVisivelAtual.getMonth() !== month || mesVisivelAtual.getFullYear() !== year) {
                    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                    mesAtualLabel.textContent = `${meses[month]} ${year}`;
                    mesVisivelAtual = new Date(year, month, 1);
                    
                    // Snap to the first day of the new month
                    const firstDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
                    const firstDayCard = calendarioStrip.querySelector(`.dia-card[data-date="${firstDayStr}"]`);
                    if (firstDayCard) {
                        setTimeout(() => {
                            firstDayCard.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                        }, 100);
                    }
                }
            }
        });
    }, observerOptions);

    const cards = calendarioStrip.querySelectorAll('.dia-card');
    cards.forEach(card => stripObserver.observe(card));
}

function formatarTextoSimples(texto) {
    if (!texto) return '';
    // 1. Escapar HTML para evitar XSS
    let htmlEscapado = texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // 2. Converter as tags seguras digitadas literalmente (ex: &lt;b&gt; para <strong>)
    htmlEscapado = htmlEscapado
        .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gi, '<strong>$1</strong>')
        .replace(/&lt;strong&gt;(.*?)&lt;\/strong&gt;/gi, '<strong>$1</strong>')
        .replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gi, '<em>$1</em>')
        .replace(/&lt;em&gt;(.*?)&lt;\/em&gt;/gi, '<em>$1</em>');

    // 3. Converter Markdown simples (**texto**, __texto__, *texto*, _texto_)
    htmlEscapado = htmlEscapado
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>');

    return htmlEscapado;
}

function formatarTextoComIcones(texto, mapsUrlCallback) {
    if (!texto) return '';
    
    // Regex de Google Maps
    const mapsRegex = /(https?:\/\/(?:maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\/[^\s\)\],]+)/i;
    
    let mapsUrl = '';
    let textoLimpo = texto;
    const match = texto.match(mapsRegex);
    if (match) {
        mapsUrl = match[1];
        textoLimpo = texto.replace(mapsUrl, '').replace(/\s+/g, ' ').trim();
        if (mapsUrlCallback && typeof mapsUrlCallback === 'function') {
            mapsUrlCallback(mapsUrl);
        }
    }
    
    let htmlFormatado = formatarTextoSimples(textoLimpo);
    
    if (mapsUrl) {
        htmlFormatado += ` <a href="${mapsUrl}" target="_blank" class="inline-maps-link" title="Ver no Google Maps"><i data-lucide="map"></i></a>`;
    }
    
    return htmlFormatado;
}

function detectarIntervalo(str) {
    if (!str) return false;
    const normalized = str.toLowerCase().replace(/[^a-z0-9]/gi, '').trim();
    return normalized === 'intervalo';
}

function renderizarEventosDiaSelecionado() {
    eventosContainer.innerHTML = '';
    
    const dateStr = `${dataSelecionada.getFullYear()}-${String(dataSelecionada.getMonth() + 1).padStart(2, '0')}-${String(dataSelecionada.getDate()).padStart(2, '0')}`;
    
    let eventsForDay = eventosCache.filter(e => e.date === dateStr);
    
    if (filtroAtual !== 'todos') {
        eventsForDay = eventsForDay.filter(e => e.tipo === filtroAtual);
    }
    
    if (eventsForDay.length === 0) {
        eventosContainer.innerHTML = `
            <div class="evento-empty-state">
                <i data-lucide="music"></i>
                <p>Dia livre 🎶 — Nenhum evento agendado.</p>
            </div>
        `;
        lucide.createIcons();
        atualizarTickerProximaAtividade();
        return;
    }
    
    // Se há eventos, oculta o ticker
    if (proximaAtividadeTicker) {
        proximaAtividadeTicker.style.display = 'none';
        proximaAtividadeTicker.innerHTML = '';
    }
    
    eventsForDay.forEach(evento => {
        const card = document.createElement('div');
        card.className = 'evento-card';
        
        // Detecção de status de cancelamento (fallback por texto + status explícito)
        const txtCompleto = `${evento.descricaoEnsaio || ''} ${evento.concertoNome || ''} ${evento.local || ''}`.toLowerCase();
        const isCancelado = evento.status === 'Cancelado' || 
                            txtCompleto.includes('cancelado') || 
                            txtCompleto.includes('ensaio cancelado') || 
                            txtCompleto.includes('concerto cancelado') || 
                            txtCompleto.includes('evento cancelado') || 
                            txtCompleto.includes('cancelados');
        
        if (isCancelado) {
            card.classList.add('status-cancelado');
        }
        
        // 1. Determinar o título/header com base no tipo
        let tipoTexto = '';
        if (evento.tipo === 'ensaio_tutti') {
            tipoTexto = 'Ensaio Tutti';
        } else if (evento.tipo === 'ensaio_naipe') {
            tipoTexto = `Ensaio de Naipe${evento.naipe ? ` (${evento.naipe})` : ''}`;
        } else if (evento.tipo === 'concerto') {
            tipoTexto = 'Concerto';
        } else {
            tipoTexto = 'Evento';
        }
        
        const horarioStr = `${evento.horarioInicio || '?'} - ${evento.horarioFim || '?'}`;
        const headerText = `🗓️${tipoTexto}, ${horarioStr}`;
        
        // 2. Construir a linha de local (com link do Google Maps se houver)
        const mapsRegex = /(https?:\/\/(?:maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\/[^\s\)\],]+)/i;
        
        let localMapsUrl = evento.localMapsUrl || '';
        let localTextoLimpo = evento.local || '';
        let localComplementoLimpo = evento.localComplemento || '';

        // Extrair se houver URL no local
        const matchLocal = localTextoLimpo.match(mapsRegex);
        if (matchLocal) {
            if (!localMapsUrl) localMapsUrl = matchLocal[1];
            localTextoLimpo = localTextoLimpo.replace(matchLocal[1], '').replace(/\s+/g, ' ').trim();
        }

        // Extrair se houver URL no complemento
        const matchComp = localComplementoLimpo.match(mapsRegex);
        if (matchComp) {
            if (!localMapsUrl) localMapsUrl = matchComp[1];
            localComplementoLimpo = localComplementoLimpo.replace(matchComp[1], '').replace(/\s+/g, ' ').trim();
        }

        // Extrair se houver URL nos avisos
        if (evento.avisos && evento.avisos.length > 0) {
            evento.avisos.forEach(aviso => {
                if (typeof aviso === 'string') {
                    const matchAviso = aviso.match(mapsRegex);
                    if (matchAviso && !localMapsUrl) {
                        localMapsUrl = matchAviso[1];
                    }
                }
            });
        }
        
        let localTexto = `${localTextoLimpo || 'Local a definir'}`;
        if (localComplementoLimpo) {
            localTexto += ` - ${localComplementoLimpo}`;
        }
        
        let localHtml = '';
        if (localMapsUrl) {
            localHtml = `
                <span class="evento-local-text"><i data-lucide="map-pin"></i> ${localTexto}</span>
                <a href="${localMapsUrl}" target="_blank" class="evento-local-link-icon" title="Ver no Google Maps"><i data-lucide="map"></i></a>
            `;
        } else {
            localHtml = `<span class="evento-local-text"><i data-lucide="map-pin"></i> ${localTexto}</span>`;
        }
        
        // 3. Nome do concerto ou descrição do ensaio (se houver)
        let detalheHtml = '';
        if (evento.tipo === 'concerto' && evento.concertoNome) {
            detalheHtml = `<div class="evento-detalhe-nome">${evento.concertoNome}</div>`;
        } else if (evento.descricaoEnsaio) {
            detalheHtml = `<div class="evento-detalhe-nome">${evento.descricaoEnsaio}</div>`;
        }
        
        // 4. Repertório com formatação simples e detecção de intervalo
        let repertorioHtml = '';
        if (evento.repertorio && evento.repertorio.length > 0) {
            repertorioHtml = '<div class="evento-repertorio"><h4>Repertório:</h4><ul>';
            evento.repertorio.forEach(item => {
                const itemFormatado = formatarTextoSimples(item);
                if (detectarIntervalo(item)) {
                    repertorioHtml += `<li class="intervalo">${itemFormatado}</li>`;
                } else if (item.toLowerCase() === "repertório completo") {
                    repertorioHtml += `<li><em>${itemFormatado}</em></li>`;
                } else {
                    repertorioHtml += `<li>${itemFormatado}</li>`;
                }
            });
            repertorioHtml += '</ul></div>';
        }
        
        // 5. Avisos do dia (somente se houver avisos)
        let avisosHtml = '';
        if (evento.avisos && evento.avisos.length > 0) {
            avisosHtml = '<div class="evento-avisos"><h4>Avisos do dia</h4><ul>';
            evento.avisos.forEach(aviso => {
                avisosHtml += `<li>${formatarTextoComIcones(aviso)}</li>`;
            });
            avisosHtml += '</ul></div>';
        }
        
        const canceladoBadge = isCancelado ? `<span class="status-cancelado-badge"><i data-lucide="x-circle"></i> Cancelado</span>` : '';
        
        // Indicador de atualização recente
        const updatedDot = evento.updatedAt ? `<span class="evento-updated-dot" title="Atualizado recentemente"></span>` : '';
        
        card.innerHTML = `
            <div class="evento-card-header-linha">
                <h3 class="evento-titulo-novo">${headerText} ${canceladoBadge} ${updatedDot}</h3>
                <span class="cronograma-aviso">Cronograma sujeito a alterações.</span>
            </div>
            
            <div class="evento-local-linha">
                ${localHtml}
            </div>
            
            ${detalheHtml}
            ${avisosHtml}
            ${repertorioHtml}
        `;
        eventosContainer.appendChild(card);
    });
    
    lucide.createIcons();
}

function renderizarAvisosSemana() {
    if (avisosSemanaCache.length === 0) {
        avisosSemanaContainer.style.display = 'none';
        return;
    }
    
    avisosSemanaContainer.style.display = 'block';
    avisosSemanaContainer.innerHTML = '';
    
    avisosSemanaCache.forEach(aviso => {
        const div = document.createElement('div');
        div.className = `aviso-semana-item aviso-${aviso.tipo || 'info'}`;
        div.innerHTML = `
            <i data-lucide="alert-circle"></i>
            <span>${formatarTextoComIcones(aviso.texto)}</span>
        `;
        avisosSemanaContainer.appendChild(div);
    });
    lucide.createIcons();
}

function atualizarTickerProximaAtividade() {
    if (!proximaAtividadeTicker) return;

    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const selecionadaStr = `${dataSelecionada.getFullYear()}-${String(dataSelecionada.getMonth() + 1).padStart(2, '0')}-${String(dataSelecionada.getDate()).padStart(2, '0')}`;

    // Só mostra o ticker se o dia selecionado for HOJE e estiver vazio
    // Ou se o usuário quiser ver a próxima atividade de qualquer forma
    // O áudio sugere: "se naquele dia não tiver nada... próxima atividade dia tal"
    
    // Filtrar eventos futuros (a partir de hoje)
    const eventosFuturos = eventosCache
        .filter(e => e.date > selecionadaStr)
        .sort((a, b) => a.date.localeCompare(b.date));

    if (eventosFuturos.length > 0) {
        const proximo = eventosFuturos[0];
        const [ano, mes, dia] = proximo.date.split('-');
        const dataFormatada = `${dia}/${mes}`;

        const textoEvento = proximo.concertoNome || proximo.descricaoEnsaio || 'Evento';
        const textoMarquee = `📅 Próxima Atividade: ${dataFormatada} · ${textoEvento}`;

        proximaAtividadeTicker.innerHTML = `
            <div class="ticker-track">
                <span class="ticker-text">${textoMarquee}</span>
                <span class="ticker-text" aria-hidden="true">${textoMarquee}</span>
            </div>
        `;
        proximaAtividadeTicker.style.display = 'flex'; // mostra como flex

        proximaAtividadeTicker.onclick = () => {
            dataSelecionada = new Date(ano, mes - 1, dia);
            dataSelecionada.setHours(0,0,0,0);
            mesVisivelAtual = new Date(dataSelecionada);
            renderizarRegua();
            renderizarEventosDiaSelecionado();
        };
    } else {
        proximaAtividadeTicker.style.display = 'none'; // oculta quando não há próxima atividade
        proximaAtividadeTicker.innerHTML = '';
    }
}

function abrirMesModal() {
    mesModal.style.display = 'flex';
    mesModalBody.innerHTML = '';
    
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    // Identifica o ano e mês atualmente ativos no calendário
    const anoSelecionadoCalendario = mesVisivelAtual.getFullYear();
    const mesSelecionadoCalendario = mesVisivelAtual.getMonth();
    
    // Define os anos que estarão disponíveis nas abas (ano atual e ano seguinte)
    const anoBase = new Date().getFullYear();
    const anos = [anoBase, anoBase + 1];
    
    // Garante que se o calendário estiver em um ano fora dessa faixa por algum motivo, ele seja incluído nas abas
    if (!anos.includes(anoSelecionadoCalendario)) {
        anos[0] = anoSelecionadoCalendario;
        anos[1] = anoSelecionadoCalendario + 1;
    }
    
    // O ano inicialmente ativo no modal começa como o ano que está visível no calendário
    let anoAtivoModal = anoSelecionadoCalendario;
    
    // Criação do container horizontal de abas para seleção do ano
    const tabContainer = document.createElement('div');
    tabContainer.className = 'year-selector-tabs';
    
    // Criação da grade única e compacta de meses
    const grid = document.createElement('div');
    grid.className = 'mes-modal-grid';
    
    // Função reativa para renderizar os botões de meses do ano ativo
    function renderizarGradeMeses(ano) {
        grid.innerHTML = '';
        meses.forEach((mes, index) => {
            const btn = document.createElement('button');
            btn.className = 'btn-mes-option';
            btn.textContent = mes;
            
            // Marca o mês como ativo apenas se coincidir com o ano e mês atualmente exibidos no calendário
            if (ano === anoSelecionadoCalendario && index === mesSelecionadoCalendario) {
                btn.classList.add('ativo');
            }
            
            btn.addEventListener('click', () => {
                dataSelecionada = new Date(ano, index, 1);
                mesVisivelAtual = new Date(dataSelecionada);
                renderizarRegua();
                renderizarEventosDiaSelecionado();
                mesModal.style.display = 'none';
            });
            
            grid.appendChild(btn);
        });
    }
    
    // Criação das abas de anos dinamicamente
    anos.forEach(ano => {
        const tabBtn = document.createElement('button');
        tabBtn.className = 'year-tab';
        tabBtn.textContent = ano;
        
        if (ano === anoAtivoModal) {
            tabBtn.classList.add('active');
        }
        
        tabBtn.addEventListener('click', () => {
            if (anoAtivoModal === ano) return;
            
            // Alterna o estado ativo visual das abas
            tabContainer.querySelectorAll('.year-tab').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            
            anoAtivoModal = ano;
            
            // Aplica animação fluida de transição (fade-out seguido de fade-in)
            grid.classList.add('fade-out');
            setTimeout(() => {
                renderizarGradeMeses(ano);
                grid.classList.remove('fade-out');
            }, 180); // Transição correspondente à duração no CSS (180ms)
        });
        
        tabContainer.appendChild(tabBtn);
    });
    
    // Monta a estrutura final dentro do corpo do modal
    mesModalBody.appendChild(tabContainer);
    mesModalBody.appendChild(grid);
    
    // Primeira renderização da grade com o ano ativo
    renderizarGradeMeses(anoAtivoModal);
}

// Inicia
initCalendario();
