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
    enableIndexedDbPersistence,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Habilitar persistência offline do Firestore
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Múltiplas abas abertas. Persistência offline ativa apenas na primeira aba.");
    } else if (err.code == 'unimplemented') {
        console.warn("Este navegador não suporta persistência offline do Firestore.");
    }
});

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
const delayValDisplay = document.getElementById("delayValDisplay");
const delayWheel = document.getElementById("delayWheel");
const btnDelayConfirm = document.getElementById("btnDelayConfirm");
const btnCancelDrawer = document.getElementById("btnCancelDrawer");

const optBtnPresenca = document.getElementById("optBtnPresenca");
const optBtnFalta = document.getElementById("optBtnFalta");
const optBtnAtestado = document.getElementById("optBtnAtestado");
const optBtnNaoEscalado = document.getElementById("optBtnNaoEscalado");
const optBtnJustificado = document.getElementById("optBtnJustificado");
const justificationSection = document.getElementById("justificationSection");
const justificationTextarea = document.getElementById("justificationTextarea");

// Drawer de Anotações
const notesDrawer = document.getElementById("notesDrawer");
const notesTextarea = document.getElementById("notesTextarea");
const btnOpenNotes = document.getElementById("btnOpenNotes");
const btnCancelNotes = document.getElementById("btnCancelNotes");
const btnSaveNotes = document.getElementById("btnSaveNotes");

// Botão Salvar Oficialmente
const btnSaveOfficial = document.getElementById("btnSaveOfficial");

// Busca expansível e Filtros
const btnToggleSearch = document.getElementById("btnToggleSearch");
const btnCloseSearch = document.getElementById("btnCloseSearch");
const bottomSearchWrapper = document.getElementById("bottomSearchWrapper");
const bottomBar = document.querySelector(".bottom-bar");
const filterPills = document.querySelectorAll(".filter-pill");

// Estado da Aplicação
let currentUserEmail = "";
let allMusicians = []; // Lista carregada do Firestore
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

// Valores de atraso para o seletor scroll (minutos)
const delayValues = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 120, 150, 180];

// Inicialização: Monitor de Autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserEmail = user.email || "sistema";
        loader.classList.add("hidden");
        initApp();
    } else {
        // Se não autenticado, redireciona para tela de login administrativa
        window.location.replace("admin.html");
    }
});

// Inicialização da Página
async function initApp() {
    // Definir data padrão como hoje (fuso local YYYY-MM-DD)
    const today = getLocalTodayString();
    dateInput.value = today;
    selectedDate = today;

    // Configurar altura dinâmica do header para os sticky dos naipes
    const headerEl = document.querySelector('.header');
    if (headerEl) {
        const updateHeaderHeight = () => {
            // Pequeno desconto para o header se alinhar perfeitamente sem borda vazada
            document.documentElement.style.setProperty('--header-height', `${headerEl.offsetHeight - 1}px`);
        };
        updateHeaderHeight();
        window.addEventListener('resize', updateHeaderHeight);
    }

    // Carregar Músicos
    await loadMusicians();

    // Construir a rodinha de atraso estilo iOS
    buildDelayWheel();

    // Carregar dados da data atual (ou rascunho)
    await loadDateData(selectedDate);

    // Restaurar a posição de rolagem salva
    setTimeout(() => {
        const savedScroll = localStorage.getItem("presenca_scroll_pos");
        if (savedScroll !== null) {
            window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'smooth' });
        }
    }, 150);

    // Eventos
    searchInput.addEventListener("input", renderMusicians);

    // Busca expansível na barra inferior
    btnToggleSearch.addEventListener("click", () => {
        bottomBar.classList.add("search-active");
        searchInput.focus();
    });
    btnCloseSearch.addEventListener("click", () => {
        bottomBar.classList.remove("search-active");
        searchInput.value = "";
        renderMusicians();
    });

    // Filtros (pílulas)
    filterPills.forEach(pill => {
        pill.addEventListener("click", () => {
            const filter = pill.dataset.filter;
            if (activeFilter === filter) {
                // Desativar filtro
                activeFilter = null;
                pill.classList.remove("active");
            } else {
                // Ativar novo filtro e desativar o anterior
                filterPills.forEach(p => p.classList.remove("active"));
                activeFilter = filter;
                pill.classList.add("active");
            }
            renderMusicians();
        });
    });
    dateInput.addEventListener("change", handleDateChange);
    btnBackAdmin.addEventListener("click", () => window.location.replace("admin.html"));

    // Callbacks do Drawer de Status
    btnCancelDrawer.addEventListener("click", closeDrawer);
    overlay.addEventListener("click", closeDrawer);
    optBtnPresenca.addEventListener("click", () => instantSelectStatus("presenca"));
    optBtnFalta.addEventListener("click", () => instantSelectStatus("falta"));
    optBtnAtestado.addEventListener("click", () => instantSelectStatus("atestado"));
    optBtnNaoEscalado.addEventListener("click", () => instantSelectStatus("nao_escalado"));
    optBtnJustificado.addEventListener("click", () => selectJustificadoStatus());
    justificationTextarea.addEventListener("input", handleJustificationInput);
    btnDelayConfirm.addEventListener("click", applyDelayChange);

    // Callbacks de Anotações
    btnOpenNotes.addEventListener("click", openNotesDrawer);
    btnCancelNotes.addEventListener("click", closeDrawer);
    btnSaveNotes.addEventListener("click", saveNotes);

    // Salvar Oficialmente
    btnSaveOfficial.addEventListener("click", saveOfficialData);
    
    // Salvar a posição do scroll continuamente (com debounce para performance)
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

