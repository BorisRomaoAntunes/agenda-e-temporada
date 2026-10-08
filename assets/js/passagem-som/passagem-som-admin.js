/**
 * passagem-som-admin.js
 * Painel Administrativo de Passagem de Som (OER)
 * Relatórios em Tabela, WhatsApp diário, Exportação Excel/CSV,
 * Validação de Músicos e Construtor Visual de Nova Reavaliação
 */

import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    PassagemSomService,
    normalizarTexto,
    extrairDoisPrimeirosNomes,
    formatarDataBR,
    obterDiaSemanaCurto
} from "./passagem-som-service.js";

// Estado da Aplicação
let usuarioAtual = null;
let todosCiclos = [];
let todosAgendamentos = [];
let cicloSelecionado = null;
let agendamentosDoCiclo = [];
let musicosAtivos = [];
let filtroInstrumento = "todos";
let filtroStatus = "todos";
let filtroTexto = "";
let ordenacaoAtual = { coluna: "nome", direcao: "asc" };
let dataSelecionadaWhatsApp = "";

// Estado do Construtor de Reavaliação
let p1Config = {
    dataInicio: "",
    dataFim: "",
    duracao: 30,
    weekdays: [1, 2, 3, 4, 5],
    intervalos: [{ inicio: "13:30", fim: "17:00" }],
    dias: []
};

let p2Config = {
    dataInicio: "",
    dataFim: "",
    duracao: 30,
    weekdays: [1, 2, 3, 4, 5],
    intervalos: [{ inicio: "13:30", fim: "17:00" }],
    dias: []
};

// Elementos DOM
const loaderEl = document.getElementById("loader");
const toastEl = document.getElementById("toastMsg");
const selectCicloEl = document.getElementById("selectCiclo");
const btnHeaderCopyLink = document.getElementById("btnHeaderCopyLink");

// Gestão de Passagens DOM
const gridGestaoCiclos = document.getElementById("gridGestaoCiclos");
const countCiclosBadge = document.getElementById("countCiclosBadge");
const btnCriarNovaPassagemAba = document.getElementById("btnCriarNovaPassagemAba");

// Validação Card
const validationCardEl = document.getElementById("validationCard");
const validationCountBadgeEl = document.getElementById("validationCountBadge");
const validationListEl = document.getElementById("validationList");

// Tabela
const tbodyAgendamentos = document.getElementById("tbodyAgendamentos");
const inputBusca = document.getElementById("inputBusca");
const selectFiltroInstrumento = document.getElementById("selectFiltroInstrumento");
const selectFiltroStatus = document.getElementById("selectFiltroStatus");
const btnExportarCSV = document.getElementById("btnExportarCSV");
const btnImprimirTabela = document.getElementById("btnImprimirTabela");
const countAgendamentosBadge = document.getElementById("countAgendamentosBadge");
const printTituloCiclo = document.getElementById("printTituloCiclo");
const printDataAtualizacao = document.getElementById("printDataAtualizacao");

// WhatsApp
const inputDataWhatsApp = document.getElementById("inputDataWhatsApp");
const whatsappPreviewEl = document.getElementById("whatsappPreview");
const btnCopiarWhatsApp = document.getElementById("btnCopiarWhatsApp");

// Campos Gerais de Reavaliação
const cicloNomeInput = document.getElementById("cicloNomeInput");
const cicloTituloInput = document.getElementById("cicloTituloInput");
const cicloAvisoInput = document.getElementById("cicloAvisoInput");
const cicloLocalInput = document.getElementById("cicloLocalInput");
const cicloAtivoCheckbox = document.getElementById("cicloAtivoCheckbox");
const btnSalvarCiclo = document.getElementById("btnSalvarCiclo");
const btnNovoCiclo = document.getElementById("btnNovoCiclo");

// Construtor 1ª Passagem DOM
const p1DataInicioEl = document.getElementById("p1DataInicio");
const p1DataFimEl = document.getElementById("p1DataFim");
const p1DuracaoSlotEl = document.getElementById("p1DuracaoSlot");
const p1WeekdaysContainer = document.getElementById("p1Weekdays");
const p1IntervalosContainer = document.getElementById("p1IntervalosContainer");
const btnP1AddIntervalo = document.getElementById("btnP1AddIntervalo");
const btnP1GerarGrade = document.getElementById("btnP1GerarGrade");
const p1DiasPreview = document.getElementById("p1DiasPreview");

// Construtor 2ª Passagem DOM
const p2DataInicioEl = document.getElementById("p2DataInicio");
const p2DataFimEl = document.getElementById("p2DataFim");
const p2DuracaoSlotEl = document.getElementById("p2DuracaoSlot");
const p2WeekdaysContainer = document.getElementById("p2Weekdays");
const p2IntervalosContainer = document.getElementById("p2IntervalosContainer");
const btnP2AddIntervalo = document.getElementById("btnP2AddIntervalo");
const btnP2GerarGrade = document.getElementById("btnP2GerarGrade");
const p2DiasPreview = document.getElementById("p2DiasPreview");

// Modal Edição Agendamento
const modalEditarAgendamento = document.getElementById("modalEditarAgendamento");
const formEditarAgendamento = document.getElementById("formEditarAgendamento");
let agendamentoSendoEditado = null;

function mostrarToast(mensagem, tipo = "info") {
    if (!toastEl) return;
    toastEl.textContent = mensagem;
    toastEl.className = `toast-msg ${tipo} show`;
    setTimeout(() => {
        toastEl.classList.remove("show");
    }, 4000);
}

// =========================================================================
// CONTROLE DE AUTENTICAÇÃO
// =========================================================================
let authCheckHandled = false;
const authFallbackTimer = setTimeout(() => {
    if (!authCheckHandled) {
        authCheckHandled = true;
        if (loaderEl) loaderEl.classList.add("hidden");
        if (!auth.currentUser) {
            window.location.replace("admin.html");
        }
    }
}, 4000);

onAuthStateChanged(auth, async (user) => {
    if (authCheckHandled) return;
    authCheckHandled = true;
    clearTimeout(authFallbackTimer);

    if (user) {
        usuarioAtual = user;
        inicializarAdmin();
    } else {
        window.location.replace("admin.html");
    }
});

