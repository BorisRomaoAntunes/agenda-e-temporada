/**
 * passagem-som-admin.js
 * Painel Administrativo de Passagem de Som (OER)
 * Relatórios em Tabela, WhatsApp diário, Exportação Excel/CSV,
 * Validação de Músicos e Gestão de Ciclos
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

// Ciclos
const formEditarCiclo = document.getElementById("formEditarCiclo");
const cicloNomeInput = document.getElementById("cicloNomeInput");
const cicloTituloInput = document.getElementById("cicloTituloInput");
const cicloAvisoInput = document.getElementById("cicloAvisoInput");
const cicloLocalInput = document.getElementById("cicloLocalInput");
const cicloAtivoCheckbox = document.getElementById("cicloAtivoCheckbox");
const p1DiasJsonEl = document.getElementById("p1DiasJson");
const p2DiasJsonEl = document.getElementById("p2DiasJson");
const btnSalvarCiclo = document.getElementById("btnSalvarCiclo");
const btnNovoCiclo = document.getElementById("btnNovoCiclo");

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

        // Carrega ciclos
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
        opt.textContent = `${c.nome} ${c.ativo ? "(Ativo)" : ""}`;
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

    preencherFormConfigCiclo(cicloSelecionado);

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

        // Sugestão inicial por correspondência média ou vazia
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
    // Desmembra cada agendamento em duas linhas cronológicas (1ª e 2ª passagem)
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

    // Ordenação padrão: data e horário cronológico
    linhas.sort((a, b) => a.dataHoraISO.localeCompare(b.dataHoraISO));
    return linhas;
}

function renderizarTabela() {
    let linhas = normalizarLinhasTabela();

    // Filtro por tipo (1ª ou 2ª)
    if (filtroTipo === "1") {
        linhas = linhas.filter((l) => l.tipoNum === "1");
    } else if (filtroTipo === "2") {
        linhas = linhas.filter((l) => l.tipoNum === "2");
    }

    // Filtro por busca de texto
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

    // Cria cabeçalho CSV compatível com Excel (separador ponto e vírgula no padrão BR)
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

    const csvContent = "\uFEFF" + linhasCSV.join("\r\n"); // UTF-8 BOM para abrir com acentuação perfeita no Excel
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

// Impressão da Tabela (Fiel ao modelo da folha PDF enviada)
btnImprimirTabela.addEventListener("click", () => {
    window.print();
});

// =========================================================================
// RELATÓRIO DIÁRIO PARA WHATSAPP
// =========================================================================
function atualizarPreviewWhatsApp() {
    if (!cicloSelecionado) return;

    // Se nenhuma data foi escolhida no seletor de WhatsApp, escolhe a próxima data que tem agendamentos
    const todasDatasComAgendamento = new Set();
    agendamentosDoCiclo.forEach((ag) => {
        if (ag.primeiraPassagem) todasDatasComAgendamento.add(ag.primeiraPassagem.data);
        if (ag.segundaPassagem) todasDatasComAgendamento.add(ag.segundaPassagem.data);
    });

    const datasOrdenadas = Array.from(todasDatasComAgendamento).sort();

    if (!dataSelecionadaWhatsApp) {
        // Tenta selecionar amanhã ou a primeira data disponível
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

    // Filtra agendamentos para a data selecionada (seja 1ª ou 2ª passagem)
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

    // Ordena por horário
    doDia.sort((a, b) => a.horario.localeCompare(b.horario));

    const diaSem = obterDiaSemanaCurto(dataSelecionadaWhatsApp);
    const dataFormatadaDia = formatarDataBR(dataSelecionadaWhatsApp).substring(0, 5); // ex: 18/09
    const local = cicloSelecionado.local || "sala de Ensaio OSM/OER";
    const avisoDeclaracao = cicloSelecionado.avisoDeclaracao || "preciso da DECLARAÇÃO de ESTUDO enviada para mim até sua SEGUNDA PASSAGEM DE SOM";

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
// CONFIGURAÇÃO DE CICLOS & HORÁRIOS
// =========================================================================
function preencherFormConfigCiclo(c) {
    cicloNomeInput.value = c.nome || "";
    cicloTituloInput.value = c.titulo || "";
    cicloAvisoInput.value = c.avisoDeclaracao || "";
    cicloLocalInput.value = c.local || "";
    cicloAtivoCheckbox.checked = !!c.ativo;

    p1DiasJsonEl.value = JSON.stringify(c.periodo1?.dias || [], null, 2);
    p2DiasJsonEl.value = JSON.stringify(c.periodo2?.dias || [], null, 2);
}

btnSalvarCiclo.addEventListener("click", async () => {
    if (!cicloSelecionado) return;

    let p1Dias = [];
    let p2Dias = [];

    try {
        p1Dias = JSON.parse(p1DiasJsonEl.value);
        p2Dias = JSON.parse(p2DiasJsonEl.value);
    } catch (e) {
        mostrarToast("Erro no formato JSON dos dias e horários. Verifique a sintaxe.", "error");
        return;
    }

    const updates = {
        nome: cicloNomeInput.value.trim(),
        titulo: cicloTituloInput.value.trim(),
        avisoDeclaracao: cicloAvisoInput.value.trim(),
        local: cicloLocalInput.value.trim(),
        ativo: cicloAtivoCheckbox.checked,
        periodo1: {
            titulo: "1ª Passagem de Som",
            dias: p1Dias
        },
        periodo2: {
            titulo: "2ª Passagem de Som",
            dias: p2Dias
        }
    };

    try {
        btnSalvarCiclo.disabled = true;
        await PassagemSomService.salvarCiclo(cicloSelecionado.id, updates);
        mostrarToast("Configurações do ciclo salvas com sucesso!", "success");
    } catch (e) {
        console.error("Erro ao salvar ciclo:", e);
        mostrarToast("Erro ao salvar ciclo.", "error");
    } finally {
        btnSalvarCiclo.disabled = false;
    }
});

btnNovoCiclo.addEventListener("click", async () => {
    const nomeNovo = prompt("Digite o nome da nova Edição/Reavaliação (ex: Reavaliação 04 - 2026):");
    if (!nomeNovo) return;

    const idNovo = normalizarTexto(nomeNovo).replace(/\s+/g, "_");

    const novoCiclo = {
        id: idNovo,
        nome: nomeNovo,
        titulo: `Passagem de Som - ${nomeNovo}`,
        ativo: true,
        local: "sala de Ensaio OSM/OER",
        avisoDeclaracao: "preciso da DECLARAÇÃO de ESTUDO enviada para mim até sua SEGUNDA PASSAGEM DE SOM",
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
        await PassagemSomService.salvarCiclo(idNovo, novoCiclo);
        mostrarToast(`Ciclo "${nomeNovo}" criado com sucesso!`, "success");
    } catch (e) {
        mostrarToast("Erro ao criar novo ciclo.", "error");
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
