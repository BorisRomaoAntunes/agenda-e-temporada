/**
 * passagem-som-public.js
 * Lógica da Página Pública de Agendamento de Passagem de Som (OER)
 * Implementação completa com Stepper, Autocomplete, Validação Inline,
 * Semáforo de Urgência, Prevenção de Duplicados, Revisão Prévia e Acessibilidade
 */

import {
    PassagemSomService,
    formatarDataBR,
    obterDiaSemanaCurto,
    normalizarTexto
} from "./passagem-som-service.js";

// Estado local da tela
let cicloAtivo = null;
let agendamentosAtuais = [];
let musicosAtivos = [];
let musicoSelecionado = null;
let agendamentoAnteriorParaSubstituir = null;

let selecaoP1 = { data: null, horario: null };
let selecaoP2 = { data: null, horario: null };

// Elementos da interface
const cicloTituloEl = document.getElementById("cicloTitulo");
const cicloDescricaoEl = document.getElementById("cicloDescricao");
const loaderEl = document.getElementById("loader");
const formEl = document.getElementById("formAgendamento");
const toastEl = document.getElementById("toastMsg");
const stepperWrapperEl = document.getElementById("stepperWrapper");

// Inputs e Grupos do Formulário
const musicoNomeInput = document.getElementById("musicoNome");
const musicoInstrumentoInput = document.getElementById("musicoInstrumento");
const musicoRepertorioInput = document.getElementById("musicoRepertorio");

const groupMusicoNome = document.getElementById("groupMusicoNome");
const groupMusicoInstrumento = document.getElementById("groupMusicoInstrumento");
const groupMusicoRepertorio = document.getElementById("groupMusicoRepertorio");

const musicoNomeErro = document.getElementById("musicoNomeErro");
const musicoInstrumentoErro = document.getElementById("musicoInstrumentoErro");
const musicoRepertorioErro = document.getElementById("musicoRepertorioErro");
const p1SlotErro = document.getElementById("p1SlotErro");
const p2SlotErro = document.getElementById("p2SlotErro");

const autocompleteList = document.getElementById("autocompleteList");
const musicoIdentificadoBadge = document.getElementById("musicoIdentificadoBadge");
const storedNotice = document.getElementById("storedNotice");
const btnLimparSalvos = document.getElementById("btnLimparSalvos");

// Resumo
const resumoContainer = document.getElementById("resumoContainer");
const resumoP1DataEl = document.getElementById("resumoP1Data");
const resumoP1HoraEl = document.getElementById("resumoP1Hora");
const resumoP2DataEl = document.getElementById("resumoP2Data");
const resumoP2HoraEl = document.getElementById("resumoP2Hora");
const btnConfirmar = document.getElementById("btnConfirmarAgendamento");
const motivoDesabilitado = document.getElementById("motivoDesabilitado");

// Stepper Items
const step1Btn = document.getElementById("step1Btn");
const step2Btn = document.getElementById("step2Btn");
const step3Btn = document.getElementById("step3Btn");
const step4Btn = document.getElementById("step4Btn");
const connFill1 = document.getElementById("connFill1");
const connFill2 = document.getElementById("connFill2");
const connFill3 = document.getElementById("connFill3");

// Modais
const modalRevisao = document.getElementById("modalRevisao");
const btnFecharRevisao = document.getElementById("btnFecharRevisao");
const btnVoltarEditar = document.getElementById("btnVoltarEditar");
const btnConfirmarDefinitivo = document.getElementById("btnConfirmarDefinitivo");
const revMusico = document.getElementById("revMusico");
const revRepertorio = document.getElementById("revRepertorio");
const revP1 = document.getElementById("revP1");
const revP2 = document.getElementById("revP2");

const modalDuplicado = document.getElementById("modalDuplicado");
const btnFecharDuplicado = document.getElementById("btnFecharDuplicado");
const duplicadoInfo = document.getElementById("duplicadoInfo");
const btnManterAgendamentoAnterior = document.getElementById("btnManterAgendamentoAnterior");
const btnSubstituirAgendamento = document.getElementById("btnSubstituirAgendamento");

const modalSucesso = document.getElementById("modalSucesso");
const sucessoConteudoEl = document.getElementById("sucessoConteudo");

const STORAGE_KEY = "oer_passagem_musico";

function mostrarToast(mensagem, tipo = "info") {
    if (!toastEl) return;
    toastEl.textContent = mensagem;
    toastEl.className = `toast-msg ${tipo} show`;
    setTimeout(() => {
        toastEl.classList.remove("show");
    }, 4500);
}