// =========================================================================
// INICIALIZAÇÃO DO ADMIN
// =========================================================================
async function inicializarAdmin() {
    try {
        await PassagemSomService.inicializarCicloPadraoSeNecessario();
        musicosAtivos = await PassagemSomService.getMusicosAtivos();
        PassagemSomService.sincronizarCatalogoPublicoMusicos().catch((e) => console.warn(e));

        // Carrega ciclos / reavaliações
        PassagemSomService.listenTodosCiclos((ciclos) => {
            todosCiclos = ciclos;
            atualizarSelectCiclos();
            renderizarGestaoCiclos();

            if (!cicloSelecionado && ciclos.length > 0) {
                const ativo = ciclos.find((c) => c.ativo) || ciclos[0];
                selecionarCiclo(ativo.id);
            }
            if (loaderEl) loaderEl.classList.add("hidden");
        });

        // Escuta todos os agendamentos para métricas dos cards em tempo real
        PassagemSomService.listenTodosAgendamentos((agendamentos) => {
            todosAgendamentos = agendamentos;
            renderizarGestaoCiclos();
        });

    } catch (e) {
        console.error("Erro ao inicializar admin:", e);
        mostrarToast("Erro ao carregar dados.", "error");
        if (loaderEl) loaderEl.classList.add("hidden");
    }
}

