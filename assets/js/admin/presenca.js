import { auth, db } from "../firebase-config.js";
import { 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc,
    collection,
    addDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Referências DOM
const loader = document.getElementById("loader");
const toast = document.getElementById("toast");
const musiciansList = document.getElementById("musiciansList");
const searchInput = document.getElementById("searchInput");
const dateInput = document.getElementById("dateInput");
const btnBackAdmin = document.getElementById("btnBackAdmin");

// Drawer de Status
const overlay = document.getElementById("overlay");
const statusDrawer = document.getElementById("statusDrawer");
const drawerTitle = document.getElementById("drawerTitle");
const drawerSubtitle = document.getElementById("drawerSubtitle");
const btnCloseDrawer = document.getElementById("btnCloseDrawer");
const drawerHandleWrapper = document.getElementById("drawerHandle");

const optBtnPresenca = document.getElementById("optBtnPresenca");
const optBtnFalta = document.getElementById("optBtnFalta");
const optBtnAtestado = document.getElementById("optBtnAtestado");
const optBtnDispensa = document.getElementById("optBtnDispensa");
const optBtnNaoEscalado = document.getElementById("optBtnNaoEscalado");
const optBtnJustificado = document.getElementById("optBtnJustificado");
const justificationSection = document.getElementById("justificationSection");
const justificationTextarea = document.getElementById("justificationTextarea");
const btnSaveJustification = document.getElementById("btnSaveJustification");

// Contadores de Chamada
const countPresence = document.getElementById("countPresence");
const countDelay = document.getElementById("countDelay");
const countAbsence = document.getElementById("countAbsence");
const countPending = document.getElementById("countPending");

// Drawer de Anotações
const notesDrawer = document.getElementById("notesDrawer");
const notesTextarea = document.getElementById("notesTextarea");
const btnOpenNotes = document.getElementById("btnOpenNotes");
const btnCancelNotes = document.getElementById("btnCancelNotes");
const btnSaveNotes = document.getElementById("btnSaveNotes");

// Botão Salvar Oficialmente
const btnSaveOfficial = document.getElementById("btnSaveOfficial");

// Elementos removidos do DOM (mantidos como null para evitar ReferenceError)
const btnDelayConfirm = null;
const delayWheel = null;
const delayValDisplay = null;

// Busca expansível e Filtros
const btnToggleSearch = document.getElementById("btnToggleSearch");
const btnCloseSearch = document.getElementById("btnCloseSearch");
const bottomSearchWrapper = document.getElementById("bottomSearchWrapper");
const bottomBar = document.querySelector(".bottom-bar");
const filterPills = document.querySelectorAll(".filter-pill");

// Estado da Aplicação
let currentUserEmail = "";
let allMusiciansRaw = []; // Guarda todos os músicos cadastrados do Firestore (ativos e inativos)
let allMusicians = []; // Lista filtrada de acordo com a data do evento selecionado
let attendanceData = {}; // { musicoId: { status: 'presenca'|'falta'|'atestado'|'atraso'|'nao_escalado', minutes: 0 } }
let notesText = "";
let selectedDate = "";
let activeMusicianId = null;
let selectedStatusTemp = null;
let selectedDelayTemp = 0;
let existedInFirestore = false; // Indica se a lista da data selecionada já estava salva no Firestore
const clickTimestamps = {}; // Controle de duplo clique por músico
let scrollTimeout; // Controle do debounce de scroll
let activeFilter = null; // Filtro ativo: 'nao-escalado' | 'faltas-atrasos' | null

// Estado de Chamadas por Evento / Naipe Sob Demanda
let dailyEventsCalls = []; // [ { id, tipo, label, naipe, horarioInicio, horarioFim, registros, anotacoes, oficial } ]
let activeCallId = null; // ID da chamada aberta no momento

// Valores de atraso para o seletor scroll (minutos)
const delayValues = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 120, 150, 180];

// Controle de Timeout de Segurança da Autenticação
let authCheckHandled = false;
const authFallbackTimer = setTimeout(() => {
    if (!authCheckHandled) {
        authCheckHandled = true;
        if (loader) loader.classList.add("hidden");
        if (!auth.currentUser) {
            window.location.replace("admin.html");
        }
    }
}, 4000);

// Inicialização: Monitor de Autenticação
onAuthStateChanged(auth, (user) => {
    if (authCheckHandled) return;
    authCheckHandled = true;
    clearTimeout(authFallbackTimer);

    if (user) {
        currentUserEmail = user.email || "sistema";
        if (loader) loader.classList.add("hidden");
        initApp();
    } else {
        // Se não autenticado, redireciona para tela de login administrativa
        window.location.replace("admin.html");
    }
});

