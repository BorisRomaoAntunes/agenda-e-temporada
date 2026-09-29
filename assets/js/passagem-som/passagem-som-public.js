/**
 * passagem-som-public.js
 * Lógica da Página Pública de Agendamento de Passagem de Som (OER)
 * Sincronização em tempo real de slots disponíveis e validação de preenchimento
 */

import {
    PassagemSomService,
    formatarDataBR,
    obterDiaSemanaCurto
} from "./passagem-som-service.js";

// Estado local da tela
let cicloAtivo = null;
let agendamentosAtuais = [];
let musicosAtivos = [];

let selecaoP1 = { data: null, horario: null };
let selecaoP2 = { data: null, horario: null };

// Elementos da interface
const cicloTituloEl = document.getElementById("cicloTitulo");
const cicloDescricaoEl = document.getElementById("cicloDescricao");
const loaderEl = document.getElementById("loader");
const formEl = document.getElementById("formAgendamento");
const toastEl = document.getElementById("toastMsg");

// Resumo
const resumoP1DataEl = document.getElementById("resumoP1Data");
const resumoP1HoraEl = document.getElementById("resumoP1Hora");
const resumoP2DataEl = document.getElementById("resumoP2Data");
const resumoP2HoraEl = document.getElementById("resumoP2Hora");
const btnConfirmar = document.getElementById("btnConfirmarAgendamento");

// Elementos de Sucesso
const modalSucesso = document.getElementById("modalSucesso");
const sucessoConteudoEl = document.getElementById("sucessoConteudo");

function mostrarToast(mensagem, tipo = "info") {
    if (!toastEl) return;
    toastEl.textContent = mensagem;
    toastEl.className = `toast-msg ${tipo} show`;
    setTimeout(() => {
        toastEl.classList.remove("show");
    }, 4000);
}

// Inicialização
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Inicializa ciclo padrão se banco estiver vazio
        await PassagemSomService.inicializarCicloPadraoSeNecessario();

        // Carrega lista de músicos ativos para o cruzamento automático
        musicosAtivos = await PassagemSomService.getMusicosAtivos();

        // Escuta ciclo ativo
        PassagemSomService.listenCicloAtivo((ciclo) => {
            cicloAtivo = ciclo;
            if (loaderEl) loaderEl.classList.add("hidden");

            if (!ciclo) {
                document.getElementById("conteudoSemCiclo").style.display = "block";
                document.getElementById("conteudoForm").style.display = "none";
                return;
            }

            document.getElementById("conteudoSemCiclo").style.display = "none";
            document.getElementById("conteudoForm").style.display = "block";

            cicloTituloEl.textContent = ciclo.titulo || ciclo.nome || "Passagem de Som OER";
            if (ciclo.avisoDeclaracao) {
                cicloDescricaoEl.textContent = `Aviso importante: ${ciclo.avisoDeclaracao}`;
            }

            // Escuta agendamentos em tempo real do ciclo ativo
            PassagemSomService.listenAgendamentos(ciclo.id, (agendamentos) => {
                agendamentosAtuais = agendamentos;
                renderizarPeriodo1();
                renderizarPeriodo2();
                atualizarResumo();
            });
        });

    } catch (e) {
        console.error("Erro na inicialização pública:", e);
        if (loaderEl) loaderEl.classList.add("hidden");
        mostrarToast("Erro ao carregar configurações de passagem de som.", "error");
    }
});