function atualizarSelectCiclos() {
    selectCicloEl.innerHTML = "";
    todosCiclos.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.nome} ${c.ativo ? "(Ativa)" : ""}`;
        if (cicloSelecionado && cicloSelecionado.id === c.id) {
            opt.selected = true;
        }
        selectCicloEl.appendChild(opt);
    });
}

selectCicloEl.addEventListener("change", (e) => {
    selecionarCiclo(e.target.value);
});

let unsubscribeAgendamentos = null;
function selecionarCiclo(cicloId) {
    cicloSelecionado = todosCiclos.find((c) => c.id === cicloId) || null;
    if (!cicloSelecionado) return;

    if (printTituloCiclo) {
        printTituloCiclo.textContent = `Lista de Agendamentos Passagem de Som - ${cicloSelecionado.nome}`;
    }
    if (printDataAtualizacao) {
        const hoje = new Date();
        const dd = String(hoje.getDate()).padStart(2, "0");
        const mm = String(hoje.getMonth() + 1).padStart(2, "0");
        const yyyy = hoje.getFullYear();
        printDataAtualizacao.textContent = `Atualização ${dd}/${mm}/${yyyy}`;
    }

    carregarDadosReavaliacao(cicloSelecionado);

    // Escuta agendamentos do ciclo selecionado
    if (unsubscribeAgendamentos) unsubscribeAgendamentos();
    unsubscribeAgendamentos = PassagemSomService.listenAgendamentos(cicloSelecionado.id, (agendamentos) => {
        agendamentosDoCiclo = agendamentos;
        renderizarValidacaoMusicos();
        atualizarSelectInstrumentos();
        renderizarTabela();
        atualizarPreviewWhatsApp();
    });
}

// Copiar Link Público da Passagem Atualmente Selecionada
btnHeaderCopyLink.addEventListener("click", () => {
    let url = window.location.href.replace("passagem-som-admin.html", "passagem-som.html");
    if (cicloSelecionado && cicloSelecionado.id) {
        url = `${window.location.origin}${window.location.pathname.replace("passagem-som-admin.html", "passagem-som.html")}?id=${encodeURIComponent(cicloSelecionado.id)}`;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            mostrarToast("Link público da passagem selecionada copiado com sucesso!", "success");
        }).catch(() => {
            prompt("Copie o link:", url);
        });
    } else {
        prompt("Copie o link:", url);
    }
});

// =========================================================================
// CARD DE VALIDAÇÃO DE MÚSICOS (ASSISTENTE INTELIGENTE)
// =========================================================================
function renderizarValidacaoMusicos() {
    const pendentes = agendamentosDoCiclo.filter((ag) => ag.statusVinculo === "pendente_validacao");

    if (pendentes.length === 0) {
        validationCardEl.style.display = "none";
        return;
    }

    validationCardEl.style.display = "block";
    validationCountBadgeEl.textContent = `${pendentes.length} pendente(s)`;
    validationListEl.innerHTML = "";

    pendentes.forEach((ag) => {
        const item = document.createElement("div");
        item.className = "validation-item";

        // Sugestão inicial por correspondência
        const match = PassagemSomService.encontrarMusicoCorrespondente(ag.nomeDigitado, musicosAtivos);

        // Monta o seletor com todos os músicos ativos
        let optionsHtml = `<option value="">-- Selecione o Músico Oficial --</option>`;
        musicosAtivos.forEach((m) => {
            const isMatch = match.musico && match.musico.id === m.id;
            optionsHtml += `<option value="${m.id}" ${isMatch ? "selected" : ""}>${m.nome} (${m.instrumento || 'Sem inst'})</option>`;
        });

        item.innerHTML = `
            <div style="flex: 1; min-width: 260px;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <strong style="color: var(--oer-text-main); font-size: 0.95rem;">${ag.nomeDigitado}</strong>
                    <span class="badge badge-pendente">Aguardando Validação</span>
                </div>
                <p style="font-size: 0.82rem; color: var(--oer-text-muted);">
                    Digitado: <strong>${ag.instrumento}</strong> | Obra: <em>${ag.repertorio}</em>
                </p>
                <p style="font-size: 0.78rem; color: #94a3b8; margin-top: 0.2rem;">
                    1ª Passagem: ${formatarDataBR(ag.primeiraPassagem.data)} às ${ag.primeiraPassagem.horario} | 
                    2ª Passagem: ${formatarDataBR(ag.segundaPassagem.data)} às ${ag.segundaPassagem.horario}
                </p>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <select class="form-input select-musico-val" style="padding: 0.45rem 0.7rem; font-size: 0.85rem; max-width: 280px;">
                    ${optionsHtml}
                </select>
                <button type="button" class="btn btn-success btn-sm btn-confirmar-vinculo" title="Confirmar vínculo e associar ao banco de dados">
                    <i data-lucide="check" style="width: 14px; height: 14px;"></i> Vincular
                </button>
            </div>
        `;

        const btnVincular = item.querySelector(".btn-confirmar-vinculo");
        const selectMusico = item.querySelector(".select-musico-val");

        btnVincular.addEventListener("click", async () => {
            const chosenId = selectMusico.value;
            if (!chosenId) {
                mostrarToast("Por favor, selecione um músico da lista.", "warning");
                return;
            }

            const chosenMusico = musicosAtivos.find((m) => m.id === chosenId);
            try {
                btnVincular.disabled = true;
                await PassagemSomService.validarVinculoMusico(ag.id, chosenId, chosenMusico?.nome);
                mostrarToast(`Vínculo de "${ag.nomeDigitado}" confirmado com sucesso!`, "success");
            } catch (err) {
                console.error("Erro ao vincular:", err);
                mostrarToast("Erro ao vincular músico.", "error");
            }
        });

        validationListEl.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
}

// =========================================================================
// RENDERIZAÇÃO DA TABELA DE AGENDAMENTOS
// =========================================================================
function atualizarSelectInstrumentos() {
    if (!selectFiltroInstrumento) return;
    const valorAtual = selectFiltroInstrumento.value || "todos";
    const instrumentos = Array.from(
        new Set(
            agendamentosDoCiclo
                .map((ag) => ag.instrumento ? ag.instrumento.trim() : "")
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

    selectFiltroInstrumento.innerHTML = `<option value="todos">Todos os Instrumentos</option>`;
    instrumentos.forEach((inst) => {
        const opt = document.createElement("option");
        opt.value = inst;
        opt.textContent = inst;
        if (inst.toLowerCase() === valorAtual.toLowerCase()) {
            opt.selected = true;
        }
        selectFiltroInstrumento.appendChild(opt);
    });
}

function normalizarLinhasTabela() {
    return agendamentosDoCiclo.map((ag) => {
        const p1Data = ag.primeiraPassagem?.data || "";
        const p1Hora = ag.primeiraPassagem?.horario || "";
        const p2Data = ag.segundaPassagem?.data || "";
        const p2Hora = ag.segundaPassagem?.horario || "";

        return {
            agendamentoId: ag.id,
            nome: ag.nomeDigitado || "",
            nomeOficial: ag.musicoNomeOficial || "",
            instrumento: ag.instrumento || "",
            repertorio: ag.repertorio || "",
            p1Data,
            p1Hora,
            p1DataHoraISO: p1Data && p1Hora ? `${p1Data}T${p1Hora}` : (p1Data || ""),
            p2Data,
            p2Hora,
            p2DataHoraISO: p2Data && p2Hora ? `${p2Data}T${p2Hora}` : (p2Data || ""),
            statusVinculo: ag.statusVinculo || "pendente_validacao",
            musicoId: ag.musicoId || null,
            raw: ag
        };
    });
}

function atualizarIndicadoresOrdenacao() {
    document.querySelectorAll(".th-sortable").forEach((th) => {
        const col = th.getAttribute("data-sort");
        const indicator = th.querySelector(".sort-icon-indicator");
        if (col === ordenacaoAtual.coluna) {
            th.classList.add("active-sort");
            if (indicator) {
                indicator.innerHTML = ordenacaoAtual.direcao === "asc"
                    ? `<i data-lucide="arrow-up" style="width: 14px; height: 14px;"></i>`
                    : `<i data-lucide="arrow-down" style="width: 14px; height: 14px;"></i>`;
            }
        } else {
            th.classList.remove("active-sort");
            if (indicator) {
                indicator.innerHTML = `<i data-lucide="arrow-up-down" style="width: 13px; height: 13px; opacity: 0.35;"></i>`;
            }
        }
    });
    if (window.lucide) lucide.createIcons();
}

function renderizarTabela() {
    let linhas = normalizarLinhasTabela();

    // Filtro por Texto (busca geral)
    if (filtroTexto) {
        const q = normalizarTexto(filtroTexto);
        linhas = linhas.filter((l) => {
            return (
                normalizarTexto(l.nome).includes(q) ||
                normalizarTexto(l.instrumento).includes(q) ||
                normalizarTexto(l.repertorio).includes(q) ||
                (l.nomeOficial && normalizarTexto(l.nomeOficial).includes(q))
            );
        });
    }

    // Filtro por Instrumento
    if (filtroInstrumento && filtroInstrumento !== "todos") {
        const instNorm = normalizarTexto(filtroInstrumento);
        linhas = linhas.filter((l) => normalizarTexto(l.instrumento) === instNorm);
    }

    // Filtro por Status de Vínculo
    if (filtroStatus && filtroStatus !== "todos") {
        linhas = linhas.filter((l) => l.statusVinculo === filtroStatus);
    }

    // Ordenação interativa por coluna
    linhas.sort((a, b) => {
        let cmp = 0;
        switch (ordenacaoAtual.coluna) {
            case "nome":
                cmp = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
                break;
            case "instrumento":
                cmp = a.instrumento.localeCompare(b.instrumento, "pt-BR", { sensitivity: "base" });
                break;
            case "p1":
                cmp = (a.p1DataHoraISO || "").localeCompare(b.p1DataHoraISO || "");
                break;
            case "p2":
                cmp = (a.p2DataHoraISO || "").localeCompare(b.p2DataHoraISO || "");
                break;
            case "obra":
                cmp = a.repertorio.localeCompare(b.repertorio, "pt-BR", { sensitivity: "base" });
                break;
            default:
                cmp = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
        }
        return ordenacaoAtual.direcao === "desc" ? -cmp : cmp;
    });

    countAgendamentosBadge.textContent = `${linhas.length} agendamento${linhas.length === 1 ? '' : 's'}`;
    tbodyAgendamentos.innerHTML = "";

    if (linhas.length === 0) {
        tbodyAgendamentos.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--oer-text-muted); padding: 2rem;">
                    Nenhum agendamento encontrado com os filtros aplicados.
                </td>
            </tr>
        `;
        atualizarIndicadoresOrdenacao();
        return;
    }

    linhas.forEach((linha) => {
        const tr = document.createElement("tr");

        const isVinculado = linha.statusVinculo === "vinculado";
        const vinculoIcon = isVinculado
            ? `<span class="check-vinculo-icon" title="Vinculado oficialmente: ${linha.nomeOficial || linha.nome}"><i data-lucide="check" style="width: 15px; height: 15px; stroke-width: 2.8;"></i></span>`
            : `<span class="check-pendente-icon" title="Vínculo pendente de validação (confira no card acima)"><i data-lucide="alert-circle" style="width: 15px; height: 15px;"></i></span>`;

        const p1Formatada = linha.p1Data
            ? `<span style="font-weight: 600;">${formatarDataBR(linha.p1Data)}</span> <span style="color: var(--oer-text-muted); font-size: 0.84rem; margin-left: 0.25rem;">${linha.p1Hora}</span>`
            : `<span style="color: var(--oer-text-muted); font-style: italic;">Não agendada</span>`;

        const p2Formatada = linha.p2Data
            ? `<span style="font-weight: 600;">${formatarDataBR(linha.p2Data)}</span> <span style="color: var(--oer-text-muted); font-size: 0.84rem; margin-left: 0.25rem;">${linha.p2Hora}</span>`
            : `<span style="color: var(--oer-text-muted); font-style: italic;">Não agendada</span>`;

        tr.innerHTML = `
            <td>
                <div class="cell-nome-content">
                    ${vinculoIcon}
                    <span style="font-weight: 600;">${linha.nome}</span>
                </div>
            </td>
            <td>${linha.instrumento}</td>
            <td style="white-space: nowrap;">${p1Formatada}</td>
            <td style="white-space: nowrap;">${p2Formatada}</td>
            <td>${linha.repertorio || '<span style="color: var(--oer-text-muted); font-style: italic;">-</span>'}</td>
            <td class="no-print" style="text-align: right; white-space: nowrap;">
                <div class="table-actions-group">
                    <button type="button" class="btn btn-outline btn-sm btn-table-action btn-editar-ag" title="Editar Agendamento">
                        <i data-lucide="pencil" style="width: 13px; height: 13px;"></i>
                    </button>
                    <button type="button" class="btn btn-danger btn-sm btn-table-action btn-excluir-ag" title="Excluir Agendamento">
                        <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                    </button>
                </div>
            </td>
        `;

        tr.querySelector(".btn-editar-ag").addEventListener("click", () => {
            abrirModalEditar(linha.raw);
        });

        tr.querySelector(".btn-excluir-ag").addEventListener("click", async () => {
            if (confirm(`Tem certeza que deseja cancelar o agendamento de "${linha.nome}"? Os horários ficarão livres imediatamente.`)) {
                try {
                    await PassagemSomService.cancelarAgendamento(linha.agendamentoId);
                    mostrarToast("Agendamento excluído com sucesso!", "success");
                } catch (e) {
                    mostrarToast("Erro ao excluir agendamento.", "error");
                }
            }
        });

        tbodyAgendamentos.appendChild(tr);
    });

    atualizarIndicadoresOrdenacao();
}