// Inicialização da Página
async function initApp() {
    try {
        // Definir data padrão como hoje (fuso local YYYY-MM-DD)
        const today = getLocalTodayString();
        if (dateInput) dateInput.value = today;
        selectedDate = today;

        // Configurar altura dinâmica do header para os sticky dos naipes
        const headerEl = document.querySelector('.header');
        if (headerEl) {
            const updateHeaderHeight = () => {
                document.documentElement.style.setProperty('--header-height', `${headerEl.offsetHeight - 1}px`);
            };
            updateHeaderHeight();
            window.addEventListener('resize', updateHeaderHeight);
        }

        // Carregar Músicos
        await loadMusicians();

        // Construir a rodinha de atraso se existir no DOM
        if (typeof buildDelayWheel === 'function') buildDelayWheel();

        // Carregar dados da data atual (ou rascunho)
        await loadDateData(selectedDate);

        // Inicializar eventos do modal de chamada de naipe sob demanda
        initNaipeModal();

        // Restaurar a posição de rolagem salva
        setTimeout(() => {
            const savedScroll = localStorage.getItem("presenca_scroll_pos");
            if (savedScroll !== null) {
                window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'smooth' });
            }
        }, 150);
    } catch (err) {
        console.error("Erro ao inicializar app de presença:", err);
        updateActiveMusiciansForDate(selectedDate || getLocalTodayString());
        renderMusicians();
    }

    // Eventos
    if (searchInput) searchInput.addEventListener("input", renderMusicians);

    // Busca expansível na barra inferior
    if (btnToggleSearch && bottomBar && searchInput) {
        btnToggleSearch.addEventListener("click", () => {
            bottomBar.classList.add("search-active");
            searchInput.focus();
        });
    }
    if (btnCloseSearch && bottomBar && searchInput) {
        btnCloseSearch.addEventListener("click", () => {
            bottomBar.classList.remove("search-active");
            searchInput.value = "";
            renderMusicians();
        });
    }

    // Filtros (pílulas)
    filterPills.forEach(pill => {
        pill.addEventListener("click", () => {
            const filter = pill.dataset.filter;
            if (activeFilter === filter) {
                activeFilter = null;
                pill.classList.remove("active");
            } else {
                filterPills.forEach(p => p.classList.remove("active"));
                activeFilter = filter;
                pill.classList.add("active");
            }
            renderMusicians();
        });
    });
    if (dateInput) dateInput.addEventListener("change", handleDateChange);
    if (btnBackAdmin) btnBackAdmin.addEventListener("click", () => window.location.replace("admin.html"));

    // Callbacks do Drawer de Status
    if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeDrawer);
    if (overlay) overlay.addEventListener("click", closeDrawer);
    if (optBtnPresenca) optBtnPresenca.addEventListener("click", () => instantSelectStatus("presenca"));
    if (optBtnFalta) optBtnFalta.addEventListener("click", () => instantSelectStatus("falta"));
    if (optBtnAtestado) optBtnAtestado.addEventListener("click", () => instantSelectStatus("atestado"));
    if (optBtnDispensa) optBtnDispensa.addEventListener("click", () => instantSelectStatus("dispensa"));
    if (optBtnNaoEscalado) optBtnNaoEscalado.addEventListener("click", () => instantSelectStatus("nao_escalado"));
    if (optBtnJustificado) optBtnJustificado.addEventListener("click", () => selectJustificadoStatus());
    if (justificationTextarea) justificationTextarea.addEventListener("input", handleJustificationInput);
    if (btnSaveJustification) btnSaveJustification.addEventListener("click", () => saveJustificationAndClose());

    // Atalhos Rápidos de Atraso (Pílulas)
    document.querySelectorAll(".delay-pill-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const minutes = parseInt(e.currentTarget.getAttribute("data-delay"), 10);
            if (!isNaN(minutes)) {
                applyQuickDelay(minutes);
            }
        });
    });

    // Suporte a Gesto Swipe-Down na Alça da Modal
    if (drawerHandleWrapper) {
        let startY = 0;
        let currentY = 0;
        drawerHandleWrapper.addEventListener("touchstart", (e) => {
            startY = e.touches[0].clientY;
        }, { passive: true });
        drawerHandleWrapper.addEventListener("touchmove", (e) => {
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0 && statusDrawer) {
                statusDrawer.style.transform = `translateY(${deltaY}px)`;
            }
        }, { passive: true });
        drawerHandleWrapper.addEventListener("touchend", () => {
            const deltaY = currentY - startY;
            if (deltaY > 70) {
                closeDrawer();
            }
            if (statusDrawer) statusDrawer.style.transform = "";
            startY = 0;
            currentY = 0;
        });
    }

    // Callbacks de Anotações
    if (btnOpenNotes) btnOpenNotes.addEventListener("click", openNotesDrawer);
    if (btnCancelNotes) btnCancelNotes.addEventListener("click", closeDrawer);
    if (btnSaveNotes) btnSaveNotes.addEventListener("click", saveNotes);

    // Salvar Oficialmente
    if (btnSaveOfficial) btnSaveOfficial.addEventListener("click", saveOfficialData);
    
    // Salvar a posição do scroll continuamente
    window.addEventListener("scroll", () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            localStorage.setItem("presenca_scroll_pos", window.scrollY);
        }, 200);
    });

    // Inicializar ícones Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Obter string local YYYY-MM-DD
function getLocalTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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

const ordemNaipes = [
    "Primeiros Violinos",
    "Segundos Violinos",
    "Violas",
    "Violoncelos",
    "Contrabaixos",
    "Flauta",
    "Oboé",
    "Clarinete",
    "Fagote",
    "Trompa",
    "Trompete",
    "Trombone",
    "Tuba",
    "Piano",
    "Harpa",
    "Percussão"
];

// Carregar Lista Completa de Músicos do Firestore
async function loadMusicians() {
    try {
        const snapshot = await getDocs(collection(db, "musicos"));
        allMusiciansRaw = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const rawStatus = (data.Status || data.status || data.Cargo || data.cargo || '').toString().toLowerCase().trim();
            
            // Filtros de segurança
            if (rawStatus.includes('emm')) return;
            
            const nomeRegLower = (data['NOME REGISTRO'] || '').toString().toLowerCase();
            const nomeArtLower = (data.NOMEARTISTICO || '').toString().toLowerCase();
            if (nomeRegLower.includes('angela de santi') || nomeArtLower.includes('angela de santi')) return;

            // Excluir expressamente equipe técnica, administrativa e regentes
            const isApoioOuAdmin = rawStatus.includes('montagem') ||
                                   rawStatus.includes('produç') ||
                                   rawStatus.includes('produc') ||
                                   rawStatus.includes('coorden') ||
                                   rawStatus.includes('coo.') ||
                                   rawStatus.includes('diret') ||
                                   rawStatus.includes('apoio') ||
                                   rawStatus.includes('arquiv') ||
                                   rawStatus.includes('regente') ||
                                   rawStatus.includes('reg.');
            if (isApoioOuAdmin) return;

            // Filtro de status: Apenas Bolsistas, Monitores e Spallas
            const isBolsistaOrMonitor = rawStatus.includes("bolsista") || rawStatus.includes("monitor") || rawStatus.includes("spalla");
            if (!isBolsistaOrMonitor) return;

            const nomeArtistico = (data.NOMEARTISTICO || '').toString().trim();
            const nomeCompleto = (data['NOME REGISTRO'] || '').toString().trim();
            const nome = nomeArtistico || nomeCompleto || data.Nome || "Sem Nome";
            const instrumento = (data.INSTRUMENTOS || data.Instrumento || '').toString().trim() || "Outros";

            allMusiciansRaw.push({
                id: docSnap.id,
                Nome: nome,
                Instrumento: instrumento,
                Status: (rawStatus.includes("monitor") || rawStatus.includes("spalla")) ? "Monitor" : "Bolsista",
                statusFirebase: (data.statusFirebase || 'ativo').toString().toLowerCase(),
                dataSaida: data.dataSaida || null
            });
        });
    } catch (e) {
        console.error("Erro ao carregar músicos:", e);
        showToast("Erro ao carregar músicos do banco.");
    }
}