// =========================================================================
// RENDERIZAÇÃO DA 1ª PASSAGEM DE SOM
// =========================================================================
function renderizarPeriodo1() {
    if (!cicloAtivo || !cicloAtivo.periodo1 || !cicloAtivo.periodo1.dias) return;

    const diasContainer = document.getElementById("p1DiasContainer");
    const slotsContainer = document.getElementById("p1SlotsContainer");
    const dias = cicloAtivo.periodo1.dias;

    // Se nenhuma data estiver selecionada ainda, seleciona a primeira
    if (!selecaoP1.data && dias.length > 0) {
        selecaoP1.data = dias[0].data;
    }

    // Renderiza botões das datas (pílulas)
    diasContainer.innerHTML = "";
    dias.forEach((d) => {
        const isSelected = selecaoP1.data === d.data;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `date-pill-btn ${isSelected ? "selected" : ""}`;
        btn.innerHTML = `
            <div class="date-pill-day">${d.diaSemana || obterDiaSemanaCurto(d.data)}</div>
            <div class="date-pill-date">${formatarDataBR(d.data).substring(0, 5)}</div>
        `;
        btn.addEventListener("click", () => {
            selecaoP1.data = d.data;
            selecaoP1.horario = null; // reseta horário ao trocar dia
            renderizarPeriodo1();
            atualizarResumo();
        });
        diasContainer.appendChild(btn);
    });

    // Renderiza horários do dia selecionado
    const diaAtual = dias.find((d) => d.data === selecaoP1.data);
    slotsContainer.innerHTML = "";

    if (!diaAtual || !diaAtual.horarios || diaAtual.horarios.length === 0) {
        slotsContainer.innerHTML = `<p style="grid-column: 1/-1; color: var(--oer-text-muted); font-size: 0.85rem;">Nenhum horário disponível para este dia.</p>`;
        return;
    }

    // Horários já reservados na 1ª passagem para este dia
    const ocupadosMap = new Set();
    agendamentosAtuais.forEach((ag) => {
        if (ag.primeiraPassagem && ag.primeiraPassagem.data === selecaoP1.data) {
            ocupadosMap.add(ag.primeiraPassagem.horario);
        }
    });

    diaAtual.horarios.forEach((hora) => {
        const isOcupado = ocupadosMap.has(hora);
        const isSelected = selecaoP1.horario === hora;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `slot-btn ${isSelected ? "selected" : ""} ${isOcupado ? "occupied" : ""}`;
        btn.disabled = isOcupado;
        btn.innerHTML = `
            <span>${hora}</span>
            <small style="font-size: 0.7rem; font-weight: normal;">${isOcupado ? "Ocupado" : (isSelected ? "Selecionado" : "Disponível")}</small>
        `;

        if (!isOcupado) {
            btn.addEventListener("click", () => {
                selecaoP1.horario = hora;
                renderizarPeriodo1();
                atualizarResumo();
            });
        }

        slotsContainer.appendChild(btn);
    });
}

// =========================================================================
// RENDERIZAÇÃO DA 2ª PASSAGEM DE SOM
// =========================================================================
function renderizarPeriodo2() {
    if (!cicloAtivo || !cicloAtivo.periodo2 || !cicloAtivo.periodo2.dias) return;

    const diasContainer = document.getElementById("p2DiasContainer");
    const slotsContainer = document.getElementById("p2SlotsContainer");
    const dias = cicloAtivo.periodo2.dias;

    if (!selecaoP2.data && dias.length > 0) {
        selecaoP2.data = dias[0].data;
    }

    // Pílulas das datas
    diasContainer.innerHTML = "";
    dias.forEach((d) => {
        const isSelected = selecaoP2.data === d.data;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `date-pill-btn ${isSelected ? "selected" : ""}`;
        btn.innerHTML = `
            <div class="date-pill-day">${d.diaSemana || obterDiaSemanaCurto(d.data)}</div>
            <div class="date-pill-date">${formatarDataBR(d.data).substring(0, 5)}</div>
        `;
        btn.addEventListener("click", () => {
            selecaoP2.data = d.data;
            selecaoP2.horario = null;
            renderizarPeriodo2();
            atualizarResumo();
        });
        diasContainer.appendChild(btn);
    });

    // Horários do dia selecionado
    const diaAtual = dias.find((d) => d.data === selecaoP2.data);
    slotsContainer.innerHTML = "";

    if (!diaAtual || !diaAtual.horarios || diaAtual.horarios.length === 0) {
        slotsContainer.innerHTML = `<p style="grid-column: 1/-1; color: var(--oer-text-muted); font-size: 0.85rem;">Nenhum horário disponível para este dia.</p>`;
        return;
    }

    const ocupadosMap = new Set();
    agendamentosAtuais.forEach((ag) => {
        if (ag.segundaPassagem && ag.segundaPassagem.data === selecaoP2.data) {
            ocupadosMap.add(ag.segundaPassagem.horario);
        }
    });

    diaAtual.horarios.forEach((hora) => {
        const isOcupado = ocupadosMap.has(hora);
        const isSelected = selecaoP2.horario === hora;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `slot-btn ${isSelected ? "selected" : ""} ${isOcupado ? "occupied" : ""}`;
        btn.disabled = isOcupado;
        btn.innerHTML = `
            <span>${hora}</span>
            <small style="font-size: 0.7rem; font-weight: normal;">${isOcupado ? "Ocupado" : (isSelected ? "Selecionado" : "Disponível")}</small>
        `;

        if (!isOcupado) {
            btn.addEventListener("click", () => {
                selecaoP2.horario = hora;
                renderizarPeriodo2();
                atualizarResumo();
            });
        }

        slotsContainer.appendChild(btn);
    });
}