// Filtros da Tabela
inputBusca.addEventListener("input", (e) => {
    filtroTexto = e.target.value.trim();
    renderizarTabela();
});

if (selectFiltroInstrumento) {
    selectFiltroInstrumento.addEventListener("change", (e) => {
        filtroInstrumento = e.target.value;
        renderizarTabela();
    });
}

if (selectFiltroStatus) {
    selectFiltroStatus.addEventListener("change", (e) => {
        filtroStatus = e.target.value;
        renderizarTabela();
    });
}

// Ordenação ao clicar no cabeçalho das colunas
document.querySelectorAll(".th-sortable").forEach((th) => {
    th.addEventListener("click", () => {
        const colunaClicada = th.getAttribute("data-sort");
        if (ordenacaoAtual.coluna === colunaClicada) {
            ordenacaoAtual.direcao = ordenacaoAtual.direcao === "asc" ? "desc" : "asc";
        } else {
            ordenacaoAtual.coluna = colunaClicada;
            ordenacaoAtual.direcao = "asc";
        }
        renderizarTabela();
    });
});

// =========================================================================
// EXPORTAÇÃO EXCEL / CSV
// =========================================================================
btnExportarCSV.addEventListener("click", () => {
    const linhas = normalizarLinhasTabela();
    if (linhas.length === 0) {
        mostrarToast("Não há dados para exportar.", "warning");
        return;
    }

    const cabecalho = ["Nome", "Instrumento", "1ª Passagem", "2ª Passagem", "OBRA", "Status Vínculo"];
    const linhasCSV = [cabecalho.join(";")];

    linhas.forEach((l) => {
        const p1Str = l.p1Data ? `${formatarDataBR(l.p1Data)} ${l.p1Hora}` : "";
        const p2Str = l.p2Data ? `${formatarDataBR(l.p2Data)} ${l.p2Hora}` : "";
        const item = [
            `"${l.nome.replace(/"/g, '""')}"`,
            `"${l.instrumento.replace(/"/g, '""')}"`,
            `"${p1Str}"`,
            `"${p2Str}"`,
            `"${l.repertorio.replace(/"/g, '""')}"`,
            `"${l.statusVinculo === 'vinculado' ? 'Vinculado' : 'Pendente'}"`
        ];
        linhasCSV.push(item.join(";"));
    });

    const csvContent = "\uFEFF" + linhasCSV.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const nomeArquivo = `agendamentos_passagem_de_som_${cicloSelecionado?.id || 'relatorio'}.csv`;
    link.setAttribute("download", nomeArquivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    mostrarToast("Planilha gerada e baixada com sucesso!", "success");
});

btnImprimirTabela.addEventListener("click", () => {
    window.print();
});

// =========================================================================
// RELATÓRIO DIÁRIO PARA WHATSAPP
// =========================================================================
function atualizarPreviewWhatsApp() {
    if (!cicloSelecionado) return;

    const todasDatasComAgendamento = new Set();
    agendamentosDoCiclo.forEach((ag) => {
        if (ag.primeiraPassagem) todasDatasComAgendamento.add(ag.primeiraPassagem.data);
        if (ag.segundaPassagem) todasDatasComAgendamento.add(ag.segundaPassagem.data);
    });

    const datasOrdenadas = Array.from(todasDatasComAgendamento).sort();

    if (!dataSelecionadaWhatsApp) {
        const hoje = new Date();
        const amanha = new Date(hoje);
        amanha.setDate(hoje.getDate() + 1);
        const yyyy = amanha.getFullYear();
        const mm = String(amanha.getMonth() + 1).padStart(2, "0");
        const dd = String(amanha.getDate()).padStart(2, "0");
        const amanhaStr = `${yyyy}-${mm}-${dd}`;

        dataSelecionadaWhatsApp = datasOrdenadas.includes(amanhaStr) ? amanhaStr : (datasOrdenadas[0] || amanhaStr);
        inputDataWhatsApp.value = dataSelecionadaWhatsApp;
    }

    const doDia = [];
    agendamentosDoCiclo.forEach((ag) => {
        if (ag.primeiraPassagem && ag.primeiraPassagem.data === dataSelecionadaWhatsApp) {
            doDia.push({
                horario: ag.primeiraPassagem.horario,
                nome: ag.nomeDigitado,
                instrumento: ag.instrumento
            });
        }
        if (ag.segundaPassagem && ag.segundaPassagem.data === dataSelecionadaWhatsApp) {
            doDia.push({
                horario: ag.segundaPassagem.horario,
                nome: ag.nomeDigitado,
                instrumento: ag.instrumento
            });
        }
    });

    doDia.sort((a, b) => a.horario.localeCompare(b.horario));

    const diaSem = obterDiaSemanaCurto(dataSelecionadaWhatsApp);
    const dataFormatadaDia = formatarDataBR(dataSelecionadaWhatsApp).substring(0, 5);
    const local = cicloSelecionado.local || "sala de Ensaio OSM/OER";
    const avisoDeclaracao = cicloSelecionado.avisoDeclaracao || "DECLARAÇÃO de ESTUDO deverá ser enviada para o Inspetor da OER até sua SEGUNDA PASSAGEM DE SOM - Caso precise do documento, solicite ao Inspetor da OER";

    let textoMsg = `Boa tarde!\n\nSegue o cronograma de passagem de som para amanhã dia ${dataFormatadaDia} (${diaSem}), na ${local}:\n\n`;

    if (doDia.length === 0) {
        textoMsg += `(Nenhum músico agendado para esta data)\n\n`;
    } else {
        doDia.forEach((m) => {
            const doisNomes = extrairDoisPrimeirosNomes(m.nome);
            textoMsg += `• ${m.horario} – ${doisNomes} (${m.instrumento})\n`;
        });
        textoMsg += `\n`;
    }

    textoMsg += `ATENÇÃO: ${avisoDeclaracao}\n\nQualquer dúvida, estou à disposição.`;
    whatsappPreviewEl.textContent = textoMsg;
}

inputDataWhatsApp.addEventListener("change", (e) => {
    dataSelecionadaWhatsApp = e.target.value;
    atualizarPreviewWhatsApp();
});

btnCopiarWhatsApp.addEventListener("click", () => {
    const texto = whatsappPreviewEl.textContent;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarToast("Mensagem copiada para o WhatsApp com sucesso!", "success");
    }).catch(() => {
        mostrarToast("Não foi possível copiar automaticamente.", "error");
    });
});