// Filtra dinamicamente a lista de músicos para a data do evento selecionado
function updateActiveMusiciansForDate(targetDateStr) {
    if (!allMusiciansRaw || allMusiciansRaw.length === 0) return;

    allMusicians = allMusiciansRaw.filter(m => {
        const status = m.statusFirebase || 'ativo';
        if (status === 'ativo') return true;

        if (attendanceData && attendanceData[m.id]) return true;

        if (m.dataSaida) {
            return targetDateStr < m.dataSaida;
        }

        return false;
    });
}

// Carregar Dados (Firestore ou Rascunho Local) de uma Data Específica
async function loadDateData(dateStr) {
    try {
        existedInFirestore = false;
        dailyEventsCalls = [];
        activeCallId = null;
        attendanceData = {};
        notesText = "";
        if (notesTextarea) notesTextarea.value = "";

        // 1. Tentar buscar no Firestore chamadas registradas para esta data
        try {
            const presencasRef = collection(db, "presencas");
            const qPres = query(presencasRef, where("data", "==", dateStr));
            const snapPres = await getDocs(qPres);
            let docsPres = [];
            snapPres.forEach(d => docsPres.push({ id: d.id, ...d.data() }));

            // Tentar também buscar pelo doc ID igual a dateStr se não houver campo "data"
            if (docsPres.length === 0) {
                const docRefSingle = doc(db, "presencas", dateStr);
                const snapSingle = await getDoc(docRefSingle);
                if (snapSingle.exists()) {
                    docsPres.push({ id: snapSingle.id, ...snapSingle.data() });
                }
            }

            if (docsPres.length > 0) {
                existedInFirestore = true;
                docsPres.forEach(d => {
                    const labelNaipe = Array.isArray(d.naipe) ? d.naipe.join(" + ") : (d.naipe || "Naipe");
                    dailyEventsCalls.push({
                        id: d.id,
                        tipo: d.tipo || "ensaio_tutti",
                        label: d.tipo === "ensaio_naipe" ? `Naipe: ${labelNaipe}` : "Ensaio Tutti",
                        naipe: d.naipe || null,
                        horarioInicio: d.horarioInicio || (d.tipo === "ensaio_naipe" ? "14:00" : "18:00"),
                        horarioFim: d.horarioFim || (d.tipo === "ensaio_naipe" ? "16:00" : "21:00"),
                        anotacoes: d.anotacoes || "",
                        registros: d.registros || {},
                        oficial: d.oficial !== undefined ? d.oficial : true
                    });
                });
            } else {
                // Rascunho Local
                const draftKey = `presenca_oer_draft_${dateStr}`;
                const savedState = localStorage.getItem(draftKey);
                if (savedState) {
                    const parsed = JSON.parse(savedState);
                    if (parsed.calls && Array.isArray(parsed.calls) && parsed.calls.length > 0) {
                        dailyEventsCalls = parsed.calls;
                    } else {
                        dailyEventsCalls.push({
                            id: dateStr,
                            tipo: "ensaio_tutti",
                            label: "Ensaio Tutti",
                            naipe: null,
                            horarioInicio: "18:00",
                            horarioFim: "21:00",
                            anotacoes: parsed.notes || "",
                            registros: parsed.attendance || {},
                            oficial: false
                        });
                    }
                } else {
                    // Consulta de eventos cadastrados no calendário
                    dailyEventsCalls.push({
                        id: dateStr,
                        tipo: "ensaio_tutti",
                        label: "Ensaio Tutti",
                        naipe: null,
                        horarioInicio: "18:00",
                        horarioFim: "21:00",
                        anotacoes: "",
                        registros: {},
                        oficial: false
                    });

                    try {
                        const eventosRef = collection(db, "eventos");
                        const qEvt = query(eventosRef, where("date", "==", dateStr), where("status", "==", "Confirmado"));
                        const snapEvt = await getDocs(qEvt);
                        snapEvt.forEach(dSnap => {
                            const evt = dSnap.data();
                            if (evt.tipo === "ensaio_naipe" && evt.naipe) {
                                const naipeArr = Array.isArray(evt.naipe) ? evt.naipe : [evt.naipe];
                                const labelNaipe = naipeArr.join(" + ");
                                const existsAlready = dailyEventsCalls.some(c => c.label === `Naipe: ${labelNaipe}`);
                                if (!existsAlready) {
                                    dailyEventsCalls.push({
                                        id: `${dateStr}_naipe_${Date.now()}`,
                                        tipo: "ensaio_naipe",
                                        label: `Naipe: ${labelNaipe}`,
                                        naipe: naipeArr,
                                        horarioInicio: evt.horarioInicio || "14:00",
                                        horarioFim: evt.horarioFim || "16:00",
                                        anotacoes: "",
                                        registros: {},
                                        oficial: false
                                    });
                                }
                            }
                        });
                    } catch (evErr) {
                        console.warn("Aviso ao carregar eventos:", evErr);
                    }
                }
            }
        } catch (fsErr) {
            console.error("Erro ao carregar presenças:", fsErr);
            dailyEventsCalls = [{
                id: dateStr,
                tipo: "ensaio_tutti",
                label: "Ensaio Tutti",
                naipe: null,
                horarioInicio: "18:00",
                horarioFim: "21:00",
                anotacoes: "",
                registros: {},
                oficial: false
            }];
        }

        // Renderizar abas de ensaios e selecionar a chamada ativa
        renderEventsTabs();
        setActiveCall(dailyEventsCalls[0].id);
    } catch (e) {
        console.error("Erro em loadDateData:", e);
        updateActiveMusiciansForDate(dateStr);
        renderMusicians();
    }
}

// Renderizar Abas de Ensaios/Chamadas da Data
function renderEventsTabs() {
    const container = document.getElementById("eventsTabsContainer");
    if (!container) return;

    if (dailyEventsCalls.length <= 1 && (!dailyEventsCalls[0] || dailyEventsCalls[0].tipo === "ensaio_tutti")) {
        container.style.display = "none";
        return;
    }

    container.style.display = "flex";
    container.innerHTML = "";

    dailyEventsCalls.forEach(call => {
        const tab = document.createElement("div");
        const isNaipe = call.tipo === "ensaio_naipe";
        tab.className = `event-tab-item ${call.id === activeCallId ? 'active' : ''} ${isNaipe ? 'naipe-tab' : ''}`;
        
        const iconName = isNaipe ? 'music' : 'users';
        const timeText = call.horarioInicio ? call.horarioInicio : (isNaipe ? '14:00' : '18:00');

        tab.innerHTML = `
            <i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i>
            <span>${call.label}</span>
            <span class="event-time-chip">${timeText}</span>
        `;

        tab.addEventListener("click", () => setActiveCall(call.id));
        container.appendChild(tab);
    });

    if (window.lucide) window.lucide.createIcons();
}