// Carregar Lista de Músicos Ativos do Firestore
async function loadMusicians() {
    try {
        const snapshot = await getDocs(collection(db, "musicos"));
        allMusicians = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const status = (data.Status || '').toString().toLowerCase().trim();
            
            // Filtros de segurança e inativos (idênticos ao admin.js)
            if (status.includes('emm')) return;
            
            const nomeRegLower = (data['NOME REGISTRO'] || '').toString().toLowerCase();
            const nomeArtLower = (data.NOMEARTISTICO || '').toString().toLowerCase();
            if (nomeRegLower.includes('angela de santi') || nomeArtLower.includes('angela de santi')) return;
            if (status.includes('desligado') || (data.statusFirebase || '').toString() === 'desligado' || (data.statusFirebase || '').toString() === 'inativo') return;

            const isBolsistaOrMonitor = status.includes("bolsista") || status.includes("monitor") || status.includes("spalla");

            if (isBolsistaOrMonitor) {
                const nomeArtistico = (data.NOMEARTISTICO || '').toString().trim();
                const nomeCompleto = (data['NOME REGISTRO'] || '').toString().trim();
                const nome = nomeArtistico || nomeCompleto || "Sem Nome";
                
                const instrumento = (data.INSTRUMENTOS || '').toString().trim() || "Outros";

                allMusicians.push({
                    id: docSnap.id,
                    Nome: nome,
                    Instrumento: instrumento,
                    Status: (status.includes("monitor") || status.includes("spalla")) ? "Monitor" : "Bolsista"
                });
            }
        });
    } catch (e) {
        console.error("Erro ao carregar músicos:", e);
        showToast("Erro ao carregar músicos do banco.");
    }
}