// =========================================================================
// CONSTRUTOR DE DISPONIBILIDADE: CÁLCULOS DE HORÁRIOS & INTERVALOS
// =========================================================================

function gerarSlotsNoIntervalo(horaInicio, horaFim, duracaoMinutos) {
    const slots = [];
    if (!horaInicio || !horaFim || !duracaoMinutos) return slots;
    const [hI, mI] = horaInicio.split(":").map(Number);
    const [hF, mF] = horaFim.split(":").map(Number);
    let curMin = hI * 60 + mI;
    const endMin = hF * 60 + mF;
    while (curMin < endMin) {
        const h = String(Math.floor(curMin / 60)).padStart(2, "0");
        const m = String(curMin % 60).padStart(2, "0");
        slots.push(`${h}:${m}`);
        curMin += duracaoMinutos;
    }
    return slots;
}

function gerarGradeParaPeriodo(dataInicio, dataFim, weekdays, intervalos, duracaoMinutos) {
    if (!dataInicio || !dataFim) return [];
    const [yI, mI, dI] = dataInicio.split("-").map(Number);
    const [yF, mF, dF] = dataFim.split("-").map(Number);

    const start = new Date(yI, mI - 1, dI);
    const end = new Date(yF, mF - 1, dF);
    if (start > end) return [];

    const dias = [];
    let cur = new Date(start);
    const nomesDias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    while (cur <= end) {
        const dayOfWeek = cur.getDay();
        if (weekdays.includes(dayOfWeek)) {
            const yyyy = cur.getFullYear();
            const mm = String(cur.getMonth() + 1).padStart(2, "0");
            const dd = String(cur.getDate()).padStart(2, "0");
            const dataStr = `${yyyy}-${mm}-${dd}`;

            let horariosDoDia = [];
            intervalos.forEach((inter) => {
                if (inter.inicio && inter.fim) {
                    const slots = gerarSlotsNoIntervalo(inter.inicio, inter.fim, duracaoMinutos);
                    horariosDoDia.push(...slots);
                }
            });

            horariosDoDia = Array.from(new Set(horariosDoDia)).sort();

            dias.push({
                data: dataStr,
                diaSemana: nomesDias[dayOfWeek],
                horarios: horariosDoDia
            });
        }
        cur.setDate(cur.getDate() + 1);
    }
    return dias;
}

// Renderiza a lista de múltiplos intervalos com o botão de excluir
function renderizarIntervalosUI(containerEl, configObj, callbackAtualizar) {
    containerEl.innerHTML = "";
    configObj.intervalos.forEach((inter, idx) => {
        const row = document.createElement("div");
        row.className = "intervalo-row";
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.4rem;">
                <span style="font-size: 0.8rem; font-weight: 600; color: var(--oer-text-muted);">Intervalo ${idx + 1}:</span>
                <input type="time" class="form-input input-inter-inicio" value="${inter.inicio || '13:30'}" style="padding: 0.35rem 0.6rem; font-size: 0.85rem;">
                <span style="font-size: 0.8rem; color: var(--oer-text-muted);">às</span>
                <input type="time" class="form-input input-inter-fim" value="${inter.fim || '17:00'}" style="padding: 0.35rem 0.6rem; font-size: 0.85rem;">
            </div>
            ${configObj.intervalos.length > 1 ? `
            <button type="button" class="btn btn-outline btn-sm btn-del-intervalo" title="Remover este intervalo" style="padding: 0.3rem 0.6rem; color: var(--oer-danger);">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
            ` : ""}
        `;

        row.querySelector(".input-inter-inicio").addEventListener("change", (e) => {
            inter.inicio = e.target.value;
        });
        row.querySelector(".input-inter-fim").addEventListener("change", (e) => {
            inter.fim = e.target.value;
        });

        const btnDel = row.querySelector(".btn-del-intervalo");
        if (btnDel) {
            btnDel.addEventListener("click", () => {
                configObj.intervalos.splice(idx, 1);
                renderizarIntervalosUI(containerEl, configObj, callbackAtualizar);
            });
        }

        containerEl.appendChild(row);
    });

    if (window.lucide) lucide.createIcons();
}

// Renderiza a grade visual de dias com chips de horários
function renderizarDiasPreviewUI(containerEl, diasArray) {
    containerEl.innerHTML = "";
    if (!diasArray || diasArray.length === 0) {
        containerEl.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 1.5rem; text-align: center; color: var(--oer-text-muted); background: #f8fafc; border-radius: 8px; border: 1px dashed var(--oer-border);">
                Nenhum dia configurado ainda. Defina as datas e intervalos acima e clique em <strong>Gerar Grade</strong>.
            </div>
        `;
        return;
    }

    diasArray.forEach((d, diaIdx) => {
        const card = document.createElement("div");
        card.className = "dia-card";

        let chipsHtml = "";
        d.horarios.forEach((h, hIdx) => {
            chipsHtml += `
                <span class="slot-chip" data-dia="${diaIdx}" data-hora="${h}">
                    ${h}
                    <button type="button" class="btn-del-slot" title="Remover este horário">&times;</button>
                </span>
            `;
        });

        card.innerHTML = `
            <div class="dia-card-header">
                <span class="dia-card-title">${formatarDataBR(d.data)} (${d.diaSemana || obterDiaSemanaCurto(d.data)})</span>
                <span class="dia-card-badge">${d.horarios.length} horários</span>
            </div>
            <div class="chips-slots-container">
                ${chipsHtml}
                <button type="button" class="btn-add-slot-chip" title="Adicionar horário avulso a este dia">
                    + Horário
                </button>
            </div>
        `;

        // Evento de remover horário individual
        card.querySelectorAll(".slot-chip").forEach((chip) => {
            const btnDel = chip.querySelector(".btn-del-slot");
            btnDel.addEventListener("click", () => {
                const horaParaRemover = chip.getAttribute("data-hora");
                d.horarios = d.horarios.filter((h) => h !== horaParaRemover);
                renderizarDiasPreviewUI(containerEl, diasArray);
            });
        });

        // Evento de adicionar horário avulso
        const btnAdd = card.querySelector(".btn-add-slot-chip");
        btnAdd.addEventListener("click", () => {
            const novoH = prompt("Digite o horário a adicionar neste dia (ex: 18:30):");
            if (novoH && /^\d{1,2}:\d{2}$/.test(novoH.trim())) {
                const horaFormatada = novoH.trim().padStart(5, "0");
                if (!d.horarios.includes(horaFormatada)) {
                    d.horarios.push(horaFormatada);
                    d.horarios.sort();
                    renderizarDiasPreviewUI(containerEl, diasArray);
                }
            } else if (novoH) {
                mostrarToast("Formato inválido. Use HH:MM (ex: 14:00).", "error");
            }
        });

        containerEl.appendChild(card);
    });
}

// Botões de Adicionar Intervalo (+)
btnP1AddIntervalo.addEventListener("click", () => {
    p1Config.intervalos.push({ inicio: "17:30", fim: "19:30" });
    renderizarIntervalosUI(p1IntervalosContainer, p1Config);
});

btnP2AddIntervalo.addEventListener("click", () => {
    p2Config.intervalos.push({ inicio: "17:30", fim: "19:30" });
    renderizarIntervalosUI(p2IntervalosContainer, p2Config);
});

// Botão Gerar Grade 1ª Passagem
btnP1GerarGrade.addEventListener("click", () => {
    const dataInicio = p1DataInicioEl.value;
    const dataFim = p1DataFimEl.value;
    const duracao = parseInt(p1DuracaoSlotEl.value, 10) || 30;

    // Checkboxes selecionados
    const weekdays = [];
    p1WeekdaysContainer.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
        weekdays.push(parseInt(cb.value, 10));
    });

    if (!dataInicio || !dataFim) {
        mostrarToast("Informe a Data Inicial e Data Final para a 1ª Passagem.", "warning");
        return;
    }

    p1Config.dataInicio = dataInicio;
    p1Config.dataFim = dataFim;
    p1Config.duracao = duracao;
    p1Config.weekdays = weekdays;

    p1Config.dias = gerarGradeParaPeriodo(dataInicio, dataFim, weekdays, p1Config.intervalos, duracao);
    renderizarDiasPreviewUI(p1DiasPreview, p1Config.dias);
    mostrarToast(`Grade da 1ª Passagem gerada com ${p1Config.dias.length} dias!`, "success");
});