// Definir Chamada Ativa
function setActiveCall(callId) {
    activeCallId = callId;
    const call = dailyEventsCalls.find(c => c.id === callId) || dailyEventsCalls[0];
    if (!call) return;

    attendanceData = call.registros || {};
    notesText = call.anotacoes || "";
    if (notesTextarea) notesTextarea.value = notesText;

    // Atualizar banner de instruções
    const instructionsText = document.getElementById("instructionsText");
    if (instructionsText) {
        if (call.tipo === "ensaio_naipe") {
            const naipesStr = Array.isArray(call.naipe) ? call.naipe.join(" + ") : (call.naipe || "Naipe");
            const horaStr = call.horarioInicio ? ` (${call.horarioInicio}${call.horarioFim ? ' às ' + call.horarioFim : ''})` : "";
            instructionsText.innerHTML = `Chamada Sob Demanda para o <strong>Naipe: ${naipesStr}</strong>${horaStr}. Apenas músicos convocados deste naipe respondem por chamada. Outros ficam como <em>Não Escalado</em>.`;
        } else {
            const horaStr = call.horarioInicio ? ` (${call.horarioInicio}${call.horarioFim ? ' às ' + call.horarioFim : ''})` : "";
            instructionsText.innerHTML = `Chamada do <strong>Ensaio Tutti</strong>${horaStr}. Todos os músicos da orquestra estão convocados.`;
        }
    }

    // Filtrar músicos ativos para a data
    updateActiveMusiciansForDate(selectedDate);

    // Ajustar status para músicos convocados vs não escalados no ensaio de naipe
    if (call.tipo === "ensaio_naipe" && call.naipe) {
        const naipesEscalados = (Array.isArray(call.naipe) ? call.naipe : [call.naipe])
            .map(n => normalizarNaipe(n))
            .filter(Boolean);

        allMusicians.forEach(m => {
            const musicoNaipeNorm = normalizarNaipe(m.Instrumento || '');
            const estaEscalado = naipesEscalados.some(ne => ne === musicoNaipeNorm || ne.includes(musicoNaipeNorm) || musicoNaipeNorm.includes(ne));

            if (!estaEscalado) {
                attendanceData[m.id] = { status: "nao_escalado", minutes: 0 };
            } else if (!attendanceData[m.id]) {
                attendanceData[m.id] = { status: "none", minutes: 0 };
            }
        });
    } else {
        allMusicians.forEach(m => {
            if (!attendanceData[m.id]) {
                attendanceData[m.id] = { status: "none", minutes: 0 };
            }
        });
    }

    // Verificar se existem dispensas ativas para a data selecionada
    try {
        const dispensasRef = collection(db, "dispensas");
        const qDisp = query(dispensasRef, where("dataInicio", "<=", selectedDate));
        getDocs(qDisp).then(snapDisp => {
            snapDisp.forEach(dDoc => {
                const disp = dDoc.data();
                if (disp.dataFim >= selectedDate && disp.musicianId) {
                    const mId = disp.musicianId;
                    const currentStatus = attendanceData[mId] ? attendanceData[mId].status : 'none';
                    if (currentStatus === 'none' || currentStatus === 'falta' || !attendanceData[mId]) {
                        attendanceData[mId] = {
                            status: 'dispensa',
                            minutes: 0,
                            justificativa: disp.descricao || ''
                        };
                    }
                }
            });
            renderEventsTabs();
            renderMusicians();
        }).catch(err => {
            renderEventsTabs();
            renderMusicians();
        });
    } catch (dispErr) {
        renderEventsTabs();
        renderMusicians();
    }
}
};

// Tratar Mudança de Data no DatePicker
async function handleDateChange(e) {
    selectedDate = e.target.value;
    if (!selectedDate) return;
    await loadDateData(selectedDate);
}

