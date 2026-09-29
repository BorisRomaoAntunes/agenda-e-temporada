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
let cicloSelecionado = null;
let agendamentosDoCiclo = [];
let musicosAtivos = [];
let filtroTipo = "todas"; // 'todas', '1', '2'
let filtroTexto = "";
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

// Validação Card
const validationCardEl = document.getElementById("validationCard");
const validationCountBadgeEl = document.getElementById("validationCountBadge");
const validationListEl = document.getElementById("validationList");

// Tabela
const tbodyAgendamentos = document.getElementById("tbodyAgendamentos");
const inputBusca = document.getElementById("inputBusca");
const selectFiltroTipo = document.getElementById("selectFiltroTipo");
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

        // Carrega ciclos / reavaliações
        PassagemSomService.listenTodosCiclos((ciclos) => {
            todosCiclos = ciclos;
            atualizarSelectCiclos();

            if (!cicloSelecionado && ciclos.length > 0) {
                const ativo = ciclos.find((c) => c.ativo) || ciclos[0];
                selecionarCiclo(ativo.id);
            }
            if (loaderEl) loaderEl.classList.add("hidden");
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
        renderizarTabela();
        atualizarPreviewWhatsApp();
    });
}

// Copiar Link Público
btnHeaderCopyLink.addEventListener("click", () => {
    const url = window.location.href.replace("passagem-som-admin.html", "passagem-som.html");
    navigator.clipboard.writeText(url).then(() => {
        mostrarToast("Link público copiado com sucesso!", "success");
    }).catch(() => {
        prompt("Copie o link:", url);
    });
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
// RENDERIZAÇÃO DA TABELA OFICIAL (MODELO DO PDF)
// =========================================================================
function normalizarLinhasTabela() {
    const linhas = [];

    agendamentosDoCiclo.forEach((ag) => {
        if (ag.primeiraPassagem) {
            linhas.push({
                agendamentoId: ag.id,
                tipo: "1ª Passagem de Som",
                tipoNum: "1",
                data: ag.primeiraPassagem.data,
                horario: ag.primeiraPassagem.horario,
                dataHoraISO: `${ag.primeiraPassagem.data}T${ag.primeiraPassagem.horario}`,
                nome: ag.nomeDigitado,
                nomeOficial: ag.musicoNomeOficial,
                instrumento: ag.instrumento,
                repertorio: ag.repertorio,
                statusVinculo: ag.statusVinculo,
                musicoId: ag.musicoId,
                raw: ag
            });
        }
        if (ag.segundaPassagem) {
            linhas.push({
                agendamentoId: ag.id,
                tipo: "2ª Passagem de Som",
                tipoNum: "2",
                data: ag.segundaPassagem.data,
                horario: ag.segundaPassagem.horario,
                dataHoraISO: `${ag.segundaPassagem.data}T${ag.segundaPassagem.horario}`,
                nome: ag.nomeDigitado,
                nomeOficial: ag.musicoNomeOficial,
                instrumento: ag.instrumento,
                repertorio: ag.repertorio,
                statusVinculo: ag.statusVinculo,
                musicoId: ag.musicoId,
                raw: ag
            });
        }
    });

    linhas.sort((a, b) => a.dataHoraISO.localeCompare(b.dataHoraISO));
    return linhas;
}

function renderizarTabela() {
    let linhas = normalizarLinhasTabela();

    if (filtroTipo === "1") {
        linhas = linhas.filter((l) => l.tipoNum === "1");
    } else if (filtroTipo === "2") {
        linhas = linhas.filter((l) => l.tipoNum === "2");
    }

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

    countAgendamentosBadge.textContent = `${linhas.length} horários`;
    tbodyAgendamentos.innerHTML = "";

    if (linhas.length === 0) {
        tbodyAgendamentos.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--oer-text-muted); padding: 2rem;">
                    Nenhum agendamento encontrado com os filtros aplicados.
                </td>
            </tr>
        `;
        return;
    }

    linhas.forEach((linha) => {
        const tr = document.createElement("tr");

        const dataFormatada = `${formatarDataBR(linha.data)} ${linha.horario}`;
        const isP2 = linha.tipoNum === "2";
        const tipoBadge = `<span style="font-style: ${isP2 ? 'italic' : 'normal'}; font-weight: ${isP2 ? '500' : '600'}; color: ${isP2 ? '#475569' : 'var(--oer-text-main)'};">${linha.tipo}</span>`;

        const vinculoBadge = linha.statusVinculo === "vinculado" 
            ? `<span class="badge badge-vinculado" title="Vinculado a: ${linha.nomeOficial || linha.nome}"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Vinculado</span>`
            : `<span class="badge badge-pendente" title="Clique no card acima para validar"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Pendente</span>`;

        tr.innerHTML = `
            <td style="font-weight: 700; white-space: nowrap;">${dataFormatada}</td>
            <td style="white-space: nowrap;">${tipoBadge}</td>
            <td style="font-weight: 600;">${linha.nome}</td>
            <td>${linha.instrumento}</td>
            <td>${linha.repertorio}</td>
            <td class="no-print" style="white-space: nowrap;">${vinculoBadge}</td>
            <td class="no-print" style="text-align: right; white-space: nowrap;">
                <button type="button" class="btn btn-outline btn-sm btn-editar-ag" title="Editar Agendamento">
                    <i data-lucide="pencil" style="width: 13px; height: 13px;"></i>
                </button>
                <button type="button" class="btn btn-danger btn-sm btn-excluir-ag" title="Excluir Agendamento">
                    <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                </button>
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

    if (window.lucide) lucide.createIcons();
}

// Filtros da Tabela
inputBusca.addEventListener("input", (e) => {
    filtroTexto = e.target.value.trim();
    renderizarTabela();
});

selectFiltroTipo.addEventListener("change", (e) => {
    filtroTipo = e.target.value;
    renderizarTabela();
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

    const cabecalho = ["Datas e Horários", "Passagem", "Nome", "Instrumento", "OBRA", "Status Vínculo"];
    const linhasCSV = [cabecalho.join(";")];

    linhas.forEach((l) => {
        const item = [
            `"${formatarDataBR(l.data)} ${l.horario}"`,
            `"${l.tipo}"`,
            `"${l.nome.replace(/"/g, '""')}"`,
            `"${l.instrumento.replace(/"/g, '""')}"`,
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
    const nomeArquivo = `passagem_de_som_${cicloSelecionado?.id || 'relatorio'}.csv`;
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
    cicloAvisoInput.value = c.avisoDeclaracao || "";
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
    if (!cicloSelecionado) return;

    if (!p1Config.dias || p1Config.dias.length === 0) {
        mostrarToast("Gere ao menos 1 dia para a 1ª Passagem de Som.", "warning");
        return;
    }
    if (!p2Config.dias || p2Config.dias.length === 0) {
        mostrarToast("Gere ao menos 1 dia para a 2ª Passagem de Som.", "warning");
        return;
    }

    const updates = {
        nome: cicloNomeInput.value.trim() || cicloSelecionado.nome,
        titulo: cicloTituloInput.value.trim() || `Passagem de Som - ${cicloNomeInput.value.trim()}`,
        avisoDeclaracao: cicloAvisoInput.value.trim(),
        local: cicloLocalInput.value.trim(),
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
        await PassagemSomService.salvarCiclo(cicloSelecionado.id, updates);
        mostrarToast("Configurações da Reavaliação salvas com sucesso!", "success");
    } catch (e) {
        console.error("Erro ao salvar reavaliação:", e);
        mostrarToast(e.message || "Erro ao salvar reavaliação.", "error");
    } finally {
        btnSalvarCiclo.disabled = false;
        btnSalvarCiclo.innerHTML = `<i data-lucide="save" style="width: 18px; height: 18px;"></i> Salvar Configurações da Reavaliação`;
        if (window.lucide) lucide.createIcons();
    }
});

btnNovoCiclo.addEventListener("click", async () => {
    const nomeNovo = prompt("Digite o nome da Nova Reavaliação (ex: Reavaliação 04 - 2026):");
    if (!nomeNovo || !nomeNovo.trim()) return;

    const idNovo = normalizarTexto(nomeNovo.trim()).replace(/\s+/g, "_");

    const novaReavaliacao = {
        id: idNovo,
        nome: nomeNovo.trim(),
        titulo: `Passagem de Som - ${nomeNovo.trim()}`,
        ativo: true,
        local: "sala de Ensaio OSM/OER",
        avisoDeclaracao: "DECLARAÇÃO de ESTUDO deverá ser enviada para o Inspetor da OER até sua SEGUNDA PASSAGEM DE SOM - Caso precise do documento, solicite ao Inspetor da OER",
        periodo1: {
            titulo: "1ª Passagem de Som",
            dias: []
        },
        periodo2: {
            titulo: "2ª Passagem de Som",
            dias: []
        }
    };

    try {
        await PassagemSomService.salvarCiclo(idNovo, novaReavaliacao);
        mostrarToast(`"${nomeNovo}" criada com sucesso!`, "success");
        selecionarCiclo(idNovo);
    } catch (e) {
        console.error("Erro ao criar reavaliação:", e);
        mostrarToast(e.message || "Erro ao criar nova reavaliação.", "error");
    }
});

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
        document.querySelectorAll(".ps-tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const targetTab = btn.getAttribute("data-tab");
        document.querySelectorAll(".tab-pane").forEach((p) => p.style.display = "none");
        const pane = document.getElementById(targetTab);
        if (pane) pane.style.display = "block";
    });
});