// Botão Gerar Grade 2ª Passagem
btnP2GerarGrade.addEventListener("click", () => {
    const dataInicio = p2DataInicioEl.value;
    const dataFim = p2DataFimEl.value;
    const duracao = parseInt(p2DuracaoSlotEl.value, 10) || 30;

    const weekdays = [];
    p2WeekdaysContainer.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
        weekdays.push(parseInt(cb.value, 10));
    });

    if (!dataInicio || !dataFim) {
        mostrarToast("Informe a Data Inicial e Data Final para a 2ª Passagem.", "warning");
        return;
    }

    p2Config.dataInicio = dataInicio;
    p2Config.dataFim = dataFim;
    p2Config.duracao = duracao;
    p2Config.weekdays = weekdays;

    p2Config.dias = gerarGradeParaPeriodo(dataInicio, dataFim, weekdays, p2Config.intervalos, duracao);
    renderizarDiasPreviewUI(p2DiasPreview, p2Config.dias);
    mostrarToast(`Grade da 2ª Passagem gerada com ${p2Config.dias.length} dias!`, "success");
});

// =========================================================================
// CARREGAR E SALVAR REAVALIAÇÃO NO FIRESTORE
// =========================================================================
function carregarDadosReavaliacao(c) {
    cicloNomeInput.value = c.nome || "";
    cicloTituloInput.value = c.titulo || "";
    cicloAvisoInput.value = c.avisoDeclaracao || "DECLARAÇÃO de ESTUDO deverá ser enviada para o Inspetor da OER até sua SEGUNDA PASSAGEM DE SOM - Caso precise do documento, solicite ao Inspetor da OER";
    cicloLocalInput.value = c.local || "";
    cicloAtivoCheckbox.checked = !!c.ativo;

    // 1ª Passagem
    p1Config.dias = c.periodo1?.dias || [];
    if (p1Config.dias.length > 0) {
        p1DataInicioEl.value = p1Config.dias[0].data;
        p1DataFimEl.value = p1Config.dias[p1Config.dias.length - 1].data;
    }
    renderizarIntervalosUI(p1IntervalosContainer, p1Config);
    renderizarDiasPreviewUI(p1DiasPreview, p1Config.dias);

    // 2ª Passagem
    p2Config.dias = c.periodo2?.dias || [];
    if (p2Config.dias.length > 0) {
        p2DataInicioEl.value = p2Config.dias[0].data;
        p2DataFimEl.value = p2Config.dias[p2Config.dias.length - 1].data;
    }
    renderizarIntervalosUI(p2IntervalosContainer, p2Config);
    renderizarDiasPreviewUI(p2DiasPreview, p2Config.dias);
}

btnSalvarCiclo.addEventListener("click", async () => {
    const nomeTrim = cicloNomeInput.value.trim();
    if (!nomeTrim) {
        mostrarToast("Por favor, preencha o Nome da Reavaliação/Passagem de Som.", "warning");
        if (cicloNomeInput) cicloNomeInput.focus();
        return;
    }

    if (!p1Config.dias || p1Config.dias.length === 0) {
        mostrarToast("Gere ao menos 1 dia para a 1ª Passagem de Som.", "warning");
        return;
    }
    if (!p2Config.dias || p2Config.dias.length === 0) {
        mostrarToast("Gere ao menos 1 dia para a 2ª Passagem de Som.", "warning");
        return;
    }

    let idCiclo = cicloSelecionado ? cicloSelecionado.id : null;
    if (!idCiclo) {
        const idBase = normalizarTexto(nomeTrim).replace(/[^a-z0-9]/g, "_");
        idCiclo = `${idBase}_${Date.now()}`;
    }

    const cicloData = {
        id: idCiclo,
        nome: nomeTrim,
        titulo: cicloTituloInput.value.trim() || `Passagem de Som - ${nomeTrim}`,
        avisoDeclaracao: cicloAvisoInput.value.trim(),
        local: cicloLocalInput.value.trim() || "sala de Ensaio OSM/OER",
        ativo: cicloAtivoCheckbox.checked,
        periodo1: {
            titulo: "1ª Passagem de Som",
            dias: p1Config.dias
        },
        periodo2: {
            titulo: "2ª Passagem de Som",
            dias: p2Config.dias
        }
    };

    try {
        btnSalvarCiclo.disabled = true;
        btnSalvarCiclo.innerHTML = `<span class="loader-spinner" style="width: 16px; height: 16px; margin: 0; border-width: 2px;"></span> Salvando...`;
        await PassagemSomService.salvarCiclo(idCiclo, cicloData);
        mostrarToast(`Passagem "${nomeTrim}" salva com sucesso!`, "success");
        selecionarCiclo(idCiclo);
        trocarAba("tab-gestao");
    } catch (e) {
        console.error("Erro ao salvar passagem de som:", e);
        mostrarToast(e.message || "Erro ao salvar passagem de som.", "error");
    } finally {
        btnSalvarCiclo.disabled = false;
        btnSalvarCiclo.innerHTML = `<i data-lucide="save" style="width: 18px; height: 18px;"></i> Salvar Configurações da Reavaliação`;
        if (window.lucide) lucide.createIcons();
    }
});