// Formatar data YYYY-MM-DD para DD/MM/YYYY
function formatDateDisplay(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Renderizar Tabela de Músicos
function renderMusicians() {
    const query = searchInput.value.toLowerCase().trim();
    musiciansList.innerHTML = "";

    // Agrupar músicos por Instrumento/Naipe normalizado
    const groups = {};
    allMusicians.forEach(m => {
        // Filtro por texto (busca)
        const matchName = m.Nome.toLowerCase().includes(query);
        const matchInst = m.Instrumento.toLowerCase().includes(query);
        const matchText = query === "" || matchName || matchInst;

        // Filtro por pílulas de status
        let matchFilter = true;
        if (activeFilter) {
            const statusInfo = attendanceData[m.id] || { status: "none", minutes: 0 };
            if (activeFilter === "nao-escalado") {
                matchFilter = statusInfo.status === "nao_escalado";
            } else if (activeFilter === "faltas-atrasos") {
                matchFilter = statusInfo.status === "falta" || statusInfo.status === "atraso";
            } else if (activeFilter === "pendente") {
                matchFilter = statusInfo.status === "none";
            }
        }
        
        if (matchText && matchFilter) {
            // Normalização do naipe para agrupamento correto
            const instNormalizado = normalizarNaipe(m.Instrumento);
            let naipeEncontrado = ordemNaipes.find(n => normalizarNaipe(n) === instNormalizado);
            
            if (!naipeEncontrado) {
                naipeEncontrado = ordemNaipes.find(n => normalizarNaipe(n).includes(instNormalizado) || instNormalizado.includes(normalizarNaipe(n)));
            }
            
            const grupoFinal = naipeEncontrado || m.Instrumento;

            if (!groups[grupoFinal]) {
                groups[grupoFinal] = [];
            }
            groups[grupoFinal].push(m);
        }
    });

    if (Object.keys(groups).length === 0) {
        musiciansList.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 3rem 1rem;">Nenhum músico ou naipe encontrado.</div>`;
        return;
    }

    // Função auxiliar para renderizar um grupo de naipe
    const renderNaipeGroup = (naipe, list) => {
        const section = document.createElement("div");
        section.className = "naipe-group";
        
        const header = document.createElement("div");
        header.className = "naipe-header";
        header.innerHTML = `<span>${naipe}</span><span class="naipe-count">${list.length}</span>`;
        section.appendChild(header);

        // Ordenar: Monitores no topo, depois bolsistas, ordenados alfabeticamente
        const sortedList = list.sort((a, b) => {
            const isMonitorA = a.Status === "Monitor";
            const isMonitorB = b.Status === "Monitor";
            if (isMonitorA && !isMonitorB) return -1;
            if (!isMonitorA && isMonitorB) return 1;
            return a.Nome.localeCompare(b.Nome, "pt-BR");
        });

        sortedList.forEach(m => {
            const card = document.createElement("div");
            const statusInfo = attendanceData[m.id] || { status: "none", minutes: 0 };
            
            card.className = `musician-card ${statusInfo.status !== 'none' ? statusInfo.status.replace(/_/g, '-') : ''}`;
            card.id = `musician-card-${m.id}`;

            // Determinar o texto de exibição do status
            let badgeLabel = "Pendente";
            if (statusInfo.status === "presenca") badgeLabel = "Presença";
            else if (statusInfo.status === "falta") badgeLabel = "Falta";
            else if (statusInfo.status === "atestado") badgeLabel = "Atestado";
            else if (statusInfo.status === "dispensa") badgeLabel = "Dispensa";
            else if (statusInfo.status === "nao_escalado") badgeLabel = "Não Escalado";
            else if (statusInfo.status === "justificado") {
                const justMsg = statusInfo.justificativa ? `: ${statusInfo.justificativa}` : "";
                const shortJust = justMsg.length > 15 ? justMsg.substring(0, 15) + "..." : justMsg;
                badgeLabel = `Justificado${shortJust}`;
            } else if (statusInfo.status === "atraso") {
                const mVal = statusInfo.minutes;
                if (mVal >= 60) {
                    const hrs = Math.floor(mVal / 60);
                    const mins = mVal % 60;
                    badgeLabel = `Atraso: ${hrs}h${mins > 0 ? mins : ''}`;
                } else {
                    badgeLabel = `Atraso: ${mVal}m`;
                }
            }

            const isMonitor = m.Status === "Monitor";
            const roleText = isMonitor ? '<span class="role-label monitor">(Monitor)</span>' : '<span class="role-label bolsista">(Bolsista)</span>';
            const isPresence = statusInfo.status === "presenca";

            card.innerHTML = `
                <div class="musician-info">
                    <div class="musician-name-container">
                        <span class="musician-name">${m.Nome}</span>
                        ${roleText}
                    </div>
                </div>
                <div class="badge-click-area">
                    <span class="status-badge ${statusInfo.status === 'none' ? 'status-none' : ''}">
                        ${badgeLabel}
                    </span>
                </div>
            `;

            // Delegação de evento única no card:
            // - Clique no badge/status → abre modal
            // - Clique em qualquer outra parte → presença rápida
            card.addEventListener("click", (e) => {
                if (e.target.closest('.badge-click-area')) {
                    openDrawerForMusician(m);
                } else {
                    const now = new Date().getTime();
                    const lastClickTime = clickTimestamps[m.id] || 0;
                    if (now - lastClickTime < 400) {
                        handleDoubleQuickPresence(m);
                        clickTimestamps[m.id] = 0;
                    } else {
                        handleQuickPresence(m);
                        clickTimestamps[m.id] = now;
                    }
                }
            });

            section.appendChild(card);
        });

        musiciansList.appendChild(section);
    };

    // Listagem por Naipe na ORDEM ESPECIFICADA
    const groupsCopy = { ...groups };
    ordemNaipes.forEach(naipe => {
        if (groupsCopy[naipe]) {
            renderNaipeGroup(naipe, groupsCopy[naipe]);
            delete groupsCopy[naipe]; // remove do objeto temporário
        }
    });

    // Renderiza qualquer grupo que sobrou (ex: "Outros" ou novos instrumentos não mapeados)
    for (const naipe in groupsCopy) {
        renderNaipeGroup(naipe, groupsCopy[naipe]);
    }

    // Atualizar Contadores do Header
    updateCounters();
}

// Atualizar Contadores de Presença no Header
function updateCounters() {
    let presence = 0, delay = 0, absence = 0, pending = 0;
    allMusicians.forEach(m => {
        const st = (attendanceData[m.id] || { status: 'none' }).status;
        if (st === 'presenca') presence++;
        else if (st === 'atraso') delay++;
        else if (st === 'falta') absence++;
        else if (st === 'none') pending++;
    });

    if (countPresence) countPresence.innerText = presence;
    if (countDelay) countDelay.innerText = delay;
    if (countAbsence) countAbsence.innerText = absence;
    if (countPending) countPending.innerText = pending;
}

// Alternar presença rápida
function handleQuickPresence(musician) {
    const current = attendanceData[musician.id] || { status: "none", minutes: 0 };
    if (current.status === "presenca") {
        attendanceData[musician.id] = { status: "none", minutes: 0 };
    } else {
        attendanceData[musician.id] = { status: "presenca", minutes: 0 };
    }
    saveDraft();
    renderMusicians();
    showToast(`Presença rápida: ${musician.Nome.split(' ')[0]}`);
}

// Alternar para Não Escalado via duplo clique
function handleDoubleQuickPresence(musician) {
    attendanceData[musician.id] = { status: "nao_escalado", minutes: 0 };
    saveDraft();
    renderMusicians();
    showToast(`Não escalado: ${musician.Nome.split(' ')[0]}`);
}

// Abrir Drawer de Status
function openDrawerForMusician(musician) {
    activeMusicianId = musician.id;
    const current = attendanceData[musician.id] || { status: "none", minutes: 0 };
    
    selectedStatusTemp = current.status;
    selectedDelayTemp = current.minutes;

    drawerTitle.innerText = musician.Nome;
    drawerSubtitle.innerText = `${musician.Instrumento} • ${musician.Status}`;

    if (selectedStatusTemp === "justificado") {
        justificationTextarea.value = current.justificativa || "";
    } else {
        justificationTextarea.value = "";
    }

    updateDrawerButtonsVisuals();
    if (typeof scrollToDelayValue === 'function') scrollToDelayValue(selectedDelayTemp);
    if (typeof updateDelayDisplay === 'function') updateDelayDisplay(selectedDelayTemp);

    if (overlay) overlay.classList.add("open");
    if (statusDrawer) statusDrawer.classList.add("open");
}

// Selecionar Instantaneamente Status Simples e Fechar
function instantSelectStatus(status) {
    if (!activeMusicianId) return;
    
    attendanceData[activeMusicianId] = {
        status: status,
        minutes: 0
    };
    
    saveDraft();
    renderMusicians();
    closeDrawer();
    showToast(`Registrado: ${status === 'presenca' ? 'Presença' : status === 'falta' ? 'Falta' : status === 'atestado' ? 'Atestado' : 'Não Escalado'}`);
}

// Selecionar status Justificado
function selectJustificadoStatus() {
    if (!activeMusicianId) return;

    selectedStatusTemp = "justificado";
    selectedDelayTemp = 0;

    updateDrawerButtonsVisuals();

    const current = attendanceData[activeMusicianId] || {};
    const currentJustificativa = current.status === "justificado" ? (current.justificativa || "") : "";
    justificationTextarea.value = currentJustificativa;

    // Salvar no attendanceData imediatamente para que a mudança reflita em tempo real
    attendanceData[activeMusicianId] = {
        status: "justificado",
        minutes: 0,
        justificativa: currentJustificativa
    };

    saveDraft();
    renderMusicians();
    
    // Focar no campo de texto para facilitar o PWA mobile
    setTimeout(() => {
        justificationTextarea.focus();
    }, 100);
}

// Manipular input da justificativa
function handleJustificationInput(e) {
    if (!activeMusicianId) return;

    if (attendanceData[activeMusicianId] && attendanceData[activeMusicianId].status === "justificado") {
        attendanceData[activeMusicianId].justificativa = e.target.value;
        saveDraft();
        renderMusicians();
    }
}

// Aplicar Atalho Rápido de Atraso (Pílula) e Fechar
function applyQuickDelay(minutes) {
    if (!activeMusicianId) return;

    attendanceData[activeMusicianId] = {
        status: "atraso",
        minutes: minutes
    };

    saveDraft();
    renderMusicians();
    closeDrawer();
    showToast(`Atraso de ${minutes}m registrado!`);
}

// Salvar Justificativa e Fechar
function saveJustificationAndClose() {
    if (!activeMusicianId) return;
    const text = (justificationTextarea.value || "").trim();

    if (text === "") {
        attendanceData[activeMusicianId] = { status: "none", minutes: 0 };
        showToast("Justificativa vazia: status revertido para Pendente.");
    } else {
        attendanceData[activeMusicianId] = {
            status: "justificado",
            minutes: 0,
            justificativa: text
        };
        showToast("Justificativa salva!");
    }

    saveDraft();
    renderMusicians();
    closeDrawer();
}

// Aplicar Alteração de Atraso Customizado
function applyDelayChange() {
    if (!activeMusicianId) return;

    attendanceData[activeMusicianId] = {
        status: "atraso",
        minutes: selectedDelayTemp
    };

    saveDraft();
    renderMusicians();
    closeDrawer();
    showToast("Atraso registrado!");
}

// Atualizar Destaques no Drawer
function updateDrawerButtonsVisuals() {
    const btns = [optBtnPresenca, optBtnFalta, optBtnAtestado, optBtnNaoEscalado, optBtnJustificado];
    btns.forEach(btn => btn?.classList.remove("selected"));

    if (selectedStatusTemp === "presenca") optBtnPresenca?.classList.add("selected");
    else if (selectedStatusTemp === "falta") optBtnFalta?.classList.add("selected");
    else if (selectedStatusTemp === "atestado") optBtnAtestado?.classList.add("selected");
    else if (selectedStatusTemp === "nao_escalado") optBtnNaoEscalado?.classList.add("selected");
    else if (selectedStatusTemp === "justificado") optBtnJustificado?.classList.add("selected");

    // Exibir/Ocultar seção de justificativa e botão Justificado
    if (justificationSection) {
        if (selectedStatusTemp === "justificado") {
            justificationSection.style.display = "flex";
            if (optBtnJustificado) optBtnJustificado.style.display = "none";
        } else {
            justificationSection.style.display = "none";
            if (optBtnJustificado) optBtnJustificado.style.display = "flex";
        }
    }

    // Exibir/Ocultar seção de atraso/rodinha se existir
    const delaySection = document.querySelector(".delay-section");
    if (delaySection) {
        if (selectedStatusTemp === "nao_escalado") {
            delaySection.style.display = "none";
        } else {
            delaySection.style.display = "block";
        }
    }

    // Exibir/Ocultar botão Confirmar Atraso se existir
    if (btnDelayConfirm) {
        if (selectedDelayTemp > 0 && selectedStatusTemp === "atraso") {
            btnDelayConfirm.style.display = "inline-flex";
        } else {
            btnDelayConfirm.style.display = "none";
        }
    }
}

// Fechar Qualquer Drawer
function closeDrawer() {
    // Se o Drawer de status estava aberto, verificar se há justificativa vazia
    if (statusDrawer.classList.contains("open") && activeMusicianId) {
        const current = attendanceData[activeMusicianId];
        if (current && current.status === "justificado") {
            const justificativaLimpa = (current.justificativa || "").trim();
            if (justificativaLimpa === "") {
                attendanceData[activeMusicianId] = { status: "none", minutes: 0 };
                saveDraft();
                renderMusicians();
                showToast("Justificativa vazia: status revertido para Pendente.");
            }
        }
        activeMusicianId = null;
    }

    overlay.classList.remove("open");
    statusDrawer.classList.remove("open");
    notesDrawer.classList.remove("open");
}

// Salvar Rascunho Local
function saveDraft() {
    if (!selectedDate) return;
    const activeCall = dailyEventsCalls.find(c => c.id === activeCallId);
    if (activeCall) {
        activeCall.registros = { ...attendanceData };
        activeCall.anotacoes = notesText;
    }
    const draftKey = `presenca_oer_draft_${selectedDate}`;
    const state = {
        selectedDate: selectedDate,
        calls: dailyEventsCalls,
        attendance: attendanceData,
        notes: notesText,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem(draftKey, JSON.stringify(state));
}

// Drawer de Anotações
function openNotesDrawer() {
    overlay.classList.add("open");
    notesDrawer.classList.add("open");
}

function saveNotes() {
    notesText = notesTextarea.value;
    saveDraft();
    closeDrawer();
    showToast("Anotações salvas temporariamente!");
}

// Modal & Dropdown Handlers de Chamada de Naipe
function initNaipeModal() {
    const btnOpen = document.getElementById("btnOpenNaipeModal");
    const modalOverlay = document.getElementById("modalNaipeOverlay");
    const btnClose = document.getElementById("btnCloseNaipeModal");
    const btnCancel = document.getElementById("btnCancelNaipeModal");
    const btnConfirm = document.getElementById("btnConfirmCreateNaipeCall");

    const dropdownTrigger = document.getElementById("dropdownTrigger");
    const dropdownMenu = document.getElementById("dropdownMenu");

    if (btnOpen) {
        btnOpen.addEventListener("click", () => {
            if (modalOverlay) modalOverlay.classList.add("open");
        });
    }

    const closeModal = () => {
        if (modalOverlay) modalOverlay.classList.remove("open");
        if (dropdownMenu) dropdownMenu.classList.remove("open");
    };

    if (btnClose) btnClose.addEventListener("click", closeModal);
    if (btnCancel) btnCancel.addEventListener("click", closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    if (dropdownTrigger && dropdownMenu) {
        dropdownTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle("open");
        });

        document.addEventListener("click", (e) => {
            if (!dropdownTrigger.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove("open");
            }
        });
    }

    // Gerenciar seleções por família
    const famMap = {
        chk_fam_cordas: ["chk_v1", "chk_v2", "chk_va", "chk_vc", "chk_cb"],
        chk_fam_madeiras: ["chk_fl", "chk_ob", "chk_cl", "chk_fg"],
        chk_fam_metais: ["chk_tp", "chk_tr", "chk_tb", "chk_tu"],
        chk_fam_percussao: ["chk_pr"]
    };

    Object.entries(famMap).forEach(([famId, childIds]) => {
        const famChk = document.getElementById(famId);
        if (famChk) {
            famChk.addEventListener("change", () => {
                const isChecked = famChk.checked;
                childIds.forEach(cId => {
                    const cChk = document.getElementById(cId);
                    if (cChk) cChk.checked = isChecked;
                });
                updateNaipeTags();
            });
        }
    });

    document.querySelectorAll(".chk-naipe-item").forEach(item => {
        item.addEventListener("change", updateNaipeTags);
    });

    if (btnConfirm) {
        btnConfirm.addEventListener("click", () => {
            const checkedItems = Array.from(document.querySelectorAll(".chk-naipe-item:checked")).map(el => el.value);
            if (checkedItems.length === 0) {
                alert("Por favor, selecione ao menos um naipe para a chamada.");
                return;
            }

            const horaInicio = document.getElementById("inputNaipeHoraInicio")?.value || "14:00";
            const horaFim = document.getElementById("inputNaipeHoraFim")?.value || "16:00";
            const obs = document.getElementById("inputNaipeObs")?.value || "";

            const newCallId = `${selectedDate}_naipe_${Date.now()}`;
            const labelNaipe = checkedItems.join(" + ");
            const newCall = {
                id: newCallId,
                tipo: "ensaio_naipe",
                label: `Naipe: ${labelNaipe}`,
                naipe: checkedItems,
                horarioInicio: horaInicio,
                horarioFim: horaFim,
                anotacoes: obs,
                registros: {},
                oficial: false
            };

            dailyEventsCalls.push(newCall);
            saveDraft();
            closeModal();
            renderEventsTabs();
            setActiveCall(newCallId);
            showToast(`Chamada criada para o Naipe: ${labelNaipe}`);
        });
    }
}

function updateNaipeTags() {
    const checkedItems = Array.from(document.querySelectorAll(".chk-naipe-item:checked"));
    const container = document.getElementById("tagsSelectedContainer");
    const placeholder = document.getElementById("dropdownPlaceholderText");
    if (!container || !placeholder) return;

    container.innerHTML = "";

    if (checkedItems.length === 0) {
        placeholder.innerText = "Clique para selecionar naipes...";
    } else {
        placeholder.innerText = `${checkedItems.length} naipe(s) selecionado(s)`;
        checkedItems.forEach(chk => {
            const tag = document.createElement("span");
            tag.className = "selected-tag";
            tag.innerHTML = `${chk.value} <i data-lucide="x" style="width:12px;height:12px;"></i>`;
            tag.querySelector("i").addEventListener("click", (e) => {
                e.stopPropagation();
                chk.checked = false;
                updateNaipeTags();
            });
            container.appendChild(tag);
        });
    }

    if (window.lucide) window.lucide.createIcons();
}

// Salvar Oficialmente no Firestore e Gerar Log
async function saveOfficialData() {
    const activeCall = dailyEventsCalls.find(c => c.id === activeCallId) || dailyEventsCalls[0];
    if (!activeCall) return;

    // Varredura preventiva para limpar justificativas vazias
    Object.keys(attendanceData).forEach(mId => {
        const item = attendanceData[mId];
        if (item && item.status === 'justificado' && (!item.justificativa || item.justificativa.trim() === '')) {
            attendanceData[mId] = { status: 'none', minutes: 0 };
        }
    });

    const totalMusicos = allMusicians.length;
    const registrados = Object.values(attendanceData).filter(x => x.status !== 'none');
    
    if (registrados.length < totalMusicos) {
        const confirmSave = confirm(`Atenção: Há músicos com status Pendente (${registrados.length} de ${totalMusicos} preenchidos).\n\nDeseja salvar mesmo assim?`);
        if (!confirmSave) return;
    }

    loader.querySelector("p").innerText = "Sincronizando com o Firebase...";
    loader.classList.remove("hidden");

    try {
        // 1. Gravar dados da presença da chamada ativa
        const docRef = doc(db, "presencas", activeCall.id);
        await setDoc(docRef, {
            data: selectedDate,
            tipo: activeCall.tipo || "ensaio_tutti",
            naipe: activeCall.naipe || null,
            horarioInicio: activeCall.horarioInicio || "",
            horarioFim: activeCall.horarioFim || "",
            anotacoes: notesText,
            oficial: true,
            registros: attendanceData,
            ultimaAtualizacao: new Date().toISOString(),
            usuarioResponsavel: currentUserEmail
        });

        activeCall.registros = { ...attendanceData };
        activeCall.anotacoes = notesText;
        activeCall.oficial = true;

        // 2. Contabilizar totais para detalhes do Log
        let presencas = 0, faltas = 0, atestados = 0, dispensas = 0, atrasos = 0, naoEscalados = 0, justificados = 0;
        registrados.forEach(r => {
            if (r.status === 'presenca') presencas++;
            else if (r.status === 'falta') faltas++;
            else if (r.status === 'atestado') atestados++;
            else if (r.status === 'dispensa') dispensas++;
            else if (r.status === 'atraso') atrasos++;
            else if (r.status === 'nao_escalado') naoEscalados++;
            else if (r.status === 'justificado') justificados++;
        });

        // 3. Definir tipo e mensagem do log com base na auditoria
        const formattedDate = formatDateDisplay(selectedDate);
        const logType = existedInFirestore ? "presenca-corrigida" : "presenca-salva";
        const descNaipe = activeCall.tipo === "ensaio_naipe" 
            ? ` (Naipe: ${Array.isArray(activeCall.naipe) ? activeCall.naipe.join(' + ') : activeCall.naipe})`
            : "";
            
        const logMessage = existedInFirestore 
            ? `Alteração retroativa realizada na lista de presença${descNaipe} do dia ${formattedDate} por ${currentUserEmail}`
            : `Lista de presença${descNaipe} do dia ${formattedDate} registrada por ${currentUserEmail}`;

        // 4. Gravar log na coleção adminLogs
        await addDoc(collection(db, "adminLogs"), {
            type: logType,
            message: logMessage,
            createdAt: new Date().toISOString(),
            user: currentUserEmail,
            details: (() => {
                const total = presencas + naoEscalados;
                const partesParen = [`Presentes: ${presencas}`];
                if (naoEscalados > 0) partesParen.push(`Não Escalados: ${naoEscalados}`);
                let resultado = `Total: ${total} (${partesParen.join(' | ')})`;
                const extras = [];
                if (atestados > 0) extras.push(`Atestados: ${atestados}`);
                if (dispensas > 0) extras.push(`Dispensas: ${dispensas}`);
                if (atrasos > 0) extras.push(`Atrasos: ${atrasos}`);
                if (faltas > 0) extras.push(`Faltas: ${faltas}`);
                if (justificados > 0) extras.push(`Justificados: ${justificados}`);
                if (extras.length > 0) resultado += ` | ${extras.join(' | ')}`;
                return resultado;
            })()
        });

        // 5. Limpar rascunho local
        const draftKey = `presenca_oer_draft_${selectedDate}`;
        localStorage.removeItem(draftKey);

        existedInFirestore = true;
        loader.classList.add("hidden");
        showToast("Lista salva com sucesso!");
    } catch (e) {
        console.error("Erro ao salvar dados oficialmente:", e);
        loader.classList.add("hidden");
        showToast("Erro de conexão. Rascunho salvo localmente.");
    }
}

// Exibir Notificação Toast
function showToast(msg) {
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

// Construir Rodinha de Atraso
function buildDelayWheel() {
    if (!delayWheel) return;
    delayWheel.innerHTML = "";

    delayValues.forEach(val => {
        const item = document.createElement("div");
        item.className = "wheel-item";
        item.setAttribute("data-value", val);
        
        let label = "";
        if (val === 0) label = "0m";
        else if (val >= 60) {
            const h = Math.floor(val / 60);
            const m = val % 60;
            label = `${h}h${m > 0 ? m : ''}`;
        } else {
            label = `${val}m`;
        }
        item.innerText = label;
        delayWheel.appendChild(item);
    });

    // Escutar scroll na rodinha
    delayWheel.addEventListener("scroll", () => {
        clearTimeout(delayWheel.scrollTimeout);
        delayWheel.scrollTimeout = setTimeout(() => {
            const scrollerRect = delayWheel.getBoundingClientRect();
            const centerX = scrollerRect.left + scrollerRect.width / 2;

            let closestItem = null;
            let closestDist = Infinity;

            const items = delayWheel.querySelectorAll(".wheel-item");
            items.forEach(item => {
                const rect = item.getBoundingClientRect();
                const itemCenter = rect.left + rect.width / 2;
                const dist = Math.abs(centerX - itemCenter);

                if (dist < closestDist) {
                    closestDist = dist;
                    closestItem = item;
                }
            });

            if (closestItem) {
                items.forEach(it => it.classList.remove("selected"));
                closestItem.classList.add("selected");
                const val = parseInt(closestItem.getAttribute("data-value"));
                
                selectedDelayTemp = val;
                updateDelayDisplay(val);

                if (val > 0) {
                    selectedStatusTemp = 'atraso';
                    if (btnDelayConfirm) btnDelayConfirm.style.display = "inline-flex";
                } else {
                    if (selectedStatusTemp === 'atraso') {
                        selectedStatusTemp = 'presenca';
                    }
                    if (btnDelayConfirm) btnDelayConfirm.style.display = "none";
                }
                
                // Atualiza destaques visuais do Drawer
                const btns = [optBtnPresenca, optBtnFalta, optBtnAtestado, optBtnNaoEscalado];
                btns.forEach(btn => btn?.classList.remove("selected"));
                if (selectedStatusTemp === "presenca" && val === 0) {
                    optBtnPresenca?.classList.add("selected");
                }
            }
        }, 80);
    });
}

// Scroll automático para centrar o valor da rodinha
function scrollToDelayValue(value) {
    if (!delayWheel) return;
    const items = delayWheel.querySelectorAll(".wheel-item");
    items.forEach(item => {
        const val = parseInt(item.getAttribute("data-value"));
        if (val === value) {
            setTimeout(() => {
                item.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                items.forEach(it => it.classList.remove("selected"));
                item.classList.add("selected");
            }, 100);
        }
    });
}

// Atualizar valor textual do atraso no painel
function updateDelayDisplay(minutes) {
    if (!delayValDisplay) return;
    if (minutes === 0) {
        delayValDisplay.innerText = "Sem atraso";
        delayValDisplay.style.color = "var(--text-secondary)";
    } else if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        delayValDisplay.innerText = `Atraso: ${h}h${m > 0 ? m + 'm' : ''}`;
        delayValDisplay.style.color = "var(--color-delay)";
    } else {
        delayValDisplay.innerText = `Atraso: ${minutes} min`;
        delayValDisplay.style.color = "var(--color-delay)";
    }
}