// =========================================================================
// ATUALIZAÇÃO DO RESUMO E VALIDAÇÃO DO BOTÃO
// =========================================================================
function atualizarResumo() {
    if (selecaoP1.data && selecaoP1.horario) {
        resumoP1DataEl.textContent = formatarDataBR(selecaoP1.data);
        resumoP1HoraEl.textContent = selecaoP1.horario;
    } else {
        resumoP1DataEl.textContent = selecaoP1.data ? formatarDataBR(selecaoP1.data) : "-";
        resumoP1HoraEl.textContent = "Selecione o horário";
    }

    if (selecaoP2.data && selecaoP2.horario) {
        resumoP2DataEl.textContent = formatarDataBR(selecaoP2.data);
        resumoP2HoraEl.textContent = selecaoP2.horario;
    } else {
        resumoP2DataEl.textContent = selecaoP2.data ? formatarDataBR(selecaoP2.data) : "-";
        resumoP2HoraEl.textContent = "Selecione o horário";
    }

    const pronto = selecaoP1.horario && selecaoP2.horario;
    btnConfirmar.disabled = !pronto;
}

// =========================================================================
// ENVIO DO FORMULÁRIO
// =========================================================================
formEl.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("musicoNome").value.trim();
    const instrumento = document.getElementById("musicoInstrumento").value.trim();
    const repertorio = document.getElementById("musicoRepertorio").value.trim();

    if (!nome || !instrumento || !repertorio) {
        mostrarToast("Por favor, preencha todos os campos obrigatórios.", "error");
        return;
    }

    if (!selecaoP1.horario) {
        mostrarToast("Por favor, selecione um horário para a 1ª Passagem de Som.", "error");
        return;
    }

    if (!selecaoP2.horario) {
        mostrarToast("Por favor, selecione um horário para a 2ª Passagem de Som.", "error");
        return;
    }

    try {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = `<span class="loader-spinner" style="width: 18px; height: 18px; margin: 0; border-width: 2px;"></span> Agendando...`;

        const resultado = await PassagemSomService.agendarPassagem({
            cicloId: cicloAtivo.id,
            nome,
            instrumento,
            repertorio,
            p1: selecaoP1,
            p2: selecaoP2,
            musicosAtivos
        });

        // Sucesso: exibe modal
        sucessoConteudoEl.innerHTML = `
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--oer-success-bg); color: var(--oer-success); display: inline-flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 0.75rem;">
                    ✓
                </div>
                <h3 style="color: var(--oer-text-main); font-size: 1.3rem; margin-bottom: 0.25rem;">Agendamento Confirmado!</h3>
                <p style="color: var(--oer-text-muted); font-size: 0.9rem;">Olá, <strong>${resultado.nomeDigitado}</strong>. Suas passagens de som foram registradas com sucesso.</p>
            </div>

            <div style="background: #f8fafc; border: 1px solid var(--oer-border); border-radius: 10px; padding: 1.25rem; margin-bottom: 1.5rem;">
                <div style="margin-bottom: 0.75rem;">
                    <span style="font-size: 0.78rem; color: var(--oer-text-muted); font-weight: 600; text-transform: uppercase;">Instrumento & Obra</span>
                    <p style="font-weight: 600; color: var(--oer-text-main); font-size: 0.95rem;">${resultado.instrumento} — ${resultado.repertorio}</p>
                </div>
                <hr style="border: none; border-top: 1px solid var(--oer-border); margin: 0.75rem 0;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <span style="font-size: 0.78rem; color: var(--oer-primary); font-weight: 700; text-transform: uppercase;">1ª Passagem</span>
                        <p style="font-weight: 700; color: var(--oer-text-main); font-size: 1.05rem;">${formatarDataBR(resultado.primeiraPassagem.data)}</p>
                        <p style="color: var(--oer-text-muted); font-size: 0.9rem;">às ${resultado.primeiraPassagem.horario}</p>
                    </div>
                    <div>
                        <span style="font-size: 0.78rem; color: var(--oer-primary); font-weight: 700; text-transform: uppercase;">2ª Passagem</span>
                        <p style="font-weight: 700; color: var(--oer-text-main); font-size: 1.05rem;">${formatarDataBR(resultado.segundaPassagem.data)}</p>
                        <p style="color: var(--oer-text-muted); font-size: 0.9rem;">às ${resultado.segundaPassagem.horario}</p>
                    </div>
                </div>
            </div>

            <div style="background: var(--oer-accent-light); border-left: 4px solid var(--oer-primary); padding: 0.9rem 1rem; border-radius: 6px; font-size: 0.85rem; color: var(--oer-text-main); margin-bottom: 1.5rem;">
                <strong>Atenção:</strong> ${cicloAtivo.avisoDeclaracao || "Preciso da declaração de estudo enviada até sua segunda passagem de som."}
            </div>

            <button type="button" class="btn btn-outline" style="width: 100%;" onclick="window.location.reload()">
                Fazer Outro Agendamento
            </button>
        `;

        modalSucesso.classList.add("show");

    } catch (err) {
        console.error("Erro ao registrar agendamento:", err);
        mostrarToast(err.message || "Erro ao agendar. Tente novamente.", "error");
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = `Confirmar Agendamento de Passagem de Som`;
    }
});