// =========================================================================
// INICIALIZAÇÃO
// =========================================================================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        await PassagemSomService.inicializarCicloPadraoSeNecessario();
        musicosAtivos = await PassagemSomService.getMusicosAtivos();

        // Recuperar dados prévios do LocalStorage
        recuperarDadosLocalStorage();

        // Configurar Listeners de Eventos de UX
        configurarAutocomplete();
        configurarValidacaoInline();
        configurarStepperNavegacao();
        configurarModais();

        // Escuta ciclo ativo
        PassagemSomService.listenCicloAtivo((ciclo) => {
            cicloAtivo = ciclo;
            if (loaderEl) loaderEl.classList.add("hidden");

            if (!ciclo) {
                document.getElementById("conteudoSemCiclo").style.display = "block";
                document.getElementById("conteudoForm").style.display = "none";
                if (stepperWrapperEl) stepperWrapperEl.style.display = "none";
                return;
            }

            document.getElementById("conteudoSemCiclo").style.display = "none";
            document.getElementById("conteudoForm").style.display = "block";
            if (stepperWrapperEl) stepperWrapperEl.style.display = "block";

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
                atualizarStepper();
            });
        });

    } catch (e) {
        console.error("Erro na inicialização pública:", e);
        if (loaderEl) loaderEl.classList.add("hidden");
        mostrarToast("Erro ao carregar configurações de passagem de som.", "error");
    }
});

// =========================================================================
// PERSISTÊNCIA VIA LOCALSTORAGE
// =========================================================================
function recuperarDadosLocalStorage() {
    try {
        const salvo = localStorage.getItem(STORAGE_KEY);
        if (salvo) {
            const data = JSON.parse(salvo);
            if (data.nome && musicoNomeInput) {
                musicoNomeInput.value = data.nome;
                if (data.instrumento && musicoInstrumentoInput) {
                    musicoInstrumentoInput.value = data.instrumento;
                }
                if (storedNotice) {
                    storedNotice.style.display = "flex";
                }
                validarMusicoCorrespondente(data.nome);
            }
        }
    } catch (e) {
        console.warn("Erro ao ler localStorage:", e);
    }

    if (btnLimparSalvos) {
        btnLimparSalvos.addEventListener("click", () => {
            try {
                localStorage.removeItem(STORAGE_KEY);
                if (musicoNomeInput) musicoNomeInput.value = "";
                if (musicoInstrumentoInput) musicoInstrumentoInput.value = "";
                if (musicoIdentificadoBadge) musicoIdentificadoBadge.style.display = "none";
                if (storedNotice) storedNotice.style.display = "none";
                musicoSelecionado = null;
                atualizarStepper();
                atualizarResumo();
                mostrarToast("Dados salvos limpos.", "info");
            } catch (e) {
                console.warn(e);
            }
        });
    }
}

function salvarDadosLocalStorage(nome, instrumento) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nome, instrumento }));
    } catch (e) {
        console.warn("Erro ao salvar localStorage:", e);
    }
}

// =========================================================================
// AUTOCOMPLETE DO NOME DO MÚSICO
// =========================================================================
let itemFocadoIndex = -1;

function configurarAutocomplete() {
    if (!musicoNomeInput || !autocompleteList) return;

    musicoNomeInput.addEventListener("input", () => {
        const termo = musicoNomeInput.value.trim();
        itemFocadoIndex = -1;

        if (termo.length < 2) {
            fecharAutocomplete();
            validarMusicoCorrespondente(termo);
            atualizarStepper();
            return;
        }

        const termoNorm = normalizarTexto(termo);
        const matches = musicosAtivos.filter((m) => {
            const nomeArt = normalizarTexto(m.nomeArtistico);
            const nomeReg = normalizarTexto(m.nomeRegistro);
            return nomeArt.includes(termoNorm) || nomeReg.includes(termoNorm);
        }).slice(0, 8);

        if (matches.length === 0) {
            fecharAutocomplete();
            validarMusicoCorrespondente(termo);
            atualizarStepper();
            return;
        }

        renderizarSugestoesAutocomplete(matches);
    });

    musicoNomeInput.addEventListener("keydown", (e) => {
        const itens = autocompleteList.querySelectorAll(".autocomplete-item");
        if (itens.length === 0 || !autocompleteList.classList.contains("show")) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            itemFocadoIndex = (itemFocadoIndex + 1) % itens.length;
            atualizarFocoAutocomplete(itens);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            itemFocadoIndex = (itemFocadoIndex - 1 + itens.length) % itens.length;
            atualizarFocoAutocomplete(itens);
        } else if (e.key === "Enter") {
            if (itemFocadoIndex >= 0 && itens[itemFocadoIndex]) {
                e.preventDefault();
                itens[itemFocadoIndex].click();
            }
        } else if (e.key === "Escape") {
            fecharAutocomplete();
        }
    });

    document.addEventListener("click", (e) => {
        if (!musicoNomeInput.contains(e.target) && !autocompleteList.contains(e.target)) {
            fecharAutocomplete();
        }
    });
}