function irParaNovoCiclo() {
    cicloSelecionado = null;
    if (cicloNomeInput) cicloNomeInput.value = "";
    if (cicloTituloInput) cicloTituloInput.value = "";
    if (cicloLocalInput) cicloLocalInput.value = "sala de Ensaio OSM/OER";
    if (cicloAtivoCheckbox) cicloAtivoCheckbox.checked = true;
    if (cicloAvisoInput) cicloAvisoInput.value = "DECLARAÇÃO de ESTUDO deverá ser enviada para o Inspetor da OER até sua SEGUNDA PASSAGEM DE SOM - Caso precise do documento, solicite ao Inspetor da OER";
    
    // Reseta configurações de dias e horários
    p1Config.dias = [];
    p2Config.dias = [];
    if (p1DiasPreview) p1DiasPreview.innerHTML = "";
    if (p2DiasPreview) p2DiasPreview.innerHTML = "";

    // Configura datas iniciais padrão para a semana seguinte
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const emUmaSemana = new Date(hoje);
    emUmaSemana.setDate(hoje.getDate() + 7);

    const fmtData = (d) => d.toISOString().split("T")[0];
    if (p1DataInicioEl) p1DataInicioEl.value = fmtData(amanha);
    if (p1DataFimEl) p1DataFimEl.value = fmtData(emUmaSemana);
    if (p2DataInicioEl) p2DataInicioEl.value = fmtData(amanha);
    if (p2DataFimEl) p2DataFimEl.value = fmtData(emUmaSemana);

    renderizarIntervalosUI(p1IntervalosContainer, p1Config);
    renderizarIntervalosUI(p2IntervalosContainer, p2Config);

    trocarAba("tab-ciclos");
    if (cicloNomeInput) cicloNomeInput.focus();
}

if (btnNovoCiclo) {
    btnNovoCiclo.addEventListener("click", irParaNovoCiclo);
}

if (btnCriarNovaPassagemAba) {
    btnCriarNovaPassagemAba.addEventListener("click", irParaNovoCiclo);
}

