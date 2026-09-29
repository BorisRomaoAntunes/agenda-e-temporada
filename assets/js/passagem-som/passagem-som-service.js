/**
 * passagem-som-service.js
 * Serviços em tempo real para o Sistema de Passagem de Som (OER)
 * Integração com Firestore: ciclos, agendamentos e conexão com base de músicos
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
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export const PassagemSomCollections = {
    CICLOS: "passagens_som_ciclos",
    AGENDAMENTOS: "passagens_som_agendamentos",
    MUSICOS: "musicos"
};

// Normalizador de texto para comparação segura
export function normalizarTexto(texto) {
    if (!texto) return "";
    return texto
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

// Extrai os dois primeiros nomes
export function extrairDoisPrimeirosNomes(nomeCompleto) {
    if (!nomeCompleto) return "";
    const partes = nomeCompleto.trim().split(/\s+/);
    if (partes.length <= 2) return partes.join(" ");
    return `${partes[0]} ${partes[1]}`;
}

// Formata data YYYY-MM-DD para DD/MM/AAAA
export function formatarDataBR(dataStr) {
    if (!dataStr) return "-";
    const partes = dataStr.split("-");
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataStr;
}

// Retorna o dia da semana formatado curto (seg., ter., etc.)
export function obterDiaSemanaCurto(dataStr) {
    if (!dataStr) return "";
    const partes = dataStr.split("-");
    if (partes.length !== 3) return "";
    // Construção segura da data local
    const data = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
    const dias = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
    return dias[data.getDay()] || "";
}

export const PassagemSomService = {
    /**
     * Busca a lista de músicos ativos da OER (bolsistas, monitores, titulares)
     * Desconsidera automaticamente registros inativos ou desligados
     */
    async getMusicosAtivos() {
        try {
            const snap = await getDocs(collection(db, PassagemSomCollections.MUSICOS));
            const musicos = [];
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                const status = (data.Status || "").toLowerCase().trim();
                const statusFb = (data.statusFirebase || "").toLowerCase().trim();

                // Ignora EMM, inativos e desligados
                if (status.includes("emm") || status.includes("desligado") || statusFb === "desligado" || statusFb === "inativo") {
                    return;
                }

                const nomeReg = (data["NOME REGISTRO"] || "").trim();
                const nomeArt = (data.NOMEARTISTICO || "").trim();
                const nome = nomeArt || nomeReg || "Sem Nome";
                const instrumento = (data.INSTRUMENTOS || data.Instrumento || data.instrumento || "").trim();

                musicos.push({
                    id: docSnap.id,
                    nome: nome,
                    nomeRegistro: nomeReg,
                    nomeArtistico: nomeArt,
                    instrumento: instrumento,
                    status: data.Status || "Ativo",
                    email: data.EMAIL || ""
                });
            });

            musicos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
            return musicos;
        } catch (e) {
            console.error("Erro ao carregar músicos ativos:", e);
            return [];
        }
    },

    /**
     * Tenta encontrar correspondência automática de um nome digitado na lista de músicos ativos
     */
    encontrarMusicoCorrespondente(nomeDigitado, musicosAtivos) {
        if (!nomeDigitado || !musicosAtivos || musicosAtivos.length === 0) {
            return { musico: null, confianca: "nenhuma" };
        }

        const digitadoNorm = normalizarTexto(nomeDigitado);
        const palavrasDigitadas = digitadoNorm.split(/\s+/).filter(Boolean);

        // 1. Busca exata por Nome Artístico ou Nome de Registro
        for (const m of musicosAtivos) {
            const artNorm = normalizarTexto(m.nomeArtistico);
            const regNorm = normalizarTexto(m.nomeRegistro);

            if ((artNorm && artNorm === digitadoNorm) || (regNorm && regNorm === digitadoNorm)) {
                return { musico: m, confianca: "alta" };
            }
        }

        // 2. Busca onde o nome digitado contém o artístico ou vice-versa (se mais de 1 palavra)
        for (const m of musicosAtivos) {
            const artNorm = normalizarTexto(m.nomeArtistico);
            const regNorm = normalizarTexto(m.nomeRegistro);

            if (artNorm && artNorm.length > 3 && (digitadoNorm.includes(artNorm) || artNorm.includes(digitadoNorm))) {
                return { musico: m, confianca: "alta" };
            }
            if (regNorm && regNorm.length > 3 && (digitadoNorm.includes(regNorm) || regNorm.includes(digitadoNorm))) {
                return { musico: m, confianca: "alta" };
            }
        }

        // 3. Match pelos 2 primeiros nomes
        if (palavrasDigitadas.length >= 2) {
            const doisPrimeiros = `${palavrasDigitadas[0]} ${palavrasDigitadas[1]}`;
            for (const m of musicosAtivos) {
                const doisArt = normalizarTexto(extrairDoisPrimeirosNomes(m.nomeArtistico));
                const doisReg = normalizarTexto(extrairDoisPrimeirosNomes(m.nomeRegistro));
                if (doisArt === doisPrimeiros || doisReg === doisPrimeiros) {
                    return { musico: m, confianca: "media" };
                }
            }
        }

        return { musico: null, confianca: "nenhuma" };
    },

    /**
     * Obtém o ciclo ativo atual em tempo real
     */
    listenCicloAtivo(callback) {
        const q = query(
            collection(db, PassagemSomCollections.CICLOS),
            where("ativo", "==", true)
        );

        return onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const docSnap = snapshot.docs[0];
                callback({ id: docSnap.id, ...docSnap.data() });
            } else {
                callback(null);
            }
        }, (error) => {
            console.error("Erro ao escutar ciclo ativo:", error);
            callback(null);
        });
    },

    /**
     * Escuta todos os ciclos cadastrados
     */
    listenTodosCiclos(callback) {
        const q = query(collection(db, PassagemSomCollections.CICLOS));
        return onSnapshot(q, (snapshot) => {
            const ciclos = [];
            snapshot.forEach((docSnap) => {
                ciclos.push({ id: docSnap.id, ...docSnap.data() });
            });
            ciclos.sort((a, b) => (b.atualizadoEm?.seconds || 0) - (a.atualizadoEm?.seconds || 0));
            callback(ciclos);
        }, (error) => {
            console.error("Erro ao listar ciclos:", error);
            callback([]);
        });
    },

    /**
     * Cria ou atualiza um ciclo no Firestore
     */
    async salvarCiclo(cicloId, cicloData) {
        const docRef = doc(db, PassagemSomCollections.CICLOS, cicloId);
        const dataToSave = {
            ...cicloData,
            atualizadoEm: serverTimestamp()
        };

        if (cicloData.ativo) {
            // Se ativou este ciclo, desativa os outros para manter 1 ativo por padrão
            try {
                const allSnap = await getDocs(collection(db, PassagemSomCollections.CICLOS));
                for (const d of allSnap.docs) {
                    if (d.id !== cicloId && d.data().ativo) {
                        await updateDoc(doc(db, PassagemSomCollections.CICLOS, d.id), { ativo: false });
                    }
                }
            } catch (e) {
                console.warn("Erro ao desativar outros ciclos:", e);
            }
        }

        await setDoc(docRef, dataToSave, { merge: true });
        return cicloId;
    },

    /**
     * Cria o ciclo inicial padrão (Reavaliação 03 - 2026) se ainda não existir nenhum
     */
    async inicializarCicloPadraoSeNecessario() {
        try {
            const snap = await getDocs(collection(db, PassagemSomCollections.CICLOS));
            if (!snap.empty) return; // Já existem ciclos

            const cicloPadraoId = "reavaliacao_03_2026";
            const cicloPadrao = {
                id: cicloPadraoId,
                nome: "Reavaliação 03 - 2026",
                titulo: "Passagem de Som - Reavaliação 03 - 2026",
                ativo: true,
                local: "sala de Ensaio OSM/OER",
                avisoDeclaracao: "preciso da DECLARAÇÃO de ESTUDO enviada para mim até sua SEGUNDA PASSAGEM DE SOM",
                periodo1: {
                    titulo: "1ª Passagem de Som",
                    dias: [
                        {
                            data: "2026-09-08",
                            diaSemana: "Ter",
                            horarios: ["14:00", "14:30", "15:00", "15:30", "16:00"]
                        },
                        {
                            data: "2026-09-09",
                            diaSemana: "Qua",
                            horarios: ["13:30", "14:00", "14:30", "15:00", "15:30", "16:00"]
                        },
                        {
                            data: "2026-09-10",
                            diaSemana: "Qui",
                            horarios: ["13:30", "14:00", "14:30", "15:00", "15:30", "16:00"]
                        }
                    ]
                },
                periodo2: {
                    titulo: "2ª Passagem de Som",
                    dias: [
                        {
                            data: "2026-09-14",
                            diaSemana: "Seg",
                            horarios: ["13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]
                        },
                        {
                            data: "2026-09-16",
                            diaSemana: "Qua",
                            horarios: ["15:00", "15:30", "16:00"]
                        },
                        {
                            data: "2026-09-17",
                            diaSemana: "Qui",
                            horarios: ["15:00", "15:30", "16:00"]
                        },
                        {
                            data: "2026-09-18",
                            diaSemana: "Sex",
                            horarios: ["17:30", "18:00", "18:30", "19:00"]
                        }
                    ]
                },
                criadoEm: serverTimestamp(),
                atualizadoEm: serverTimestamp()
            };

            await setDoc(doc(db, PassagemSomCollections.CICLOS, cicloPadraoId), cicloPadrao);
            console.log("Ciclo padrão inicializado:", cicloPadraoId);
        } catch (e) {
            console.warn("Aviso ao inicializar ciclo padrão:", e);
        }
    },

    /**
     * Escuta todos os agendamentos de um ciclo específico em tempo real
     */
    listenAgendamentos(cicloId, callback) {
        if (!cicloId) {
            callback([]);
            return () => {};
        }

        const q = query(
            collection(db, PassagemSomCollections.AGENDAMENTOS),
            where("cicloId", "==", cicloId)
        );

        return onSnapshot(q, (snapshot) => {
            const agendamentos = [];
            snapshot.forEach((docSnap) => {
                agendamentos.push({ id: docSnap.id, ...docSnap.data() });
            });
            callback(agendamentos);
        }, (error) => {
            console.error("Erro ao escutar agendamentos:", error);
            callback([]);
        });
    },

    /**
     * Realiza um novo agendamento com validação de concorrência e associação com base de músicos
     */
    async agendarPassagem({ cicloId, nome, instrumento, repertorio, p1, p2, musicosAtivos }) {
        if (!cicloId || !nome || !instrumento || !repertorio || !p1 || !p2) {
            throw new Error("Todos os campos obrigatórios devem ser preenchidos.");
        }

        // Tenta matching automático de músico
        const match = this.encontrarMusicoCorrespondente(nome, musicosAtivos || []);
        let musicoId = null;
        let musicoNomeOficial = null;
        let statusVinculo = "pendente_validacao";

        if (match.musico) {
            musicoId = match.musico.id;
            musicoNomeOficial = match.musico.nome;
            statusVinculo = "vinculado";
        }

        const slotKeyP1 = `p1_${p1.data}_${p1.horario}`;
        const slotKeyP2 = `p2_${p2.data}_${p2.horario}`;

        // Executa em transação para garantir que dois músicos não peguem o mesmo horário ao mesmo tempo
        const agendamentosRef = collection(db, PassagemSomCollections.AGENDAMENTOS);

        // Checagem prévia de disponibilidade
        const checkQ1 = query(
            agendamentosRef,
            where("cicloId", "==", cicloId),
            where("primeiraPassagem.slotKey", "==", slotKeyP1)
        );
        const checkQ2 = query(
            agendamentosRef,
            where("cicloId", "==", cicloId),
            where("segundaPassagem.slotKey", "==", slotKeyP2)
        );

        const [snap1, snap2] = await Promise.all([getDocs(checkQ1), getDocs(checkQ2)]);

        if (!snap1.empty) {
            throw new Error(`O horário ${p1.horario} do dia ${formatarDataBR(p1.data)} na 1ª passagem acabou de ser reservado por outro músico. Por favor, escolha outro.`);
        }
        if (!snap2.empty) {
            throw new Error(`O horário ${p2.horario} do dia ${formatarDataBR(p2.data)} na 2ª passagem acabou de ser reservado por outro músico. Por favor, escolha outro.`);
        }

        const novoDoc = {
            cicloId,
            nomeDigitado: nome.trim(),
            instrumento: instrumento.trim(),
            repertorio: repertorio.trim(),
            primeiraPassagem: {
                data: p1.data,
                horario: p1.horario,
                slotKey: slotKeyP1,
                status: "agendado"
            },
            segundaPassagem: {
                data: p2.data,
                horario: p2.horario,
                slotKey: slotKeyP2,
                status: "agendado"
            },
            musicoId,
            musicoNomeOficial,
            statusVinculo,
            confiancaMatch: match.confianca,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        };

        const docRef = await addDoc(agendamentosRef, novoDoc);
        return { id: docRef.id, ...novoDoc };
    },

    /**
     * Valida manualmente o vínculo de um agendamento com um músico da base
     */
    async validarVinculoMusico(agendamentoId, musicoId, musicoNomeOficial) {
        const docRef = doc(db, PassagemSomCollections.AGENDAMENTOS, agendamentoId);
        await updateDoc(docRef, {
            musicoId: musicoId || null,
            musicoNomeOficial: musicoNomeOficial || null,
            statusVinculo: musicoId ? "vinculado" : "desvinculado",
            atualizadoEm: serverTimestamp()
        });
    },

    /**
     * Atualiza dados de um agendamento (horários, repertório, músico)
     */
    async atualizarAgendamento(agendamentoId, updates) {
        const docRef = doc(db, PassagemSomCollections.AGENDAMENTOS, agendamentoId);
        await updateDoc(docRef, {
            ...updates,
            atualizadoEm: serverTimestamp()
        });
    },

    /**
     * Cancela/Exclui um agendamento liberando os slots
     */
    async cancelarAgendamento(agendamentoId) {
        const docRef = doc(db, PassagemSomCollections.AGENDAMENTOS, agendamentoId);
        await deleteDoc(docRef);
    },

    /**
     * Busca o agendamento de um músico específico em um ciclo (usado na gaveta do admin.html)
     */
    async getAgendamentoDoMusico(musicoId, nomeMusico, cicloId) {
        try {
            const agendamentosRef = collection(db, PassagemSomCollections.AGENDAMENTOS);
            
            // 1. Busca direta por musicoId se fornecido
            if (musicoId) {
                let q = query(
                    agendamentosRef,
                    where("musicoId", "==", musicoId)
                );
                if (cicloId) {
                    q = query(agendamentosRef, where("musicoId", "==", musicoId), where("cicloId", "==", cicloId));
                }
                const snap = await getDocs(q);
                if (!snap.empty) {
                    return { id: snap.docs[0].id, ...snap.docs[0].data() };
                }
            }

            // 2. Fallback: busca pelo nome aproximado
            if (nomeMusico) {
                const normTarget = normalizarTexto(nomeMusico);
                let q = collection(db, PassagemSomCollections.AGENDAMENTOS);
                if (cicloId) {
                    q = query(q, where("cicloId", "==", cicloId));
                }
                const snap = await getDocs(q);
                for (const docSnap of snap.docs) {
                    const data = docSnap.data();
                    const nDig = normalizarTexto(data.nomeDigitado);
                    const nOfic = normalizarTexto(data.musicoNomeOficial);
                    if (nDig === normTarget || nOfic === normTarget || (nDig && normTarget.includes(nDig)) || (normTarget && nDig.includes(normTarget))) {
                        return { id: docSnap.id, ...data };
                    }
                }
            }

            return null;
        } catch (e) {
            console.warn("Erro ao buscar agendamento do músico:", e);
            return null;
        }
    }
};