function renderizarSugestoesAutocomplete(matches) {
    autocompleteList.innerHTML = "";
    matches.forEach((m, idx) => {
        const div = document.createElement("div");
        div.className = "autocomplete-item";
        div.setAttribute("role", "option");
        div.id = `autoOpt-${idx}`;
        div.innerHTML = `
            <div>
                <strong>${m.nome}</strong>
                ${m.nomeRegistro && m.nomeRegistro !== m.nome ? `<div style="font-size: 0.74rem; color: #64748b;">${m.nomeRegistro}</div>` : ""}
            </div>
            ${m.instrumento ? `<span class="autocomplete-instrument-badge">${m.instrumento}</span>` : ""}
        `;

        div.addEventListener("click", () => {
            selecionarMusicoAutocomplete(m);
        });

        autocompleteList.appendChild(div);
    });

    autocompleteList.classList.add("show");
}

function atualizarFocoAutocomplete(itens) {
    itens.forEach((it, idx) => {
        if (idx === itemFocadoIndex) {
            it.classList.add("active");
            it.scrollIntoView({ block: "nearest" });
        } else {
            it.classList.remove("active");
        }
    });
}

function selecionarMusicoAutocomplete(musico) {
    musicoSelecionado = musico;
    musicoNomeInput.value = musico.nome;
    if (musico.instrumento && musicoInstrumentoInput) {
        musicoInstrumentoInput.value = musico.instrumento;
    }

    fecharAutocomplete();
    limparErro(groupMusicoNome, musicoNomeErro);
    limparErro(groupMusicoInstrumento, musicoInstrumentoErro);

    if (musicoIdentificadoBadge) {
        musicoIdentificadoBadge.className = "musico-identified-badge found";
        musicoIdentificadoBadge.innerHTML = `<i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Músico da OER identificado (${musico.instrumento || "Geral"})`;
        musicoIdentificadoBadge.style.display = "inline-flex";
        if (window.lucide) lucide.createIcons();
    }

    atualizarStepper();
    atualizarResumo();

    // Rolar suavemente para a 1ª passagem se os campos obrigatórios estiverem ok
    if (musicoRepertorioInput && musicoRepertorioInput.value.trim().length > 2) {
        rolarParaSecao("secaoP1");
    } else {
        musicoRepertorioInput.focus();
    }
}

function validarMusicoCorrespondente(nomeDigitado) {
    if (!nomeDigitado || nomeDigitado.trim().length < 2) {
        musicoSelecionado = null;
        if (musicoIdentificadoBadge) musicoIdentificadoBadge.style.display = "none";
        return;
    }

    const match = PassagemSomService.encontrarMusicoCorrespondente(nomeDigitado, musicosAtivos);
    if (match.musico) {
        musicoSelecionado = match.musico;
        if (!musicoInstrumentoInput.value.trim() && match.musico.instrumento) {
            musicoInstrumentoInput.value = match.musico.instrumento;
            limparErro(groupMusicoInstrumento, musicoInstrumentoErro);
        }
        if (musicoIdentificadoBadge) {
            musicoIdentificadoBadge.className = "musico-identified-badge found";
            musicoIdentificadoBadge.innerHTML = `<i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Músico da OER reconhecido (${match.musico.instrumento || ""})`;
            musicoIdentificadoBadge.style.display = "inline-flex";
            if (window.lucide) lucide.createIcons();
        }
    } else {
        musicoSelecionado = null;
        if (musicoIdentificadoBadge) {
            musicoIdentificadoBadge.className = "musico-identified-badge custom";
            musicoIdentificadoBadge.innerHTML = `<i data-lucide="info" style="width: 14px; height: 14px;"></i> Músico externo / convidado ou nome personalizado`;
            musicoIdentificadoBadge.style.display = "inline-flex";
            if (window.lucide) lucide.createIcons();
        }
    }
}

function fecharAutocomplete() {
    if (autocompleteList) {
        autocompleteList.classList.remove("show");
        autocompleteList.innerHTML = "";
    }
    itemFocadoIndex = -1;
}

// =========================================================================
// VALIDAÇÃO INLINE
// =========================================================================
function aplicarErro(groupEl, erroEl) {
    if (groupEl) groupEl.classList.add("has-error");
    if (erroEl) erroEl.style.display = "flex";
}

function limparErro(groupEl, erroEl) {
    if (groupEl) groupEl.classList.remove("has-error");
    if (erroEl) erroEl.style.display = "none";
}

