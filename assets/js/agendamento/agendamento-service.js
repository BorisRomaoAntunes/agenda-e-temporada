/**
 * agendamento-service.js
 * Serviços e regras de negócio para Salas e Agendamentos em Tempo Real
 */

import { db } from "../firebase-config.js";
import {
    collection,
    doc,
    setDoc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const SALAS_COLLECTION = "salas_agendamento";
const AGENDAMENTOS_COLLECTION = "agendamentos_salas";

export const AgendamentoService = {
    /**
     * Escuta salas ativas em tempo real (Firestore com fallback para LocalStorage no ambiente de teste)
     */
    listenSalas(callback) {
        const loadLocalSalas = () => {
            try {
                const stored = localStorage.getItem("LOCAL_SALAS_AGENDAMENTO");
                const salas = stored ? JSON.parse(stored) : [];
                salas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
                callback(salas);
            } catch(e) {
                console.warn("Erro ao ler localStorage de salas:", e);
                callback([]);
            }
        };

        const q = query(collection(db, SALAS_COLLECTION));
        return onSnapshot(q, (snapshot) => {
            const salas = [];
            snapshot.forEach((docSnap) => {
                salas.push({ id: docSnap.id, ...docSnap.data() });
            });
            salas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            callback(salas);
        }, (error) => {
            console.warn("Firestore Salas (usando persistência de teste local):", error.message);
            loadLocalSalas();
            window.addEventListener("local_salas_updated", loadLocalSalas);
        });
    },

    /**
     * Salva ou atualiza uma sala (com suporte offline/teste)
     */
    async saveSala(salaData, salaId = null) {
        const payload = {
            nome: salaData.nome,
            descricao: salaData.descricao || "",
            capacidade: Number(salaData.capacidade) || 1,
            slotDuration: Number(salaData.slotDuration) || 60,
            horarioSemanal: salaData.horarioSemanal || {
                dias: [1, 2, 3, 4, 5],
                inicio: "09:00",
                fim: "18:00"
            },
            datasBloqueadas: salaData.datasBloqueadas || [],
            dataInicioPeriodo: salaData.dataInicioPeriodo || null,
            dataFimPeriodo: salaData.dataFimPeriodo || null,
            cor: salaData.cor || "#ea580c",
            ativa: salaData.ativa !== undefined ? salaData.ativa : true,
            updatedAt: new Date().toISOString()
        };

        try {
            if (salaId) {
                await updateDoc(doc(db, SALAS_COLLECTION, salaId), {
                    ...payload,
                    updatedAt: serverTimestamp()
                });
                return salaId;
            } else {
                const docRef = await addDoc(collection(db, SALAS_COLLECTION), {
                    ...payload,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                return docRef.id;
            }
        } catch (firestoreError) {
            console.warn("Firestore negou escrita direta (modo de teste ativado localmente):", firestoreError.message);
            // Fallback imediato no localStorage para teste 100% funcional
            let salas = [];
            try {
                salas = JSON.parse(localStorage.getItem("LOCAL_SALAS_AGENDAMENTO") || "[]");
            } catch(e) { salas = []; }

            const idFinal = salaId || ("sala_" + Date.now());
            payload.id = idFinal;

            if (salaId) {
                const idx = salas.findIndex(s => s.id === salaId);
                if (idx !== -1) salas[idx] = { ...salas[idx], ...payload };
                else salas.push(payload);
            } else {
                payload.createdAt = new Date().toISOString();
                salas.push(payload);
            }

            localStorage.setItem("LOCAL_SALAS_AGENDAMENTO", JSON.stringify(salas));
            window.dispatchEvent(new CustomEvent("local_salas_updated"));
            return idFinal;
        }
    },

    /**
     * Remove uma sala
     */
    async deleteSala(salaId) {
        try {
            await deleteDoc(doc(db, SALAS_COLLECTION, salaId));
        } catch(e) {
            console.warn("Removendo do modo local de teste:", e.message);
        }
        try {
            let salas = JSON.parse(localStorage.getItem("LOCAL_SALAS_AGENDAMENTO") || "[]");
            salas = salas.filter(s => s.id !== salaId);
            localStorage.setItem("LOCAL_SALAS_AGENDAMENTO", JSON.stringify(salas));
            window.dispatchEvent(new CustomEvent("local_salas_updated"));
        } catch(e) {}
    },

    /**
     * Escuta agendamentos para uma data específica ou geral em tempo real
     */
    listenAgendamentos(dataFiltro, callback) {
        const loadLocalAgendamentos = () => {
            try {
                let ags = JSON.parse(localStorage.getItem("LOCAL_AGENDAMENTOS_SALAS") || "[]");
                if (dataFiltro) {
                    ags = ags.filter(a => a.data === dataFiltro && a.status === "confirmado");
                } else {
                    ags = ags.filter(a => a.status === "confirmado");
                }
                ags.sort((a, b) => (a.horaInicio || "").localeCompare(b.horaInicio || ""));
                callback(ags);
            } catch(e) {
                callback([]);
            }
        };

        let q;
        if (dataFiltro) {
            q = query(
                collection(db, AGENDAMENTOS_COLLECTION),
                where("data", "==", dataFiltro),
                where("status", "==", "confirmado")
            );
        } else {
            q = query(
                collection(db, AGENDAMENTOS_COLLECTION),
                where("status", "==", "confirmado")
            );
        }

        return onSnapshot(q, (snapshot) => {
            const agendamentos = [];
            snapshot.forEach((docSnap) => {
                agendamentos.push({ id: docSnap.id, ...docSnap.data() });
            });
            agendamentos.sort((a, b) => (a.horaInicio || "").localeCompare(b.horaInicio || ""));
            callback(agendamentos);
        }, (error) => {
            console.warn("Firestore Agendamentos (usando persistência de teste local):", error.message);
            loadLocalAgendamentos();
            window.addEventListener("local_agendamentos_updated", loadLocalAgendamentos);
        });
    },

    /**
     * Realiza um novo agendamento com validação de conflito de horário
     */
    async createAgendamento(dados) {
        const payload = {
            salaId: dados.salaId,
            salaNome: dados.salaNome,
            data: dados.data,
            horaInicio: dados.horaInicio,
            horaFim: dados.horaFim,
            nomeSolicitante: dados.nomeSolicitante.trim(),
            vinculo: dados.vinculo,
            instrumento: (dados.instrumento || "").trim(),
            necessidades: (dados.necessidades || "").trim(),
            precisaPartitura: Boolean(dados.precisaPartitura),
            qualPartitura: dados.precisaPartitura ? (dados.qualPartitura || "").trim() : "",
            status: "confirmado",
            createdAt: new Date().toISOString()
        };

        try {
            const conflitoQuery = query(
                collection(db, AGENDAMENTOS_COLLECTION),
                where("salaId", "==", dados.salaId),
                where("data", "==", dados.data),
                where("horaInicio", "==", dados.horaInicio),
                where("status", "==", "confirmado")
            );

            const conflitoSnap = await getDocs(conflitoQuery);
            if (!conflitoSnap.empty) {
                throw new Error("Este horário acabou de ser reservado por outra pessoa. Por favor, selecione outro horário.");
            }

            const docRef = await addDoc(collection(db, AGENDAMENTOS_COLLECTION), {
                ...payload,
                createdAt: serverTimestamp()
            });

            // Registrar log de auditoria no Admin (Últimas Atualizações)
            try {
                const dataFormatada = (dados.data || "").split('-').reverse().join('/');
                const logData = {
                    type: "agendamento",
                    message: `Novo agendamento: ${payload.nomeSolicitante} - ${payload.salaNome}`,
                    details: `Data: ${dataFormatada} das ${payload.horaInicio} às ${payload.horaFim}\nInstrumento/Naipe: ${payload.instrumento || 'Não informado'}\nVínculo: ${payload.vinculo || 'Bolsista'}\nNecessidades: ${payload.necessidades || 'Nenhuma'}\nPartitura: ${payload.precisaPartitura ? (payload.qualPartitura || 'Sim') : 'Não'}`,
                    user: `${payload.nomeSolicitante} (${payload.vinculo || 'Bolsista'})`,
                    link: "agendamento.html",
                    createdAt: new Date().toISOString()
                };
                await addDoc(collection(db, "adminLogs"), logData);
            } catch (logErr) {
                console.warn("Não foi possível gravar log em adminLogs:", logErr.message);
            }

            return docRef.id;
        } catch (err) {
            if (err.message && err.message.includes("Este horário")) {
                throw err;
            }
            console.warn("Criando agendamento no modo local de teste:", err.message);
            let ags = JSON.parse(localStorage.getItem("LOCAL_AGENDAMENTOS_SALAS") || "[]");
            const conflito = ags.some(a => a.salaId === dados.salaId && a.data === dados.data && a.horaInicio === dados.horaInicio && a.status === "confirmado");
            if (conflito) {
                throw new Error("Este horário acabou de ser reservado por outra pessoa. Por favor, selecione outro horário.");
            }
            payload.id = "ag_" + Date.now();
            ags.push(payload);
            localStorage.setItem("LOCAL_AGENDAMENTOS_SALAS", JSON.stringify(ags));
            window.dispatchEvent(new CustomEvent("local_agendamentos_updated"));
            return payload.id;
        }
    },

    /**
     * Cancela um agendamento liberando o horário imediatamente e registra auditoria no admin
     */
    async cancelAgendamento(agendamentoId, canceladoPor = "Administrador", agendamentoObj = null) {
        let agData = agendamentoObj;
        try {
            if (!agData) {
                const agSnap = await getDoc(doc(db, AGENDAMENTOS_COLLECTION, agendamentoId));
                if (agSnap.exists()) {
                    agData = agSnap.data();
                }
            }

            await updateDoc(doc(db, AGENDAMENTOS_COLLECTION, agendamentoId), {
                status: "cancelado",
                cancelledAt: serverTimestamp(),
                cancelledBy: canceladoPor
            });

            // Registrar log de cancelamento em adminLogs
            if (agData) {
                const dataFormatada = (agData.data || "").split('-').reverse().join('/');
                const logData = {
                    type: "agendamento-cancelado",
                    message: `Agendamento cancelado: ${agData.salaNome || 'Sala'} (${dataFormatada} das ${agData.horaInicio} às ${agData.horaFim})`,
                    details: `Cancelado por: ${canceladoPor}\nSolicitante original: ${agData.nomeSolicitante || 'Desconhecido'} (${agData.instrumento || 'Instrumento não informado'} - ${agData.vinculo || 'Bolsista'})\nNecessidades originais: ${agData.necessidades || 'Nenhuma'}\nPartitura: ${agData.precisaPartitura ? (agData.qualPartitura || 'Sim') : 'Não'}`,
                    user: canceladoPor,
                    link: "agendamento.html",
                    createdAt: new Date().toISOString()
                };
                await addDoc(collection(db, "adminLogs"), logData);
            }
        } catch(e) {
            console.warn("Cancelando agendamento no modo local:", e.message);
        }
        try {
            let ags = JSON.parse(localStorage.getItem("LOCAL_AGENDAMENTOS_SALAS") || "[]");
            const idx = ags.findIndex(a => a.id === agendamentoId);
            if (idx !== -1) {
                ags[idx].status = "cancelado";
                localStorage.setItem("LOCAL_AGENDAMENTOS_SALAS", JSON.stringify(ags));
                window.dispatchEvent(new CustomEvent("local_agendamentos_updated"));
            }
        } catch(e) {}
    },

    /**
     * Calcula slots disponíveis para uma sala em uma data escolhida
     */
    calculateAvailableSlots(sala, dataStr, agendamentosConfirmados) {
        if (!sala || !dataStr) return [];

        // Validação de Período Limite (Data Inicial e Final)
        if (sala.dataInicioPeriodo && dataStr < sala.dataInicioPeriodo) {
            return [];
        }
        if (sala.dataFimPeriodo && dataStr > sala.dataFimPeriodo) {
            return [];
        }

        // Verifica se a data está na lista de datas bloqueadas da sala
        if (sala.datasBloqueadas && sala.datasBloqueadas.includes(dataStr)) {
            return [];
        }

        // Verifica dia da semana (0=Dom, 1=Seg, ..., 6=Sab)
        const [year, month, day] = dataStr.split("-").map(Number);
        const dateObj = new Date(year, month - 1, day);
        const dayOfWeek = dateObj.getDay();

        const configSemanal = sala.horarioSemanal || {
            dias: [1, 2, 3, 4, 5],
            inicio: "09:00",
            fim: "18:00"
        };

        if (!configSemanal.dias.includes(dayOfWeek)) {
            return []; // Sala fechada nesse dia da semana
        }

        const [startHour, startMin] = configSemanal.inicio.split(":").map(Number);
        const [endHour, endMin] = configSemanal.fim.split(":").map(Number);
        const startTotalMin = startHour * 60 + startMin;
        const endTotalMin = endHour * 60 + endMin;

        const duration = Number(sala.slotDuration) || 60;
        const slots = [];

        // Agendamentos existentes para essa sala nessa data
        const agendadosNestaData = agendamentosConfirmados.filter(
            (ag) => ag.salaId === sala.id && ag.data === dataStr && ag.status === "confirmado"
        );

        for (let current = startTotalMin; current + duration <= endTotalMin; current += duration) {
            const h1 = String(Math.floor(current / 60)).padStart(2, "0");
            const m1 = String(current % 60).padStart(2, "0");
            const h2 = String(Math.floor((current + duration) / 60)).padStart(2, "0");
            const m2 = String((current + duration) % 60).padStart(2, "0");

            const inicioStr = `${h1}:${m1}`;
            const fimStr = `${h2}:${m2}`;

            // Checar se conflita com algum agendamento existente
            const isOcupado = agendadosNestaData.some((ag) => {
                return ag.horaInicio === inicioStr;
            });

            slots.push({
                horaInicio: inicioStr,
                horaFim: fimStr,
                disponivel: !isOcupado
            });
        }

        return slots;
    },

    /**
     * Gera texto formatado para copiar (WhatsApp / E-mail)
     * Formato:
     * 📍  *SALA 504*
     * • _14:00 às 15:00_: Guilherme Alves Ribeiro
     * • _15:00 às 16:00_: Julio Cerezo (ouvir bolsista)
     */
    generateFormattedMessage(dataStr, agendamentos, salas) {
        if (!dataStr) return "Nenhuma data selecionada.";

        const agendamentosDaData = agendamentos.filter(
            (ag) => ag.data === dataStr && ag.status === "confirmado"
        );

        if (agendamentosDaData.length === 0) {
            return `Nenhum agendamento registrado para a data selecionada.`;
        }

        // Agrupar por Sala
        const porSala = {};
        agendamentosDaData.forEach((ag) => {
            const nomeSala = (ag.salaNome || "SALA").toUpperCase();
            if (!porSala[nomeSala]) porSala[nomeSala] = [];
            porSala[nomeSala].push(ag);
        });

        const blocos = [];

        Object.keys(porSala).sort().forEach((nomeSala) => {
            let blocoSala = `📍  *${nomeSala}*\n`;
            porSala[nomeSala].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

            porSala[nomeSala].forEach((ag) => {
                let linha = `• _${ag.horaInicio} às ${ag.horaFim}_: ${ag.nomeSolicitante}`;
                
                // Instrumento e Vínculo
                const infoExtra = [];
                if (ag.instrumento) infoExtra.push(ag.instrumento);
                if (ag.vinculo) infoExtra.push(ag.vinculo);
                if (infoExtra.length > 0) {
                    linha += ` (${infoExtra.join(" - ")})`;
                }

                // Observações / Necessidades / Partitura em parênteses
                const detalhes = [];
                if (ag.necessidades && ag.necessidades.trim() !== "") {
                    detalhes.push(ag.necessidades.trim());
                }
                if (ag.precisaPartitura && ag.qualPartitura) {
                    detalhes.push(`Partitura: ${ag.qualPartitura.trim()}`);
                }
                
                if (detalhes.length > 0) {
                    linha += `  [${detalhes.join(" • ")}]`;
                }
                
                blocoSala += `${linha}\n`;
            });

            blocos.push(blocoSala.trim());
        });

        return blocos.join("\n\n");
    },

    /**
     * Gera mensagem para WhatsApp com a lista de horários livres por sala
     */
    generateAvailableSlotsMessage(dataStr, salas, agendamentos) {
        if (!dataStr) return "Nenhuma data selecionada.";

        const [y, m, d] = dataStr.split("-");
        const dataFormatada = `${d}/${m}/${y}`;

        // Obter dia da semana por extenso
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        const diasSemanaNomes = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
        const diaSemanaNome = diasSemanaNomes[dateObj.getDay()];

        let header = `🏛️ *HORÁRIOS DISPONÍVEIS P/ ENSAIO - OER*\n`;
        header += `📅 *Data:* ${dataFormatada} (${diaSemanaNome})\n\n`;

        const salasAtivas = (salas || []).filter(s => s.ativa !== false);
        if (salasAtivas.length === 0) {
            return header + `_Nenhuma sala cadastrada no momento._`;
        }

        const blocosSalas = [];

        salasAtivas.forEach(sala => {
            const slots = this.calculateAvailableSlots(sala, dataStr, agendamentos || []);
            const livres = slots.filter(s => s.disponivel);

            const nomeSala = (sala.nome || "SALA").toUpperCase();
            let bloco = `📍  *${nomeSala}*\n`;

            if (livres.length === 0) {
                // Verificar se a sala opera hoje ou se está lotada
                const configSemanal = sala.horarioSemanal || { dias: [1,2,3,4,5] };
                if (!configSemanal.dias.includes(dateObj.getDay())) {
                    bloco += `• _Sala fechada neste dia da semana_\n`;
                } else if (slots.length > 0) {
                    bloco += `• _Todos os horários esgotados para esta data_\n`;
                } else {
                    bloco += `• _Sem horários disponíveis para esta data_\n`;
                }
            } else {
                livres.forEach(slot => {
                    bloco += `• ${slot.horaInicio} às ${slot.horaFim}\n`;
                });
            }

            blocosSalas.push(bloco.trim());
        });

        return header + blocosSalas.join("\n\n");
    },

    /**
     * Gera mensagem padrão individual personalizada para envio no WhatsApp ao clicar no agendamento
     */
    generateSingleAppointmentMessage(ag) {
        if (!ag) return "";

        const primeiroNome = (ag.nomeSolicitante || "Músico").trim().split(/\s+/)[0];

        // Processamento da data
        const [ano, mes, dia] = (ag.data || "").split("-").map(Number);
        const dataAgendamento = new Date(ano, mes - 1, dia);

        const agora = new Date();
        const hojeObj = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        const amanhaObj = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);

        const diasSemanaAbrev = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const diaSemana = diasSemanaAbrev[dataAgendamento.getDay()] || "Dia";

        const diaFormatado = String(dia).padStart(2, "0");
        const mesFormatado = String(mes).padStart(2, "0");
        const dataTexto = `(${diaSemana}, ${diaFormatado}/${mesFormatado})`;

        let textoTemporal;
        if (dataAgendamento.getTime() === hojeObj.getTime()) {
            textoTemporal = `hoje ${dataTexto}`;
        } else if (dataAgendamento.getTime() === amanhaObj.getTime()) {
            textoTemporal = `amanhã ${dataTexto}`;
        } else {
            textoTemporal = `para o dia ${dataTexto}`;
        }

        // Identificação da sala (ex: extrai "sala 504" de "Sala de Ensaio - 504")
        let idSala = "";
        const matchNum = (ag.salaNome || "").match(/\d+/);
        if (matchNum) {
            idSala = `sala ${matchNum[0]}`;
        } else {
            const nomeLimpo = (ag.salaNome || "Ensaio").replace(/^(sala\s*(de\s*ensaio)?\s*[-–:]?\s*)/i, "").trim();
            idSala = `sala ${nomeLimpo || "Ensaio"}`;
        }

        const nomeSalaCompleto = (ag.salaNome || "SALA DE ENSAIO").toUpperCase();

        // Linha do agendamento (horário inicial e final em itálico WhatsApp)
        const horario = (ag.horaInicio && ag.horaFim) 
            ? `${ag.horaInicio} às ${ag.horaFim}` 
            : (ag.horaInicio || "00:00");
        let linha = `• _${horario}_: ${ag.nomeSolicitante || "Músico"}`;
        if (ag.instrumento && ag.instrumento.trim()) {
            linha += `  (${ag.instrumento.trim()})`;
        }

        const detalhes = [];
        if (ag.necessidades && ag.necessidades.trim() !== "") {
            detalhes.push(ag.necessidades.trim());
        }
        if (ag.precisaPartitura && ag.qualPartitura && ag.qualPartitura.trim() !== "") {
            detalhes.push(`Partitura: ${ag.qualPartitura.trim()}`);
        }
        if (detalhes.length > 0) {
            linha += `  [${detalhes.join(" • ")}]`;
        }

        const avisoMontagem = `_Obs.: Antes de acessar a sala que foi agendada informar a equipe da montagem da OER._`;

        return `Olá ${primeiroNome},\n` +
               `Conforme agendado ${textoTemporal} a sala de ensaios (${idSala})\n\n` +
               `📍  *${nomeSalaCompleto}*\n` +
               `${linha}\n\n` +
               `${avisoMontagem}\n\n` +
               `Qualquer dúvida, estou à disposição`;
    },

    /**
     * Obtém a lista de músicos e monitores ativos para o agendamento no Admin
     */
    async getMusicosAtivos() {
        try {
            const snap = await getDocs(collection(db, "musicos"));
            const musicos = [];
            snap.forEach(docSnap => {
                const data = docSnap.data();
                const rawStatus = (data.Status || data.status || data.Cargo || data.cargo || '').toString().toLowerCase().trim();
                
                // Filtros de integridade OER
                if (rawStatus.includes('emm')) return;
                
                const nomeRegLower = (data['NOME REGISTRO'] || '').toString().toLowerCase();
                const nomeArtLower = (data.NOMEARTISTICO || '').toString().toLowerCase();
                if (nomeRegLower.includes('angela de santi') || nomeArtLower.includes('angela de santi')) return;

                // Excluir equipe técnica, administrativa e regentes
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

                // Excluir inativos / desligados / cancelados
                const isDesligado = rawStatus.includes('cancelad') || 
                                    rawStatus.includes('inativ') || 
                                    rawStatus.includes('desligad') || 
                                    data.statusFirebase === 'inativo' || 
                                    data.statusFirebase === 'desligado';
                if (isDesligado) return;

                const tipoContrato = (data['Tipo Contrato Prorrogáveis por igual prazo'] || data['Tipo Contrato'] || '').toString().toLowerCase();
                const isBolsistaOrMonitor = rawStatus.includes("bolsista") || rawStatus.includes("monitor") || rawStatus.includes("spalla") ||
                                            tipoContrato.includes("bolsista") || tipoContrato.includes("monitor") || tipoContrato.includes("spalla");
                if (!isBolsistaOrMonitor) return;

                const nomeArtistico = (data.NOMEARTISTICO || '').toString().trim();
                const nomeCompleto = (data['NOME REGISTRO'] || data.Nome || data.nome || '').toString().trim();
                const nomeExibicao = nomeArtistico || nomeCompleto;
                if (!nomeExibicao) return;

                const isMonitor = rawStatus.includes("monitor") || rawStatus.includes("spalla") ||
                                  tipoContrato.includes("monitor") || tipoContrato.includes("spalla");
                const vinculo = isMonitor ? "Monitor" : "Bolsista";

                const rawInst = (data.INSTRUMENTOS || data.Instrumento || data.instrumento || '').toString().trim();
                const instrumentoMapeado = this.normalizarInstrumentoParaSelect(rawInst);

                musicos.push({
                    id: docSnap.id,
                    nome: nomeExibicao,
                    instrumento: instrumentoMapeado,
                    vinculo: vinculo
                });
            });

            musicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
            return musicos;
        } catch(e) {
            console.error("Erro ao carregar músicos ativos para agendamento:", e);
            return [];
        }
    },

    /**
     * Mapeia qualquer nomenclatura de instrumento cadastrada para as opções do select de agendamento
     */
    normalizarInstrumentoParaSelect(instStr) {
        if (!instStr) return "";
        const s = instStr.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (s.includes("1") || s.includes("primeir") || s.includes("1o") || s.includes("1º") || s.includes("spalla") || s.includes("violino i")) {
            if (s.includes("viol")) return "Primeiros Violinos";
        }
        if (s.includes("2") || s.includes("segund") || s.includes("2o") || s.includes("2º") || s.includes("violino ii")) {
            if (s.includes("viol")) return "Segundos Violinos";
        }
        if (s.includes("viola")) return "Violas";
        if (s.includes("violoncel") || s.includes("cello")) return "Violoncelos";
        if (s.includes("contraba") || s.includes("baixo")) return "Contrabaixos";
        if (s.includes("flaut") || s.includes("piccolo") || s.includes("flautim")) return "Flautas";
        if (s.includes("oboe") || s.includes("corne")) return "Oboés";
        if (s.includes("clari") || s.includes("requinta") || s.includes("clarone")) return "Clarinetes";
        if (s.includes("fagot") || s.includes("contrafagot")) return "Fagotes";
        if (s.includes("trompa")) return "Trompas";
        if (s.includes("trompet") || s.includes("pistao") || s.includes("tromp")) return "Trompetes";
        if (s.includes("trombon")) return "Trombones";
        if (s.includes("tuba") || s.includes("eufonio") || s.includes("bombardino")) return "Tuba";
        if (s.includes("harpa")) return "Harpa";
        if (s.includes("piano") || s.includes("teclado") || s.includes("celesta") || s.includes("cravo")) return "Piano";
        if (s.includes("percuss") || s.includes("timpan") || s.includes("bateria")) return "Percussão";

        if (s.includes("violino")) return "Primeiros Violinos";

        const options = [
            "Primeiros Violinos", "Segundos Violinos", "Violas", "Violoncelos", "Contrabaixos",
            "Flautas", "Oboés", "Clarinetes", "Fagotes", "Trompas", "Trompetes", "Trombones",
            "Tuba", "Harpa", "Piano", "Percussão"
        ];
        const match = options.find(opt => opt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === s);
        return match || "";
    }
};