// =========================================================================
// ABA GESTÃO DE PASSAGENS DE SOM (CARDS & LINKS DIRETOS)
// =========================================================================
function renderizarGestaoCiclos() {
    if (!gridGestaoCiclos) return;

    if (countCiclosBadge) {
        countCiclosBadge.textContent = `${todosCiclos.length} cadastrada(s)`;
    }

    if (todosCiclos.length === 0) {
        gridGestaoCiclos.innerHTML = `
            <div style="text-align: center; color: var(--oer-text-muted); padding: 3rem 1rem; width: 100%;">
                <i data-lucide="calendar-x-2" style="width: 44px; height: 44px; margin: 0 auto 1rem auto; display: block; color: #94a3b8;"></i>
                <p style="font-weight: 600; font-size: 1.05rem; color: #334155; margin-bottom: 0.5rem;">Nenhuma passagem de som encontrada</p>
                <p style="font-size: 0.88rem; margin-bottom: 1.25rem;">Crie uma nova passagem de som para disponibilizar aos músicos.</p>
                <button type="button" class="btn btn-primary btn-sm" id="btnEmptyCriarCiclo">
                    <i data-lucide="plus" style="width: 15px; height: 15px;"></i> Criar Primeira Passagem
                </button>
            </div>
        `;
        const btnEmpty = document.getElementById("btnEmptyCriarCiclo");
        if (btnEmpty) btnEmpty.addEventListener("click", irParaNovoCiclo);
        if (window.lucide) lucide.createIcons();
        return;
    }

    gridGestaoCiclos.innerHTML = "";

    todosCiclos.forEach((ciclo) => {
        const agendadosDesteCiclo = todosAgendamentos.filter((a) => a.cicloId === ciclo.id);
        const totalAgendados = agendadosDesteCiclo.length;

        // Datas de P1 e P2 para resumo
        const diasP1 = ciclo.periodo1?.dias || [];
        const diasP2 = ciclo.periodo2?.dias || [];
        
        let p1Resumo = "Não configurado";
        if (diasP1.length > 0) {
            const primeiraData = formatarDataBR(diasP1[0].data);
            const ultimaData = formatarDataBR(diasP1[diasP1.length - 1].data);
            p1Resumo = diasP1.length === 1 ? primeiraData : `${primeiraData} a ${ultimaData} (${diasP1.length} dias)`;
        }

        let p2Resumo = "Não configurado";
        if (diasP2.length > 0) {
            const primeiraData = formatarDataBR(diasP2[0].data);
            const ultimaData = formatarDataBR(diasP2[diasP2.length - 1].data);
            p2Resumo = diasP2.length === 1 ? primeiraData : `${primeiraData} a ${ultimaData} (${diasP2.length} dias)`;
        }

        const isAtivo = !!ciclo.ativo;
        const urlPublica = `${window.location.origin}${window.location.pathname.replace("passagem-som-admin.html", "passagem-som.html")}?id=${encodeURIComponent(ciclo.id)}`;

        const card = document.createElement("div");
        card.className = `ciclo-gestao-card ${isAtivo ? "is-ativo" : "is-inativo"}`;

        card.innerHTML = `
            <div>
                <div class="ciclo-card-top">
                    <div>
                        <h3 class="ciclo-card-title">${ciclo.nome || "Passagem de Som"}</h3>
                        <p style="font-size: 0.82rem; color: var(--oer-text-muted); margin-top: 2px;">
                            ${ciclo.titulo || "Página de agendamento"}
                        </p>
                    </div>
                    <span class="badge-status-ciclo ${isAtivo ? "ativa" : "inativa"}">
                        ${isAtivo ? '<i data-lucide="check-circle-2" style="width: 13px; height: 13px;"></i> Ativa' : '<i data-lucide="pause-circle" style="width: 13px; height: 13px;"></i> Inativa'}
                    </span>
                </div>

                <div class="ciclo-card-info-list">
                    <div class="ciclo-info-item" title="Período da 1ª passagem">
                        <i data-lucide="clock"></i>
                        <span><strong>1ª Passagem:</strong> ${p1Resumo}</span>
                    </div>
                    <div class="ciclo-info-item" title="Período da 2ª passagem">
                        <i data-lucide="clock-4"></i>
                        <span><strong>2ª Passagem:</strong> ${p2Resumo}</span>
                    </div>
                    <div class="ciclo-info-item" title="Total de músicos com horário agendado">
                        <i data-lucide="users"></i>
                        <span><strong>Agendamentos:</strong> ${totalAgendados} músico(s)</span>
                    </div>
                    ${ciclo.local ? `
                    <div class="ciclo-info-item" title="Local da passagem">
                        <i data-lucide="map-pin"></i>
                        <span><strong>Local:</strong> ${ciclo.local}</span>
                    </div>
                    ` : ""}
                </div>

                <div class="ciclo-link-action-box" title="Link específico desta passagem de som">
                    <span class="ciclo-link-display">${urlPublica}</span>
                    <button type="button" class="btn btn-primary btn-sm btn-copiar-link-card" data-url="${urlPublica}" data-nome="${ciclo.nome}" style="white-space: nowrap; padding: 0.35rem 0.65rem; font-size: 0.78rem;">
                        <i data-lucide="copy" style="width: 13px; height: 13px;"></i> Copiar Link
                    </button>
                </div>
            </div>

            <div class="ciclo-card-actions">
                <button type="button" class="btn btn-outline btn-sm btn-ver-tabela" data-id="${ciclo.id}" title="Ver tabela de inscritos desta passagem">
                    <i data-lucide="table" style="width: 14px; height: 14px;"></i> Ver Agendamentos
                </button>
                <button type="button" class="btn btn-outline btn-sm btn-editar-ciclo" data-id="${ciclo.id}" title="Editar datas, horários e status">
                    <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i> Editar
                </button>
                <button type="button" class="btn btn-outline btn-sm btn-excluir-ciclo" data-id="${ciclo.id}" data-nome="${ciclo.nome}" style="color: var(--oer-danger); border-color: #fecdd3; margin-left: auto;" title="Excluir passagem de som">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;

        // Event Listeners dos botões do card
        const btnCopiar = card.querySelector(".btn-copiar-link-card");
        btnCopiar.addEventListener("click", () => {
            const urlToCopy = btnCopiar.getAttribute("data-url");
            const nomeCiclo = btnCopiar.getAttribute("data-nome");
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(urlToCopy).then(() => {
                    mostrarToast(`Link de "${nomeCiclo}" copiado com sucesso!`, "success");
                }).catch(() => {
                    prompt("Copie o link:", urlToCopy);
                });
            } else {
                prompt("Copie o link:", urlToCopy);
            }
        });

        const btnVerTabela = card.querySelector(".btn-ver-tabela");
        btnVerTabela.addEventListener("click", () => {
            const cid = btnVerTabela.getAttribute("data-id");
            selecionarCiclo(cid);
            trocarAba("tab-tabela");
        });

        const btnEditar = card.querySelector(".btn-editar-ciclo");
        btnEditar.addEventListener("click", () => {
            const cid = btnEditar.getAttribute("data-id");
            selecionarCiclo(cid);
            trocarAba("tab-ciclos");
        });

        const btnExcluir = card.querySelector(".btn-excluir-ciclo");
        btnExcluir.addEventListener("click", async () => {
            const cid = btnExcluir.getAttribute("data-id");
            const cnome = btnExcluir.getAttribute("data-nome");
            const confirmou = window.confirm(`Atenção: Tem certeza de que deseja excluir a passagem de som "${cnome}"?\n\nEsta operação removerá as configurações desta passagem.`);
            if (confirmou) {
                try {
                    await PassagemSomService.excluirCiclo(cid);
                    mostrarToast(`Passagem "${cnome}" excluída com sucesso.`, "info");
                    if (cicloSelecionado && cicloSelecionado.id === cid) {
                        cicloSelecionado = null;
                    }
                } catch (e) {
                    console.error("Erro ao excluir ciclo:", e);
                    mostrarToast("Erro ao excluir passagem de som.", "error");
                }
            }
        });

        gridGestaoCiclos.appendChild(card);
    });

    if (window.lucide) {
        lucide.createIcons();
    }
}

// Troca de Abas
function trocarAba(targetTab) {
    document.querySelectorAll(".ps-tab-btn").forEach((b) => {
        if (b.getAttribute("data-tab") === targetTab) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });

    document.querySelectorAll(".tab-pane").forEach((p) => {
        p.style.display = p.id === targetTab ? "block" : "none";
    });
}

// =========================================================================
// MODAL DE EDIÇÃO DE AGENDAMENTO
// =========================================================================
function abrirModalEditar(ag) {
    agendamentoSendoEditado = ag;
    document.getElementById("editNome").value = ag.nomeDigitado;
    document.getElementById("editInstrumento").value = ag.instrumento;
    document.getElementById("editRepertorio").value = ag.repertorio;
    document.getElementById("editP1Data").value = ag.primeiraPassagem?.data || "";
    document.getElementById("editP1Hora").value = ag.primeiraPassagem?.horario || "";
    document.getElementById("editP2Data").value = ag.segundaPassagem?.data || "";
    document.getElementById("editP2Hora").value = ag.segundaPassagem?.horario || "";

    modalEditarAgendamento.classList.add("show");
}

document.getElementById("btnFecharModalEdit").addEventListener("click", () => {
    modalEditarAgendamento.classList.remove("show");
});

formEditarAgendamento.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!agendamentoSendoEditado) return;

    const p1Data = document.getElementById("editP1Data").value;
    const p1Hora = document.getElementById("editP1Hora").value;
    const p2Data = document.getElementById("editP2Data").value;
    const p2Hora = document.getElementById("editP2Hora").value;

    const updates = {
        nomeDigitado: document.getElementById("editNome").value.trim(),
        instrumento: document.getElementById("editInstrumento").value.trim(),
        repertorio: document.getElementById("editRepertorio").value.trim(),
        primeiraPassagem: {
            data: p1Data,
            horario: p1Hora,
            slotKey: `p1_${p1Data}_${p1Hora}`,
            status: "agendado"
        },
        segundaPassagem: {
            data: p2Data,
            horario: p2Hora,
            slotKey: `p2_${p2Data}_${p2Hora}`,
            status: "agendado"
        }
    };

    try {
        await PassagemSomService.atualizarAgendamento(agendamentoSendoEditado.id, updates);
        modalEditarAgendamento.classList.remove("show");
        mostrarToast("Agendamento atualizado com sucesso!", "success");
    } catch (e) {
        mostrarToast("Erro ao atualizar agendamento.", "error");
    }
});

// Navegação entre Abas
document.querySelectorAll(".ps-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        trocarAba(targetTab);
    });
});