function configurarValidacaoInline() {
    if (musicoNomeInput) {
        musicoNomeInput.addEventListener("blur", () => {
            if (!musicoNomeInput.value.trim()) {
                aplicarErro(groupMusicoNome, musicoNomeErro);
            } else {
                limparErro(groupMusicoNome, musicoNomeErro);
            }
        });
        musicoNomeInput.addEventListener("input", () => {
            if (musicoNomeInput.value.trim()) {
                limparErro(groupMusicoNome, musicoNomeErro);
            }
            atualizarStepper();
            atualizarResumo();
        });
    }

    if (musicoInstrumentoInput) {
        musicoInstrumentoInput.addEventListener("blur", () => {
            if (!musicoInstrumentoInput.value.trim()) {
                aplicarErro(groupMusicoInstrumento, musicoInstrumentoErro);
            } else {
                limparErro(groupMusicoInstrumento, musicoInstrumentoErro);
            }
        });
        musicoInstrumentoInput.addEventListener("input", () => {
            if (musicoInstrumentoInput.value.trim()) {
                limparErro(groupMusicoInstrumento, musicoInstrumentoErro);
            }
            atualizarStepper();
            atualizarResumo();
        });
    }

    if (musicoRepertorioInput) {
        musicoRepertorioInput.addEventListener("blur", () => {
            if (!musicoRepertorioInput.value.trim()) {
                aplicarErro(groupMusicoRepertorio, musicoRepertorioErro);
            } else {
                limparErro(groupMusicoRepertorio, musicoRepertorioErro);
            }
        });
        musicoRepertorioInput.addEventListener("input", () => {
            if (musicoRepertorioInput.value.trim()) {
                limparErro(groupMusicoRepertorio, musicoRepertorioErro);
            }
            atualizarStepper();
            atualizarResumo();
        });
    }
}

function dadosMusicoValidos() {
    const nome = musicoNomeInput ? musicoNomeInput.value.trim() : "";
    const instrumento = musicoInstrumentoInput ? musicoInstrumentoInput.value.trim() : "";
    const repertorio = musicoRepertorioInput ? musicoRepertorioInput.value.trim() : "";
    return Boolean(nome && instrumento && repertorio);
}

// =========================================================================
// STEPPER / BARRA DE PROGRESSO & SCROLL SUAVE
// =========================================================================
function configurarStepperNavegacao() {
    const steps = [
        { btn: step1Btn, target: "secaoMusico" },
        { btn: step2Btn, target: "secaoP1" },
        { btn: step3Btn, target: "secaoP2" },
        { btn: step4Btn, target: "secaoResumo" }
    ];

    steps.forEach(({ btn, target }) => {
        if (!btn) return;
        btn.addEventListener("click", () => {
            rolarParaSecao(target);
        });
    });
}

function rolarParaSecao(secaoId) {
    const el = document.getElementById(secaoId);
    if (!el) return;
    const offset = 75; // compensar stepper sticky
    const bodyRect = document.body.getBoundingClientRect().top;
    const elementRect = el.getBoundingClientRect().top;
    const elementPosition = elementRect - bodyRect;
    const offsetPosition = elementPosition - offset;

    window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
    });
}

function atualizarStepper() {
    const s1Ok = dadosMusicoValidos();
    const s2Ok = Boolean(selecaoP1.data && selecaoP1.horario);
    const s3Ok = Boolean(selecaoP2.data && selecaoP2.horario);

    // Passo 1
    if (s1Ok) {
        step1Btn?.classList.remove("active");
        step1Btn?.classList.add("completed");
        if (connFill1) connFill1.style.width = "100%";
    } else {
        step1Btn?.classList.add("active");
        step1Btn?.classList.remove("completed");
        if (connFill1) connFill1.style.width = "0%";
    }

    // Passo 2
    if (s2Ok) {
        step2Btn?.classList.remove("active");
        step2Btn?.classList.add("completed");
        if (connFill2) connFill2.style.width = "100%";
    } else if (s1Ok) {
        step2Btn?.classList.add("active");
        step2Btn?.classList.remove("completed");
        if (connFill2) connFill2.style.width = "0%";
    } else {
        step2Btn?.classList.remove("active", "completed");
        if (connFill2) connFill2.style.width = "0%";
    }

    // Passo 3
    if (s3Ok) {
        step3Btn?.classList.remove("active");
        step3Btn?.classList.add("completed");
        if (connFill3) connFill3.style.width = "100%";
    } else if (s1Ok && s2Ok) {
        step3Btn?.classList.add("active");
        step3Btn?.classList.remove("completed");
        if (connFill3) connFill3.style.width = "0%";
    } else {
        step3Btn?.classList.remove("active", "completed");
        if (connFill3) connFill3.style.width = "0%";
    }

    // Passo 4
    if (s1Ok && s2Ok && s3Ok) {
        step4Btn?.classList.add("active");
    } else {
        step4Btn?.classList.remove("active", "completed");
    }
}

