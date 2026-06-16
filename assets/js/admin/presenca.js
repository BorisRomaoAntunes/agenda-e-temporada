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
    enableIndexedDbPersistence
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

// Drawer de Anotações
const notesDrawer = document.getElementById("notesDrawer");
const notesTextarea = document.getElementById("notesTextarea");
const btnOpenNotes = document.getElementById("btnOpenNotes");
const btnCancelNotes = document.getElementById("btnCancelNotes");
const btnSaveNotes = document.getElementById("btnSaveNotes");

// Botão Salvar Oficialmente
const btnSaveOfficial = document.getElementById("btnSaveOfficial");

// Estado da Aplicação
let currentUserEmail = "";
let allMusicians = []; // Lista carregada do Firestore
let attendanceData = {}; // { musicoId: { status: 'presenca'|'falta'|'atestado'|'atraso', minutes: 0 } }
let notesText = "";
let selectedDate = "";
let activeMusicianId = null;
let selectedStatusTemp = null;
let selectedDelayTemp = 0;
let existedInFirestore = false; // Indica se a lista da data selecionada já estava salva no Firestore

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

    // Eventos
    searchInput.addEventListener("input", renderMusicians);
    dateInput.addEventListener("change", handleDateChange);
    btnBackAdmin.addEventListener("click", () => window.location.replace("admin.html"));

    // Callbacks do Drawer de Status
    btnCancelDrawer.addEventListener("click", closeDrawer);
    overlay.addEventListener("click", closeDrawer);
    optBtnPresenca.addEventListener("click", () => instantSelectStatus("presenca"));
    optBtnFalta.addEventListener("click", () => instantSelectStatus("falta"));
    optBtnAtestado.addEventListener("click", () => instantSelectStatus("atestado"));
    btnDelayConfirm.addEventListener("click", applyDelayChange);

    // Callbacks de Anotações
    btnOpenNotes.addEventListener("click", openNotesDrawer);
    btnCancelNotes.addEventListener("click", closeDrawer);
    btnSaveNotes.addEventListener("click", saveNotes);

    // Salvar Oficialmente
    btnSaveOfficial.addEventListener("click", saveOfficialData);
    
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
            const status = (data.Status || '').toLowerCase().trim();
            
            // Filtros de segurança e inativos (idênticos ao admin.js)
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
                
                const instrumento = (data.INSTRUMENTOS || '').trim() || "Outros";

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
                // Preenche tudo como Pendente por padrão
                allMusicians.forEach(m => {
                    attendanceData[m.id] = { status: "none", minutes: 0 };
                });
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
        const matchName = m.Nome.toLowerCase().includes(query);
        const matchInst = m.Instrumento.toLowerCase().includes(query);
        
        if (query === "" || matchName || matchInst) {
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
            
            card.className = `musician-card ${statusInfo.status !== 'none' ? statusInfo.status : ''}`;
            card.id = `musician-card-${m.id}`;

            // Determinar o texto de exibição do status
            let badgeLabel = "Pendente";
            if (statusInfo.status === "presenca") badgeLabel = "Presença";
            else if (statusInfo.status === "falta") badgeLabel = "Falta";
            else if (statusInfo.status === "atestado") badgeLabel = "Atestado";
            else if (statusInfo.status === "atraso") {
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

            // Clique no nome: Presença rápida alternada
            card.querySelector(`#info-${m.id}`).addEventListener("click", () => {
                handleQuickPresence(m);
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

// Abrir Drawer de Status
function openDrawerForMusician(musician) {
    activeMusicianId = musician.id;
    const current = attendanceData[musician.id] || { status: "none", minutes: 0 };
    
    selectedStatusTemp = current.status;
    selectedDelayTemp = current.minutes;

    drawerTitle.innerText = musician.Nome;
    drawerSubtitle.innerText = `${musician.Instrumento} • ${musician.Status}`;

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
    showToast(`Registrado: ${status === 'presenca' ? 'Presença' : status === 'falta' ? 'Falta' : 'Atestado'}`);
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
    const btns = [optBtnPresenca, optBtnFalta, optBtnAtestado];
    btns.forEach(btn => btn.classList.remove("selected"));

    if (selectedStatusTemp === "presenca") optBtnPresenca.classList.add("selected");
    else if (selectedStatusTemp === "falta") optBtnFalta.classList.add("selected");
    else if (selectedStatusTemp === "atestado") optBtnAtestado.classList.add("selected");

    // Exibir/Ocultar botão Confirmar Atraso
    if (selectedDelayTemp > 0) {
        btnDelayConfirm.style.display = "inline-flex";
    } else {
        btnDelayConfirm.style.display = "none";
    }
}

// Fechar Qualquer Drawer
function closeDrawer() {
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
        let presencas = 0, faltas = 0, atestados = 0, atrasos = 0;
        registrados.forEach(r => {
            if (r.status === 'presenca') presencas++;
            else if (r.status === 'falta') faltas++;
            else if (r.status === 'atestado') atestados++;
            else if (r.status === 'atraso') atrasos++;
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
            details: `Presentes: ${presencas} | Faltas: ${faltas} | Atestados: ${atestados} | Atrasos: ${atrasos}`
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
                const btns = [optBtnPresenca, optBtnFalta, optBtnAtestado];
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