// Carregar Dados (Firestore ou Rascunho Local) de uma Data Específica
async function loadDateData(dateStr) {
    try {
        existedInFirestore = false;
        attendanceData = {};
        notesText = "";
        notesTextarea.value = "";

        // 1. Tentar buscar no Firestore
        const docRef = doc(db, "presencas", dateStr);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            attendanceData = data.registros || {};
            notesText = data.anotacoes || "";
            notesTextarea.value = notesText;
            existedInFirestore = true;
            showToast(`Dados de ${formatDateDisplay(dateStr)} carregados do Firestore.`);
        } else {
            // 2. Se não existir no Firestore, tenta carregar Rascunho Local (LocalStorage)
            const draftKey = `presenca_oer_draft_${dateStr}`;
            const savedState = localStorage.getItem(draftKey);
            if (savedState) {
                const parsed = JSON.parse(savedState);
                attendanceData = parsed.attendance || {};
                notesText = parsed.notes || "";
                notesTextarea.value = notesText;
                showToast(`Rascunho local carregado para ${formatDateDisplay(dateStr)}.`);
            } else {
                // 3. Se não houver rascunho local, consulta a base de eventos para preenchimento inteligente
                try {
                    const eventosRef = collection(db, "eventos");
                    const q = query(eventosRef, where("date", "==", dateStr), where("status", "==", "Confirmado"));
                    const querySnapshot = await getDocs(q);
                    
                    let eventosDoDia = [];
                    querySnapshot.forEach(doc => {
                        eventosDoDia.push(doc.data());
                    });
                    
                    if (eventosDoDia.length > 0) {
                        // Verifica se há alguma folga programada
                        const temFolga = eventosDoDia.some(e => e.tipo === 'folga');
                        
                        if (temFolga) {
                            // Se for folga, marca todos como "Não Escalado"
                            allMusicians.forEach(m => {
                                attendanceData[m.id] = { status: "nao_escalado", minutes: 0 };
                            });
                            showToast(`Presença inteligente: Folga programada. Todos marcados como Não Escalado.`);
                        } else {
                            // Verifica se há ensaios de naipe
                            const ensaiosNaipe = eventosDoDia.filter(e => e.tipo === 'ensaio_naipe');
                            const temTuttiOuConcerto = eventosDoDia.some(e => e.tipo === 'ensaio_tutti' || e.tipo === 'concerto');
                            
                            if (ensaiosNaipe.length > 0 && !temTuttiOuConcerto) {
                                // Apenas ensaios de naipe: escalamos apenas quem for dos naipes correspondentes
                                const naipesEscalados = ensaiosNaipe.map(e => normalizarNaipe(e.naipe || '')).filter(Boolean);
                                
                                allMusicians.forEach(m => {
                                    const musicoNaipe = normalizarNaipe(m.Instrumento || '');
                                    // Verifica se o naipe do músico corresponde a algum dos naipes do ensaio
                                    const estaEscalado = naipesEscalados.some(ne => 
                                        ne.includes(musicoNaipe) || musicoNaipe.includes(ne)
                                    );
                                    
                                    if (estaEscalado) {
                                        attendanceData[m.id] = { status: "none", minutes: 0 };
                                    } else {
                                        attendanceData[m.id] = { status: "nao_escalado", minutes: 0 };
                                    }
                                });
                                showToast(`Presença inteligente: Ensaio de Naipe (${ensaiosNaipe.map(e => e.naipe).join(', ')}).`);
                            } else {
                                // Tutti ou Concerto (ou ambos): todos são escalados por padrão
                                allMusicians.forEach(m => {
                                    attendanceData[m.id] = { status: "none", minutes: 0 };
                                });
                            }
                        }
                    } else {
                        // Sem eventos cadastrados: todos como pendentes por padrão
                        allMusicians.forEach(m => {
                            attendanceData[m.id] = { status: "none", minutes: 0 };
                        });
                    }
                } catch (eventError) {
                    console.error("Erro ao carregar eventos para presença inteligente:", eventError);
                    // Fallback para preenchimento padrão caso a consulta falhe
                    allMusicians.forEach(m => {
                        attendanceData[m.id] = { status: "none", minutes: 0 };
                    });
                }
            }
        }
        renderMusicians();
    } catch (e) {
        console.error("Erro ao carregar dados da data:", e);
        showToast("Erro ao carregar dados do histórico.");
    }
}

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

            card.innerHTML = `
                <div class="musician-info" id="info-${m.id}">
                    <div class="musician-name-container">
                        <span class="musician-name">${m.Nome}</span>
                        ${roleText}
                    </div>
                </div>
                <div class="badge-click-area" id="badge-area-${m.id}">
                    <span class="status-badge ${statusInfo.status === 'none' ? 'status-none' : ''}">
                        ${badgeLabel}
                    </span>
                </div>
            `;

            // Clique no nome: Presença rápida alternada (suporta duplo clique)
            card.querySelector(`#info-${m.id}`).addEventListener("click", () => {
                const now = new Date().getTime();
                const lastClickTime = clickTimestamps[m.id] || 0;
                
                if (now - lastClickTime < 400) {
                    // Duplo clique detectado
                    handleDoubleQuickPresence(m);
                    clickTimestamps[m.id] = 0; // Reseta para evitar triplo clique
                } else {
                    // Clique simples
                    handleQuickPresence(m);
                    clickTimestamps[m.id] = now;
                }
            });

            // Clique no badge: Abre painel de opções
            card.querySelector(`#badge-area-${m.id}`).addEventListener("click", () => {
                openDrawerForMusician(m);
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
    scrollToDelayValue(selectedDelayTemp);
    updateDelayDisplay(selectedDelayTemp);

    overlay.classList.add("open");
    statusDrawer.classList.add("open");
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

// Aplicar Alteração de Atraso
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

    if (selectedStatusTemp === "presenca") optBtnPresenca.classList.add("selected");
    else if (selectedStatusTemp === "falta") optBtnFalta.classList.add("selected");
    else if (selectedStatusTemp === "atestado") optBtnAtestado.classList.add("selected");
    else if (selectedStatusTemp === "nao_escalado") optBtnNaoEscalado.classList.add("selected");
    else if (selectedStatusTemp === "justificado") optBtnJustificado.classList.add("selected");

    // Exibir/Ocultar seção de justificativa e botão Justificado (comportamento transformável)
    if (selectedStatusTemp === "justificado") {
        justificationSection.style.display = "flex";
        optBtnJustificado.style.display = "none";
    } else {
        justificationSection.style.display = "none";
        optBtnJustificado.style.display = "flex";
    }

    // Exibir/Ocultar seção de atraso/rodinha
    const delaySection = document.querySelector(".delay-section");
    if (delaySection) {
        if (selectedStatusTemp === "nao_escalado") {
            delaySection.style.display = "none";
        } else {
            delaySection.style.display = "block";
        }
    }

    // Exibir/Ocultar botão Confirmar Atraso
    if (selectedDelayTemp > 0 && selectedStatusTemp === "atraso") {
        btnDelayConfirm.style.display = "inline-flex";
    } else {
        btnDelayConfirm.style.display = "none";
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
    const draftKey = `presenca_oer_draft_${selectedDate}`;
    const state = {
        attendance: attendanceData,
        notes: notesText
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

// Salvar Oficialmente no Firestore e Gerar Log
async function saveOfficialData() {
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
        // 1. Gravar dados da presença
        const docRef = doc(db, "presencas", selectedDate);
        await setDoc(docRef, {
            data: selectedDate,
            anotacoes: notesText,
            oficial: true,
            registros: attendanceData,
            ultimaAtualizacao: new Date().toISOString(),
            usuarioResponsavel: currentUserEmail
        });

        // 2. Contabilizar totais para detalhes do Log
        let presencas = 0, faltas = 0, atestados = 0, atrasos = 0, naoEscalados = 0, justificados = 0;
        registrados.forEach(r => {
            if (r.status === 'presenca') presencas++;
            else if (r.status === 'falta') faltas++;
            else if (r.status === 'atestado') atestados++;
            else if (r.status === 'atraso') atrasos++;
            else if (r.status === 'nao_escalado') naoEscalados++;
            else if (r.status === 'justificado') justificados++;
        });

        // 3. Definir tipo e mensagem do log com base na auditoria
        const formattedDate = formatDateDisplay(selectedDate);
        const logType = existedInFirestore ? "presenca-corrigida" : "presenca-salva";
        const logMessage = existedInFirestore 
            ? `Alteração retroativa realizada na lista de presença do dia ${formattedDate} por ${currentUserEmail}`
            : `Lista de presença do dia ${formattedDate} registrada por ${currentUserEmail}`;

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
                    btnDelayConfirm.style.display = "inline-flex";
                } else {
                    if (selectedStatusTemp === 'atraso') {
                        selectedStatusTemp = 'presenca';
                    }
                    btnDelayConfirm.style.display = "none";
                }
                
                // Atualiza destaques visuais do Drawer
                const btns = [optBtnPresenca, optBtnFalta, optBtnAtestado, optBtnNaoEscalado];
                btns.forEach(btn => btn.classList.remove("selected"));
                if (selectedStatusTemp === "presenca" && val === 0) {
                    optBtnPresenca.classList.add("selected");
                }
            }
        }, 80);
    });
}

// Scroll automático para centrar o valor da rodinha
function scrollToDelayValue(value) {
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