// =========================================================================
// RENDERIZAÇÃO DA 1ª PASSAGEM DE SOM COM SEMÁFORO
// =========================================================================
function renderizarPeriodo1() {
    if (!cicloAtivo || !cicloAtivo.periodo1 || !cicloAtivo.periodo1.dias) return;

    const diasContainer = document.getElementById("p1DiasContainer");
    const slotsContainer = document.getElementById("p1SlotsContainer");
    const dias = cicloAtivo.periodo1.dias;

    if (!selecaoP1.data && dias.length > 0) {
        selecaoP1.data = dias[0].data;
    }

    // Renderiza botões das datas (pílulas com semáforo)
    diasContainer.innerHTML = "";
    dias.forEach((d) => {
        const isSelected = selecaoP1.data === d.data;

        // Cálculo de disponibilidade para o semáforo
        const totalSlots = d.horarios ? d.horarios.length : 0;
        let ocupadosCount = 0;
        if (d.horarios) {
            agendamentosAtuais.forEach((ag) => {
                if (ag.primeiraPassagem && ag.primeiraPassagem.data === d.data && d.horarios.includes(ag.primeiraPassagem.horario)) {
                    ocupadosCount++;
                }
            });
        }
        const vagasLivres = Math.max(0, totalSlots - ocupadosCount);
        const ratio = totalSlots > 0 ? (vagasLivres / totalSlots) : 0;

        let urgenciaClasse = "urgency-high";
        let urgenciaTexto = `${vagasLivres} vagas`;

        if (vagasLivres === 0) {
            urgenciaClasse = "urgency-none";
            urgenciaTexto = "Esgotado";
        } else if (ratio < 0.25) {
            urgenciaClasse = "urgency-low";
            urgenciaTexto = vagasLivres === 1 ? "Última vaga!" : `${vagasLivres} vagas`;
        } else if (ratio <= 0.5) {
            urgenciaClasse = "urgency-med";
            urgenciaTexto = `${vagasLivres} vagas`;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.role = "tab";
        btn.className = `date-pill-btn ${isSelected ? "selected" : ""}`;
        btn.setAttribute("aria-selected", isSelected ? "true" : "false");
        btn.setAttribute("aria-label", `${d.diaSemana || obterDiaSemanaCurto(d.data)}, ${formatarDataBR(d.data)} - ${urgenciaTexto}`);
        
        btn.innerHTML = `
            <div class="date-pill-day">${d.diaSemana || obterDiaSemanaCurto(d.data)}</div>
            <div class="date-pill-date">${formatarDataBR(d.data).substring(0, 5)}</div>
            <span class="pill-urgency ${urgenciaClasse}">${urgenciaTexto}</span>
        `;

        btn.addEventListener("click", () => {
            selecaoP1.data = d.data;
            selecaoP1.horario = null;
            renderizarPeriodo1();
            atualizarResumo();
            atualizarStepper();
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
        btn.setAttribute("aria-label", `Horário ${hora} - ${isOcupado ? "Ocupado" : (isSelected ? "Selecionado" : "Disponível")}`);
        btn.setAttribute("aria-pressed", isSelected ? "true" : "false");

        btn.innerHTML = `
            <span>${hora}</span>
            <small style="font-size: 0.7rem; font-weight: normal;">${isOcupado ? "Ocupado" : (isSelected ? "Selecionado" : "Disponível")}</small>
        `;

        if (!isOcupado) {
            btn.addEventListener("click", () => {
                selecaoP1.horario = hora;
                limparErro(null, p1SlotErro);
                renderizarPeriodo1();
                atualizarResumo();
                atualizarStepper();

                // Destacar atualização no resumo
                if (resumoP1DataEl) resumoP1DataEl.parentElement.classList.add("pulse-updated");
                setTimeout(() => {
                    resumoP1DataEl?.parentElement.classList.remove("pulse-updated");
                }, 450);

                // Auto-rolar para a 2ª passagem
                rolarParaSecao("secaoP2");
            });
        }

        slotsContainer.appendChild(btn);
    });
}

// =========================================================================
// RENDERIZAÇÃO DA 2ª PASSAGEM DE SOM COM SEMÁFORO
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

        // Cálculo de disponibilidade
        const totalSlots = d.horarios ? d.horarios.length : 0;
        let ocupadosCount = 0;
        if (d.horarios) {
            agendamentosAtuais.forEach((ag) => {
                if (ag.segundaPassagem && ag.segundaPassagem.data === d.data && d.horarios.includes(ag.segundaPassagem.horario)) {
                    ocupadosCount++;
                }
            });
        }
        const vagasLivres = Math.max(0, totalSlots - ocupadosCount);
        const ratio = totalSlots > 0 ? (vagasLivres / totalSlots) : 0;

        let urgenciaClasse = "urgency-high";
        let urgenciaTexto = `${vagasLivres} vagas`;

        if (vagasLivres === 0) {
            urgenciaClasse = "urgency-none";
            urgenciaTexto = "Esgotado";
        } else if (ratio < 0.25) {
            urgenciaClasse = "urgency-low";
            urgenciaTexto = vagasLivres === 1 ? "Última vaga!" : `${vagasLivres} vagas`;
        } else if (ratio <= 0.5) {
            urgenciaClasse = "urgency-med";
            urgenciaTexto = `${vagasLivres} vagas`;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.role = "tab";
        btn.className = `date-pill-btn ${isSelected ? "selected" : ""}`;
        btn.setAttribute("aria-selected", isSelected ? "true" : "false");
        btn.setAttribute("aria-label", `${d.diaSemana || obterDiaSemanaCurto(d.data)}, ${formatarDataBR(d.data)} - ${urgenciaTexto}`);

        btn.innerHTML = `
            <div class="date-pill-day">${d.diaSemana || obterDiaSemanaCurto(d.data)}</div>
            <div class="date-pill-date">${formatarDataBR(d.data).substring(0, 5)}</div>
            <span class="pill-urgency ${urgenciaClasse}">${urgenciaTexto}</span>
        `;

        btn.addEventListener("click", () => {
            selecaoP2.data = d.data;
            selecaoP2.horario = null;
            renderizarPeriodo2();
            atualizarResumo();
            atualizarStepper();
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
        btn.setAttribute("aria-label", `Horário ${hora} - ${isOcupado ? "Ocupado" : (isSelected ? "Selecionado" : "Disponível")}`);
        btn.setAttribute("aria-pressed", isSelected ? "true" : "false");

        btn.innerHTML = `
            <span>${hora}</span>
            <small style="font-size: 0.7rem; font-weight: normal;">${isOcupado ? "Ocupado" : (isSelected ? "Selecionado" : "Disponível")}</small>
        `;

        if (!isOcupado) {
            btn.addEventListener("click", () => {
                selecaoP2.horario = hora;
                limparErro(null, p2SlotErro);
                renderizarPeriodo2();
                atualizarResumo();
                atualizarStepper();

                // Destacar atualização no resumo
                if (resumoP2DataEl) resumoP2DataEl.parentElement.classList.add("pulse-updated");
                setTimeout(() => {
                    resumoP2DataEl?.parentElement.classList.remove("pulse-updated");
                }, 450);

                // Auto-rolar para a seção de confirmação
                rolarParaSecao("secaoResumo");
            });
        }

        slotsContainer.appendChild(btn);
    });
}

// =========================================================================
// ATUALIZAÇÃO DO RESUMO E MOTIVOS DE BLOQUEIO
// =========================================================================
function atualizarResumo() {
    if (selecaoP1.data && selecaoP1.horario) {
        resumoP1DataEl.textContent = formatarDataBR(selecaoP1.data);
        resumoP1HoraEl.textContent = `às ${selecaoP1.horario}`;
    } else {
        resumoP1DataEl.textContent = selecaoP1.data ? formatarDataBR(selecaoP1.data) : "-";
        resumoP1HoraEl.textContent = "Selecione o horário acima";
    }

    if (selecaoP2.data && selecaoP2.horario) {
        resumoP2DataEl.textContent = formatarDataBR(selecaoP2.data);
        resumoP2HoraEl.textContent = `às ${selecaoP2.horario}`;
    } else {
        resumoP2DataEl.textContent = selecaoP2.data ? formatarDataBR(selecaoP2.data) : "-";
        resumoP2HoraEl.textContent = "Selecione o horário acima";
    }

    const musicoOk = dadosMusicoValidos();
    const p1Ok = Boolean(selecaoP1.horario);
    const p2Ok = Boolean(selecaoP2.horario);
    const pronto = musicoOk && p1Ok && p2Ok;

    btnConfirmar.disabled = !pronto;

    // Mensagem de auxílio ao usuário
    if (motivoDesabilitado) {
        if (!musicoOk) {
            motivoDesabilitado.textContent = "Passo 1: Preencha seu nome, instrumento e repertório.";
        } else if (!p1Ok) {
            motivoDesabilitado.textContent = "Passo 2: Escolha o horário para a 1ª passagem de som.";
        } else if (!p2Ok) {
            motivoDesabilitado.textContent = "Passo 3: Escolha o horário para a 2ª passagem de som.";
        } else {
            motivoDesabilitado.textContent = "✓ Todos os dados preenchidos. Clique no botão para revisar e confirmar.";
        }
    }
}

// =========================================================================
// MODAIS DE REVISÃO E DUPLICIDADE
// =========================================================================
function configurarModais() {
    // Modal de Revisão
    if (btnFecharRevisao) {
        btnFecharRevisao.addEventListener("click", () => fecharModal(modalRevisao));
    }
    if (btnVoltarEditar) {
        btnVoltarEditar.addEventListener("click", () => fecharModal(modalRevisao));
    }

    // Modal de Duplicado
    if (btnFecharDuplicado) {
        btnFecharDuplicado.addEventListener("click", () => fecharModal(modalDuplicado));
    }
    if (btnManterAgendamentoAnterior) {
        btnManterAgendamentoAnterior.addEventListener("click", () => {
            fecharModal(modalDuplicado);
            mostrarToast("Seu agendamento anterior foi mantido inalterado.", "info");
        });
    }
    if (btnSubstituirAgendamento) {
        btnSubstituirAgendamento.addEventListener("click", () => {
            fecharModal(modalDuplicado);
            abrirModalRevisao();
        });
    }

    // Confirmar definitivo
    if (btnConfirmarDefinitivo) {
        btnConfirmarDefinitivo.addEventListener("click", executarAgendamentoDefinitivo);
    }

    // Fechar com Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            fecharModal(modalRevisao);
            fecharModal(modalDuplicado);
        }
    });
}

function abrirModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("show");
    document.body.style.overflow = "hidden";
}

function fecharModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("show");
    document.body.style.overflow = "";
}

function abrirModalRevisao() {
    const nome = musicoNomeInput.value.trim();
    const instrumento = musicoInstrumentoInput.value.trim();
    const repertorio = musicoRepertorioInput.value.trim();

    if (revMusico) revMusico.textContent = `${nome} (${instrumento})`;
    if (revRepertorio) revRepertorio.textContent = repertorio;
    if (revP1) revP1.textContent = `${formatarDataBR(selecaoP1.data)} às ${selecaoP1.horario}`;
    if (revP2) revP2.textContent = `${formatarDataBR(selecaoP2.data)} às ${selecaoP2.horario}`;

    abrirModal(modalRevisao);
    if (window.lucide) lucide.createIcons();
}

// =========================================================================
// ENVIO DO FORMULÁRIO COM CHECK DE DUPLICADOS E REVISÃO
// =========================================================================
formEl.addEventListener("submit", async (e) => {
    e.preventDefault();

    let temErro = false;

    if (!musicoNomeInput.value.trim()) {
        aplicarErro(groupMusicoNome, musicoNomeErro);
        temErro = true;
    }
    if (!musicoInstrumentoInput.value.trim()) {
        aplicarErro(groupMusicoInstrumento, musicoInstrumentoErro);
        temErro = true;
    }
    if (!musicoRepertorioInput.value.trim()) {
        aplicarErro(groupMusicoRepertorio, musicoRepertorioErro);
        temErro = true;
    }

    if (!selecaoP1.horario) {
        aplicarErro(null, p1SlotErro);
        temErro = true;
    }
    if (!selecaoP2.horario) {
        aplicarErro(null, p2SlotErro);
        temErro = true;
    }

    if (temErro) {
        mostrarToast("Por favor, preencha todos os campos e selecione os horários.", "error");
        return;
    }

    const nome = musicoNomeInput.value.trim();
    const musId = musicoSelecionado ? musicoSelecionado.id : null;

    try {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = `<span class="loader-spinner" style="width: 16px; height: 16px; margin: 0; border-width: 2px;"></span> Verificando...`;

        // 3. Checagem de agendamento duplicado
        const agendamentoExistente = await PassagemSomService.getAgendamentoDoMusico(musId, nome, cicloAtivo.id);

        if (agendamentoExistente) {
            agendamentoAnteriorParaSubstituir = agendamentoExistente;
            if (duplicadoInfo) {
                duplicadoInfo.innerHTML = `
                    <div style="margin-top: 0.35rem; color: #78350f;">
                        1ª Passagem: <strong>${formatarDataBR(agendamentoExistente.primeiraPassagem.data)} às ${agendamentoExistente.primeiraPassagem.horario}</strong><br>
                        2ª Passagem: <strong>${formatarDataBR(agendamentoExistente.segundaPassagem.data)} às ${agendamentoExistente.segundaPassagem.horario}</strong>
                    </div>
                `;
            }
            abrirModal(modalDuplicado);
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Se não houver duplicado, abre direto o modal de revisão
        agendamentoAnteriorParaSubstituir = null;
        abrirModalRevisao();

    } catch (err) {
        console.error("Erro na verificação prévia:", err);
        mostrarToast("Erro ao verificar disponibilidade. Tente novamente.", "error");
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = `Revisar e Confirmar Agendamento`;
    }
});

// =========================================================================
// GRAVAÇÃO FINAL DEFINITIVA
// =========================================================================
async function executarAgendamentoDefinitivo() {
    const nome = musicoNomeInput.value.trim();
    const instrumento = musicoInstrumentoInput.value.trim();
    const repertorio = musicoRepertorioInput.value.trim();

    try {
        btnConfirmarDefinitivo.disabled = true;
        btnConfirmarDefinitivo.innerHTML = `<span class="loader-spinner" style="width: 18px; height: 18px; margin: 0; border-width: 2px;"></span> Agendando...`;

        // Se o usuário optou por substituir o agendamento anterior
        if (agendamentoAnteriorParaSubstituir && agendamentoAnteriorParaSubstituir.id) {
            try {
                await PassagemSomService.cancelarAgendamento(agendamentoAnteriorParaSubstituir.id);
            } catch (errCanc) {
                console.warn("Aviso ao liberar agendamento anterior:", errCanc);
            }
        }

        const resultado = await PassagemSomService.agendarPassagem({
            cicloId: cicloAtivo.id,
            nome,
            instrumento,
            repertorio,
            p1: selecaoP1,
            p2: selecaoP2,
            musicosAtivos
        });

        // Salvar preferências no LocalStorage para visitas futuras
        salvarDadosLocalStorage(nome, instrumento);

        // Fechar modal de revisão
        fecharModal(modalRevisao);

        // Exibir Modal de Sucesso Rico
        sucessoConteudoEl.innerHTML = `
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--oer-success-bg); color: var(--oer-success); display: inline-flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 0.75rem;">
                    ✓
                </div>
                <h3 style="color: var(--oer-text-main); font-size: 1.35rem; margin-bottom: 0.25rem;">Agendamento Confirmado!</h3>
                <p style="color: var(--oer-text-muted); font-size: 0.9rem;">Parabéns, <strong>${resultado.nomeDigitado}</strong>. Suas passagens de som foram agendadas com sucesso.</p>
            </div>

            <div style="background: #f8fafc; border: 1px solid var(--oer-border); border-radius: 10px; padding: 1.25rem; margin-bottom: 1.5rem;">
                <div style="margin-bottom: 0.75rem;">
                    <span style="font-size: 0.76rem; color: var(--oer-text-muted); font-weight: 700; text-transform: uppercase;">Instrumento & Repertório</span>
                    <p style="font-weight: 700; color: var(--oer-text-main); font-size: 0.95rem;">${resultado.instrumento} — ${resultado.repertorio}</p>
                </div>
                <hr style="border: none; border-top: 1px solid var(--oer-border); margin: 0.75rem 0;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <span style="font-size: 0.76rem; color: var(--oer-primary); font-weight: 700; text-transform: uppercase;">1ª Passagem</span>
                        <p style="font-weight: 700; color: var(--oer-text-main); font-size: 1.05rem;">${formatarDataBR(resultado.primeiraPassagem.data)}</p>
                        <p style="color: var(--oer-text-muted); font-size: 0.9rem;">às ${resultado.primeiraPassagem.horario}</p>
                    </div>
                    <div>
                        <span style="font-size: 0.76rem; color: var(--oer-primary); font-weight: 700; text-transform: uppercase;">2ª Passagem</span>
                        <p style="font-weight: 700; color: var(--oer-text-main); font-size: 1.05rem;">${formatarDataBR(resultado.segundaPassagem.data)}</p>
                        <p style="color: var(--oer-text-muted); font-size: 0.9rem;">às ${resultado.segundaPassagem.horario}</p>
                    </div>
                </div>
            </div>

            <div style="background: var(--oer-accent-light); border-left: 4px solid var(--oer-primary); padding: 0.9rem 1rem; border-radius: 6px; font-size: 0.85rem; color: var(--oer-text-main); margin-bottom: 1.5rem;">
                <strong>Atenção:</strong> ${cicloAtivo.avisoDeclaracao || "DECLARAÇÃO de ESTUDO deverá ser enviada para o Inspetor da OER até sua SEGUNDA PASSAGEM DE SOM."}
            </div>

            <button type="button" class="btn btn-outline" style="width: 100%; padding: 0.75rem;" onclick="window.location.reload()">
                Fazer Outro Agendamento
            </button>
        `;

        abrirModal(modalSucesso);
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error("Erro ao registrar agendamento:", err);
        mostrarToast(err.message || "Erro ao agendar. Tente novamente.", "error");
    } finally {
        btnConfirmarDefinitivo.disabled = false;
        btnConfirmarDefinitivo.innerHTML = `Confirmar Definitivamente`;
    }
}

