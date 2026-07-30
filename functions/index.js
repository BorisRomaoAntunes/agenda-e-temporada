const { onDocumentCreated, onDocumentDeleted, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const functions = require("firebase-functions");
const { FieldValue } = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const { PDFDocument } = require("pdf-lib");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Secret Manager: chave da API Gemini (configurar com: firebase functions:secrets:set GEMINI_API_KEY)
const geminiApiKey = defineSecret("GEMINI_API_KEY");

admin.initializeApp();

exports.sendPushNotification = onDocumentCreated({
    document: "adminNotifications/{notificationId}",
    secrets: [geminiApiKey]
}, async (event) => {
    const data = event.data.data();
    if (!data) return;

    const { title, message } = data;

    console.log(`Disparando notificação: ${title}`);
 
    // Verificar se as notificações globais estão habilitadas no Firestore
    let notifEnabled = true;
    try {
        const settingsSnap = await admin.firestore().collection("config").doc("settings").get();
        if (settingsSnap.exists) {
            const settings = settingsSnap.data();
            if (settings && settings.notificationsEnabled !== undefined) {
                notifEnabled = settings.notificationsEnabled === true;
            }
        }
    } catch (settingsError) {
        console.error("Erro ao ler config/settings. Usando fallback default (true):", settingsError);
    }

    if (notifEnabled) {
        // Buscar todos os tokens registrados na coleção fcmTokens
        const tokensSnapshot = await admin.firestore().collection("fcmTokens").get();
        
        const tokens = [];
        tokensSnapshot.forEach((doc) => {
            const tokenData = doc.data();
            // Evita erro se o campo token não existir no documento
            if (tokenData && tokenData.token) {
                tokens.push(tokenData.token);
            }
        });

        if (tokens.length === 0) {
            console.log("Nenhum token encontrado na coleção fcmTokens. Abortando envio.");
        } else {
            console.log(`Enviando para ${tokens.length} dispositivos...`);

            // Define o link correto com a tag de engajamento
            const targetLink = data.linkUrl 
                ? `${data.linkUrl}${data.linkUrl.includes('?') ? '&' : '?'}source=notification`
                : "https://oer-agenda.web.app/?source=notification";

            const payload = {
                notification: {
                    title: title || "Novo aviso",
                    body: message || "",
                    image: data.imageUrl || undefined,
                },
                data: data.linkUrl ? { linkUrl: data.linkUrl } : {},
                webpush: {
                    notification: {
                        title: title || "Novo aviso",
                        body: message || "",
                        icon: "https://oer-agenda.web.app/assets/img/favicon-final.png",
                        badge: "https://oer-agenda.web.app/assets/img/favicon-final.png",
                        image: data.imageUrl || undefined,
                    },
                    fcmOptions: {
                        link: targetLink
                    }
                },
                tokens: tokens,
            };

            try {
                const response = await admin.messaging().sendEachForMulticast(payload);
                console.log(`${response.successCount} mensagens enviadas com sucesso, ${response.failureCount} falharam.`);
                
                // Limpar tokens antigos/revogados (opcional, mas recomendado)
                if (response.failureCount > 0) {
                    const failedTokens = [];
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            // Erros comuns: messaging/invalid-registration-token ou messaging/registration-token-not-registered
                            if (resp.error.code === 'messaging/invalid-registration-token' ||
                                resp.error.code === 'messaging/registration-token-not-registered') {
                                failedTokens.push(tokens[idx]);
                            }
                        }
                    });

                    // Apaga os tokens inválidos do Firestore usando um batch (operação em lote)
                    if (failedTokens.length > 0) {
                        const batch = admin.firestore().batch();
                        failedTokens.forEach(badToken => {
                            // O ID do documento é o próprio token
                            const docRef = admin.firestore().collection("fcmTokens").doc(badToken);
                            batch.delete(docRef);
                        });
                        await batch.commit();
                        console.log(`Apagados ${failedTokens.length} tokens inválidos do banco de dados.`);
                    }
                }
            } catch (error) {
                console.error("Erro crítico ao enviar mensagens multicast:", error);
            }
        }
    } else {
        console.log("Notificações globais desativadas pelo painel admin (config/settings). O disparo real de push FCM foi pulado.");
    }

    // Processamento assíncrono de OCR para extração de texto de imagem (se houver)
    if (data.imageUrl) {
        let storagePath = data.imageStoragePath || null;
        if (!storagePath) {
            // Tenta decodificar o caminho da imagem a partir da URL do Firebase Storage
            const match = data.imageUrl.match(/\/o\/([^?#]+)/);
            if (match) {
                storagePath = decodeURIComponent(match[1]);
            }
        }

        if (storagePath) {
            try {
                console.log(`[OCR] Iniciando processamento de imagem para OCR: ${storagePath}`);
                const bucket = admin.storage().bucket();
                const file = bucket.file(storagePath);
                
                const [exists] = await file.exists();
                if (exists) {
                    const [fileBuffer] = await file.download();
                    
                    let mimeType = "image/jpeg";
                    if (storagePath.toLowerCase().endsWith(".png")) mimeType = "image/png";
                    else if (storagePath.toLowerCase().endsWith(".webp")) mimeType = "image/webp";
                    else if (storagePath.toLowerCase().endsWith(".gif")) mimeType = "image/gif";
                    
                    const apiKey = process.env.GEMINI_API_KEY || admin.remoteConfig().parameters?.GEMINI_API_KEY?.defaultValue?.value;
                    if (apiKey) {
                        const ai = new GoogleGenAI({ apiKey });
                        const prompt = "Você é um assistente de OCR de alta precisão. Analise esta imagem e extraia todo o texto que nela estiver escrito. Retorne APENAS o texto literal extraído da imagem, sem comentários adicionais, sem markdown e sem preâmbulos.";
                        
                        const response = await ai.models.generateContent({
                            model: "gemini-2.5-flash",
                            contents: [
                                {
                                    role: "user",
                                    parts: [
                                        { text: prompt },
                                        {
                                            inlineData: {
                                                data: fileBuffer.toString("base64"),
                                                mimeType: mimeType
                                            }
                                        }
                                    ]
                                }
                            ]
                        });
                        
                        const resultText = (typeof response.text === "function") ? response.text() : (response.text || "");
                        const extractedText = resultText.trim();
                        console.log(`[OCR] Texto extraído (${extractedText.length} caracteres): ${extractedText.substring(0, 100)}...`);
                        
                        if (extractedText) {
                            const db = admin.firestore();
                            const notifId = event.params.notificationId;
                            
                            // 1. Atualizar o documento da própria notificação na coleção adminNotifications
                            await db.collection("adminNotifications").doc(notifId).update({
                                ocrText: extractedText
                            });
                            console.log(`[OCR] Documento adminNotifications/${notifId} atualizado.`);
                            
                            // 2. Atualizar o log correspondente em adminLogs
                            const logsSnapshot = await db.collection("adminLogs")
                                .where("imageUrl", "==", data.imageUrl)
                                .limit(1)
                                .get();
                                
                            if (!logsSnapshot.empty) {
                                const logDoc = logsSnapshot.docs[0];
                                await logDoc.ref.update({
                                    imageOcrText: extractedText
                                });
                                console.log(`[OCR] Documento adminLogs/${logDoc.id} atualizado.`);
                            } else {
                                console.log(`[OCR] Nenhum log correspondente encontrado para imageUrl: ${data.imageUrl}`);
                            }
                            
                            // 3. Atualizar config/latestNotice se for o aviso atual
                            const latestNoticeRef = db.collection("config").doc("latestNotice");
                            const latestNoticeSnap = await latestNoticeRef.get();
                            if (latestNoticeSnap.exists && latestNoticeSnap.data().imageUrl === data.imageUrl) {
                                await latestNoticeRef.update({
                                    ocrText: extractedText
                                });
                                console.log("[OCR] config/latestNotice atualizado.");
                            }
                        }
                    } else {
                        console.warn("[OCR] GEMINI_API_KEY não configurada. Abortando OCR.");
                    }
                } else {
                    console.warn(`[OCR] Arquivo de imagem não encontrado no Storage: ${storagePath}`);
                }
            } catch (ocrError) {
                console.error("[OCR] Erro crítico ao processar imagem de notificação:", ocrError);
            }
        }
    }
});

/**
 * Mantém o contador de inscritos atualizado no documento config/stats
 */
exports.incrementSubscriberCount = onDocumentCreated("fcmTokens/{tokenId}", async (event) => {
    const statsRef = admin.firestore().collection("config").doc("stats");
    try {
        await statsRef.set({
            subscriberCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log("Contador de inscritos incrementado (+1)");
    } catch (error) {
        console.error("Erro ao incrementar contador:", error);
    }
});

exports.decrementSubscriberCount = onDocumentDeleted("fcmTokens/{tokenId}", async (event) => {
    const statsRef = admin.firestore().collection("config").doc("stats");
    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const statsSnap = await transaction.get(statsRef);
            if (statsSnap.exists()) {
                const currentCount = statsSnap.data().subscriberCount || 0;
                // Garante que o contador nunca seja menor que zero
                const newCount = Math.max(0, currentCount - 1);
                transaction.update(statsRef, { 
                    subscriberCount: newCount,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        });
        console.log("Contador de inscritos decrementado com proteção contra valores negativos.");
    } catch (error) {
        console.error("Erro ao decrementar contador:", error);
    }
});
/**
 * Verifica diariamente às 6h da manhã se houve alteração no número de inscritos.
 * Se houver alteração (aumento ou queda), registra no log do sistema.
 */
exports.dailySubscriberCheck = onSchedule({
    schedule: "0 6 * * *",
    timeZone: "America/Sao_Paulo",
    memory: "256MiB"
}, async (event) => {
    const statsRef = admin.firestore().collection("config").doc("stats");
    const dailyStatsRef = admin.firestore().collection("config").doc("dailyStats");
    const logsRef = admin.firestore().collection("adminLogs");
    const fcmTokensRef = admin.firestore().collection("fcmTokens");

    try {
        // Verificar se as notificações globais estão habilitadas no Firestore
        let notifEnabled = true;
        const settingsSnap = await admin.firestore().collection("config").doc("settings").get();
        if (settingsSnap.exists) {
            const settings = settingsSnap.data();
            if (settings && settings.notificationsEnabled !== undefined) {
                notifEnabled = settings.notificationsEnabled === true;
            }
        }

        if (!notifEnabled) {
            console.log("Robô OER: Notificações globais desativadas em config/settings. A verificação diária de assinantes foi ignorada.");
            return;
        }

        // 1. Faz a contagem real de documentos na coleção de tokens
        const countSnap = await fcmTokensRef.count().get();
        const actualTokenCount = countSnap.data().count;

        await admin.firestore().runTransaction(async (transaction) => {
            const statsSnap = await transaction.get(statsRef);
            const dailySnap = await transaction.get(dailyStatsRef);

            const storedCount = statsSnap.exists ? (statsSnap.data().subscriberCount || 0) : 0;
            const previousCount = dailySnap.exists ? (dailySnap.data().lastCount || 0) : 0;

            // 2. Auto-Cura: Se o contador armazenado estiver errado, prioriza a realidade
            let currentCount = storedCount;
            if (actualTokenCount !== storedCount) {
                console.warn(`[Auto-Cura] Divergência detectada! Real: ${actualTokenCount}, Armazenado: ${storedCount}. Corrigindo...`);
                currentCount = actualTokenCount;
                transaction.set(statsRef, {
                    subscriberCount: currentCount,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                // Log de auditoria da correção
                transaction.set(logsRef.doc(), {
                    type: "sistema",
                    message: "Robô OER: Auto-Cura realizada com sucesso.",
                    details: `O Robô OER detectou e corrigiu uma divergência de sincronização no contador de assinantes (armazenado: ${storedCount}, real no banco: ${actualTokenCount}). O número exibido no painel administrativo foi atualizado e calibrado para refletir com exatidão a realidade.`,
                    user: "Sistema",
                    createdAt: new Date().toISOString()
                });
            }

            // 3. Log de tendência e verificação (Robô OER)
            if (currentCount !== previousCount) {
                const diff = currentCount - previousCount;
                const trend = diff > 0 ? "aumento" : "queda";
                
                const logMessage = "Robô OER: Verificação de assinaturas concluída (Alteração detectada).";
                const logDetails = `O Robô OER realizou a verificação diária e identificou novos inscritos ou cancelamentos de assinaturas (músicos que pararam de assinar). Total atual: ${currentCount} músicos. Houve uma ${trend} no número de inscritos (Variação de ${diff > 0 ? "+" : ""}${diff} desde ontem). O contador do painel foi sincronizado.`;

                transaction.set(logsRef.doc(), {
                    type: "bot",
                    message: logMessage,
                    details: logDetails,
                    user: "Robô OER",
                    createdAt: new Date().toISOString()
                });
                console.log(`Log do robô registrado: ${currentCount} inscritos (${diff > 0 ? "+" : ""}${diff})`);
            } else {
                // Registrar log mesmo quando não há alterações
                const logMessage = "Robô OER: Verificação de assinaturas concluída (Sem alterações).";
                const logDetails = `O Robô OER verificou se houve novos inscritos ou cancelamentos (músicos que pararam de assinar). Nenhuma alteração foi detectada nas últimas 24 horas. Total de assinantes ativo e sincronizado: ${currentCount} músicos.`;

                transaction.set(logsRef.doc(), {
                    type: "bot",
                    message: logMessage,
                    details: logDetails,
                    user: "Robô OER",
                    createdAt: new Date().toISOString()
                });
                console.log(`Nenhuma alteração real no número de inscritos (${currentCount}). Log de rotina registrado.`);
            }

            // 4. Atualiza o backup diário para comparação amanhã
            transaction.set(dailyStatsRef, {
                lastCount: currentCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
    } catch (error) {
        console.error("Erro na verificação diária do robô:", error);
    }
});

/**
 * Gera uma sugestão de título e corpo para notificação push usando IA (Robô OER Inteligente).
 */
exports.suggestNotificationText = onCall({
    region: "us-central1",
    maxInstances: 10,
    memory: "512MiB",
    secrets: [geminiApiKey]
}, async (request) => {
    // Verificar autenticação (apenas admins podem chamar)
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "O usuário precisa estar autenticado.");
    }

    const { userPrompt, includeContext, selectedContexts, image, type, version, linkUrl } = request.data;
    const apiKey = process.env.GEMINI_API_KEY || admin.remoteConfig().parameters?.GEMINI_API_KEY?.defaultValue?.value;
    
    if (!apiKey) {
        console.warn("GEMINI_API_KEY não configurada. Usando fallback estático.");
        return {
            title: `🎼 Novo aviso OER`,
            message: `Olá naipe! Temos uma nova atualização de partituras e cronogramas. Confira os detalhes! 🎻`
        };
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        let logsText = "";
        let eventosText = "";

        if (includeContext) {
            if (Array.isArray(selectedContexts)) {
                // Se foi enviada uma lista específica filtrada pelo administrador
                if (selectedContexts.length > 0) {
                    logsText = "CONTEXTO DO SISTEMA SELECIONADO PELO ADMINISTRADOR:\n" + 
                        selectedContexts.map(ctx => `- ${ctx}`).join("\n") + "\n";
                }
            } else {
                // Fallback legado: busca tudo diretamente do banco
                // 1. Obter últimos 5 logs do painel
                try {
                    const logsSnap = await admin.firestore().collection("adminLogs")
                        .orderBy("createdAt", "desc")
                        .limit(5)
                        .get();

                    if (!logsSnap.empty) {
                        logsText = "ÚLTIMOS LOGS DE ATIVIDADE DO SISTEMA:\n";
                        logsSnap.forEach(doc => {
                            const data = doc.data();
                            const time = data.createdAt ? (typeof data.createdAt.toDate === "function" ? data.createdAt.toDate().toISOString() : data.createdAt) : "N/A";
                            logsText += `- [${time}] [${data.type || "info"}] ${data.message || ""}: ${data.details || ""}\n`;
                        });
                    }
                } catch (err) {
                    console.error("Erro ao buscar logs para contexto:", err);
                }

                // 2. Obter próximos 5 eventos do calendário a partir de hoje
                try {
                    // Formato YYYY-MM-DD em São Paulo
                    const todayStr = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
                    const eventosSnap = await admin.firestore().collection("eventos")
                        .where("date", ">=", todayStr)
                        .orderBy("date", "asc")
                        .limit(5)
                        .get();

                    if (!eventosSnap.empty) {
                        eventosText = "PRÓXIMOS COMPROMISSOS DA ORQUESTRA:\n";
                        eventosSnap.forEach(doc => {
                            const data = doc.data();
                            const repertorioStr = Array.isArray(data.repertorio) ? data.repertorio.join(", ") : (data.repertorio || "N/A");
                            const avisosStr = Array.isArray(data.avisos) ? data.avisos.join("; ") : (data.avisos || "N/A");
                            eventosText += `- Dia: ${data.date} | Tipo: ${data.tipo || "N/A"} | Naipe: ${data.naipe || "Todos"} | Início: ${data.horarioInicio || "N/A"} | Local: ${data.local || "N/A"} | Repertório: ${repertorioStr} | Avisos: ${avisosStr}\n`;
                        });
                    }
                } catch (err) {
                    console.error("Erro ao buscar eventos para contexto:", err);
                }
            }
        }

        const contents = [];

        // Adicionar imagem no formato suportado pela API caso presente
        if (image && image.inlineData && image.inlineData.data && image.inlineData.mimeType) {
            contents.push({
                inlineData: {
                    mimeType: image.inlineData.mimeType,
                    data: image.inlineData.data
                }
            });
        }

        // Construir instrução textual
        let promptText = `Você é o Robô OER, o assistente oficial e entusiasta da Orquestra Experimental de Repertório.
Sua missão é avisar os músicos sobre atualizações nas partituras, cronogramas, avisos importantes e eventos com muita energia e precisão.

Abaixo estão as informações disponíveis para você criar a sugestão de notificação push:

`;

        if (userPrompt) {
            promptText += `INSTRUÇÃO ESPECÍFICA DO ADMINISTRADOR:
"${userPrompt}"

`;
        }

        if (type && version) {
            promptText += `ATUALIZAÇÃO DE SISTEMA:
- Item atualizado: ${type}
- Nova versão: ${version}

`;
        }

        if (logsText) {
            promptText += logsText + "\n";
        }

        if (eventosText) {
            promptText += eventosText + "\n";
        }

        if (linkUrl) {
            promptText += `LINK ANEXADO AO AVISO:
- URL: ${linkUrl}
(Mencione ou oriente os músicos a clicarem no link anexo para conferir as informações, de forma elegante e natural se relevante).

`;
        }

        if (image && image.inlineData) {
            promptText += `ANÁLISE DE IMAGEM:
Foi feito o upload de uma imagem (comunicado, cartaz, grade ou foto de partitura). Analise visualmente a imagem anexada para identificar detalhes importantes (como data, horário, local, repertório, instruções específicas ou naipes afetados) e use esses detalhes para elaborar o aviso.

`;
        }

        promptText += `DIRETRIZES DE ESTILE E TOM:
1. Tom: Vibrante, inspirador e profissional. Você ama a OER e quer manter os músicos informados e entusiasmados!
2. Referências Musicais: Sempre incorpore referências musicais sutis e elegantes no texto (ex: "afinando", "em harmonia", "nova partitura na estante", "em ritmo de ensaio", "compasso").
3. Emojis: Sempre utilize emojis de forma chamativa, especialmente emojis musicais (ex: 🎼, 🎻, 🎺, 🥁, 🎹), limitando a no máximo 2 ou 3 para manter o estilo profissional de notificação do sistema.
4. Clareza e Tamanho: A mensagem final deve ser extremamente curta, clara e direta (ideal para leitura imediata em notificações push de celular).
   - TÍTULO: Máximo de 50 caracteres.
   - CORPO/MENSAGEM: Máximo de 150 caracteres.

REGRAS TÉCNICAS DE RETORNO:
- Retorne APENAS um objeto JSON válido, sem qualquer tipo de formatação markdown (como \`\`\`json ou \`\`\`) e sem nenhum texto de introdução ou conclusão.
- O formato deve ser exatamente: {"title": "Título aqui", "message": "Corpo da mensagem aqui"}`;

        contents.push({ text: promptText });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents
        });

        const resultText = response.text || "";
        console.log("Resposta do Robô OER:", resultText);

        // Limpar possíveis marcações de markdown e extrair o objeto JSON
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        throw new Error("A IA não retornou um JSON válido.");

    } catch (error) {
        console.error("Erro ao gerar sugestão com IA (usando fallback):", error);
        return {
            title: `🎼 Novo aviso: Robô OER`,
            message: `Músicos, fiquem atentos à estante! Novas atualizações de ensaio e partituras disponíveis. 🎻`
        };
    }
});

/**
 * Gera o relatório formatado de Ficha Técnica de Orquestra usando IA (Gemini 2.5 Flash).
 */
exports.generateFichaTecnica = onCall({
    region: "us-central1",
    maxInstances: 10,
    memory: "512MiB",
    secrets: [geminiApiKey]
}, async (request) => {
    // Verificar autenticação (apenas admins podem chamar)
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "O usuário precisa estar autenticado.");
    }

    const { musiciansTextList } = request.data;
    const apiKey = process.env.GEMINI_API_KEY || admin.remoteConfig().parameters?.GEMINI_API_KEY?.defaultValue?.value;
    
    if (!apiKey) {
        console.warn("GEMINI_API_KEY não configurada. Falha no processamento por IA.");
        throw new HttpsError("failed-precondition", "GEMINI_API_KEY não configurada.");
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        const prompt = `Você é um assistente especializado em formatação de Ficha Técnica de Orquestra e Grupos Musicais. Ao receber uma lista de músicos, regentes e equipe técnica, siga rigorosamente as seguintes instruções para gerar a saída final:

🔹 ESTRUTURA GERAL E LAYOUT
- Transforme toda a lista em um único parágrafo contínuo (uma única linha).
- Não utilize quebras de linha em nenhum momento do corpo principal dos músicos/equipe.
- Use formatação rica (Markdown normal do sistema, sem ser bloco de código monoespaçado).
- O texto final deve estar 100% linear, visualmente limpo e pronto para copiar e colar.
- Não inclua explicações, introduções ou conclusões. Forneça apenas o resultado final.

🔹 ORDEM DOS ELEMENTOS
1º: Regentes (no início de tudo).
2º: Naipes/Instrumentos com seus respectivos músicos.
3º: Equipe Técnica (Coordenador Artístico, Inspetor, Produtor de Palco, Montadores, etc.).
4º: Texto de legenda ao final de tudo.

🔹 PONTUAÇÃO E CONEXÕES
- Cada regente, naipe de instrumento ou cargo técnico deve ser separado por ponto final (.).
- Os nomes de músicos/equipe dentro de um mesmo naipe ou cargo devem ser separados por vírgula (,).
- Antes do último nome de cada grupo de naipe ou cargo, use "e" (Exemplo: Nome1, Nome2 e Nome3.).
- O último nome de cada grupo deve terminar com ponto final (.).

🔹 FORMATAÇÃO DOS GRUPOS E CARGOS
- Regentes: Começam com o cargo sem negrito e terminam com ponto final (Exemplo: Regente Titular Nome. Regente Assistente Nome.). Não levam asterisco.
- Naipes de Instrumentos: O nome do instrumento/naipe deve vir obrigatoriamente em negrito (Exemplo: **Trompas**).
- Equipe Técnica (ao final): 
  * Os cargos "Coordenador Artístico", "Inspetor" e "Produtor de Palco" devem vir em negrito (Exemplo: **Inspetor** Nome. **Produtor de Palco** Nome.). Não levam asterisco.
  * O cargo "Montadores" e outros cargos finais não especificados vêm sem negrito (Exemplo: Montadores Nome e Nome.). Não levam asterisco.

🔹 REGRAS ESPECÍFICAS DE HIERARQUIA (SPALLA E MONITOR)
- Spalla: O primeiro nome do naipe de "Primeiros Violinos" é sempre o Spalla. Ele deve receber negrito duplo manual no início do nome e um asterisco ao final (Exemplo: **Primeiros Violinos** **Nome*, Nome2, Nome3.).
- Monitores: O primeiro nome de TODOS os outros naipes de instrumentos (exceto Primeiros Violinos) é o Monitor. Ele deve receber um asterisco ao final do nome (Exemplo: **Trompas** Nome*, Nome2, Nome3.).

🔹 TEXTO DE LEGENDA OBRIGATÓRIO (AO FIM DA LISTA)
- Após o último nome da equipe técnica e do ponto final, insira exatamente o seguinte trecho de texto como legenda (incluindo as quebras de linha para separar a legenda):
*monitor
**Spalla

🔹 LIMPEZA E PADRONIZAÇÃO DA LISTA
- Remova/ignore completamente Angela De Santi Pernambuco (ou qualquer menção a ela como Coordenadora Artística). Ela não deve fazer parte da ficha técnica.
- Ignore completamente linhas indicando observações originais como "*Nomes Artísticos" ou linhas em branco.
- Remova duplicações e mantenha apenas os nomes válidos.
- Mantenha os nomes dos naipes exatamente como fornecidos.
- Não altere a ordem dos músicos dentro de cada grupo, não adicione e não remova nomes.
- Corrija apenas espaços desnecessários, mantendo a grafia original dos nomes.

Aqui está a lista bruta de regentes, músicos por naipes e equipe técnica para você formatar e linearizar:

${musiciansTextList}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });

        const resultText = response.text || "";
        return { text: resultText.trim() };

    } catch (error) {
        console.error("Erro na geração da Ficha Técnica via Gemini:", error);
        throw new HttpsError("internal", error.message || "Erro interno no processamento por IA.");
    }
});

/**
 * [BASE] Handler de Notificações Agendadas
 * Roda a cada minuto e verifica scheduledNotifications com status='pending'.
 */
exports.scheduledNotificationHandler = onSchedule({
    schedule: "* * * * *",
    timeZone: "America/Sao_Paulo",
    memory: "256MiB"
}, async (event) => {
    const now = new Date();
    const db  = admin.firestore();

    const snap = await db.collection("scheduledNotifications")
        .where("status", "==", "pending")
        .get();

    if (snap.empty) {
        return; 
    }

    console.log(`[Agendamento] Verificando ${snap.size} notificações pendentes...`);

    const dueDocs = snap.docs.filter(d => {
        const scheduledDate = new Date(d.data().scheduledAt);
        const isDue = scheduledDate <= now;
        if (!isDue) {
            console.log(`- Notificação "${d.data().title}" ainda não venceu (Agendado: ${d.data().scheduledAt}, Agora: ${now.toISOString()})`);
        }
        return isDue;
    });

    if (dueDocs.length === 0) { return; }

    console.log(`[Agendamento] Processando ${dueDocs.length} notificações vencidas.`);

    for (const docSnap of dueDocs) {
        const data = docSnap.data();
        await docSnap.ref.update({ status: "processing" });
        try {
            // Adiciona ao histórico de avisos do site e atualiza o letreiro.
            // Isto disparará automaticamente a Cloud Function sendPushNotification.
            const notifData = {
                title: data.title || "Novo aviso",
                message: data.message || "",
                createdAt: now.toISOString(),
                sentBy: data.createdBy || 'agendamento',
                ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
                ...(data.linkUrl ? { linkUrl: data.linkUrl } : {})
            };
            await db.collection("adminNotifications").add(notifData);
            await db.collection("config").doc("latestNotice").set(notifData);
            await db.collection("adminLogs").add({
                type: "aviso",
                message: "Aviso agendado enviado: " + data.title,
                details: "Agendado para " + data.scheduledAt + ". Disparado via histórico de avisos para todos os músicos ativos.",
                user: data.createdBy || "agendamento",
                ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
                ...(data.linkUrl ? { link: data.linkUrl } : {}),
                createdAt: now.toISOString()
            });

            await docSnap.ref.update({ status: "sent", sentAt: now.toISOString() });
        } catch (err) {
            console.error("Erro ao processar notificacao agendada:", err);
            await docSnap.ref.update({ status: "error", errorMsg: String(err) });
        }
    }
});

/**
 * [BASE] Callable: Cria uma notificacao agendada via Admin.
 */
exports.scheduleNotification = onCall({
    region: "us-central1",
    maxInstances: 5,
    memory: "256MiB"
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Autenticacao obrigatoria.");
    }
    const { title, message, imageUrl, linkUrl, scheduledAt } = request.data;
    if (!title || !scheduledAt) {
        throw new HttpsError("invalid-argument", "Os campos title e scheduledAt sao obrigatorios.");
    }
    const scheduled = new Date(scheduledAt);
    // Margem de 1 minuto para evitar erros por pequenos atrasos de rede/relógio
    const oneMinuteAgo = new Date(Date.now() - 60000);
    
    if (isNaN(scheduled.getTime()) || scheduled <= oneMinuteAgo) {
        throw new HttpsError("invalid-argument", "A data deve ser no futuro.");
    }
    const docRef = await admin.firestore().collection("scheduledNotifications").add({
        title,
        message: message || "",
        ...(imageUrl ? { imageUrl } : {}),
        ...(linkUrl ? { linkUrl } : {}),
        scheduledAt: scheduled.toISOString(),
        status: "pending",
        createdBy: request.auth.token.email || request.auth.uid,
        createdAt: new Date().toISOString()
    });
    return { id: docRef.id, message: "Notificacao agendada com sucesso." };
});

/**
 * Otimiza PDFs recém-carregados no Storage (Versão v1 para evitar problemas de IAM).
 */
exports.onPDFUpload = functions.runWith({
    timeoutSeconds: 300,
    memory: "512MB"
}).storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType;

    // 1. Validar se é um PDF na pasta correta e se não foi otimizado
    if (!contentType || !contentType.includes("pdf") || !filePath.startsWith("pdfs/")) {
        return console.log("Arquivo ignorado (não é PDF ou não está na pasta 'pdfs/')");
    }

    if (object.metadata && object.metadata.optimized === "true") {
        return console.log("Arquivo já otimizado. Ignorando para evitar loop.");
    }

    const bucket = admin.storage().bucket(object.bucket);
    const tempFilePath = path.join(os.tmpdir(), path.basename(filePath));
    const outputFilePath = path.join(os.tmpdir(), `opt_${path.basename(filePath)}`);

    try {
        console.log(`Iniciando otimização: ${filePath}`);

        // 2. Download do arquivo original
        await bucket.file(filePath).download({ destination: tempFilePath });

        // 3. Processar com pdf-lib
        const existingPdfBytes = fs.readFileSync(tempFilePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        // A compressão básica ocorre ao salvar (remove lixo estrutural)
        // Nota: pdf-lib não lineariza por padrão, mas limpa referências órfãs.
        const pdfBytes = await pdfDoc.save({ useObjectStreams: true });

        fs.writeFileSync(outputFilePath, pdfBytes);

        // 4. Upload de volta com metadados de controle
        await bucket.upload(outputFilePath, {
            destination: filePath,
            metadata: {
                contentType: "application/pdf",
                metadata: {
                    optimized: "true",
                    originalSize: object.size,
                    optimizedAt: new Date().toISOString()
                }
            }
        });

        const newSize = fs.statSync(outputFilePath).size;
        const reduction = ((1 - (newSize / parseInt(object.size))) * 100).toFixed(2);

        console.log(`Otimização concluída. Tamanho: ${object.size} -> ${newSize} (${reduction}% de redução)`);

        // 5. Registrar log no sistema
        await admin.firestore().collection("adminLogs").add({
            type: "sistema",
            message: "Otimização automática de PDF realizada",
            details: `Arquivo: ${path.basename(filePath)}. Redução de ${reduction}%.`,
            user: "Sistema",
            createdAt: new Date().toISOString()
        });

    } catch (error) {
        console.error("Erro durante a otimização do PDF:", error);
    } finally {
        // Limpeza dos arquivos temporários
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
    }
});

/**
 * Processamento Inteligente de Atestados Médicos (Fase 2)
 * Acionado quando um músico faz upload de um atestado (PDF ou Imagem) na pasta atestados_temp/
 */
exports.onAtestadoUpload = functions.runWith({
    timeoutSeconds: 540, 
    memory: "1GB",
    secrets: ["GEMINI_API_KEY"]
}).storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType;

    // 1. Validar se está na pasta correta
    if (!filePath.startsWith("atestados_temp/")) {
        return console.log("Arquivo ignorado (não está na pasta 'atestados_temp/')");
    }

    console.log(`[Atestados] Processando novo arquivo: ${filePath}`);

    const bucket = admin.storage().bucket(object.bucket);
    const tempFilePath = path.join(os.tmpdir(), path.basename(filePath));
    
    try {
        // 2. Download do arquivo
        await bucket.file(filePath).download({ destination: tempFilePath });

        // 3. Preparar Gemini
        const apiKey = process.env.GEMINI_API_KEY || admin.remoteConfig().parameters?.GEMINI_API_KEY?.defaultValue?.value;
        if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no ambiente ou Remote Config.");

        const ai = new GoogleGenAI({ apiKey });
        
        // --- Diagnóstico solicitado pelo usuário: Listar modelos ---
        try {
            console.log("[Atestados] Solicitando lista de modelos ativos...");
            const modelList = await ai.models.list();
            
            // Tratamento robusto: a API pode retornar { models: [] } ou []
            const modelsArray = Array.isArray(modelList) ? modelList : (modelList.models || []);
            const activeModels = modelsArray.map(m => m.name).join(", ");
            
            // Grava no Log de Auditoria para validação do usuário
            await admin.firestore().collection("adminLogs").add({
                type: "sistema",
                message: "Auditoria de Modelos Gemini",
                details: `Modelos ativos: ${activeModels || "Nenhum encontrado"}. Resposta completa: ${JSON.stringify(modelList)}`,
                user: "Sistema",
                createdAt: new Date().toISOString()
            });
            console.log(`[Atestados] Modelos ativos: ${activeModels}`);
        } catch (listError) {
            console.warn("[Atestados] Falha ao listar modelos:", listError.message);
            await admin.firestore().collection("adminLogs").add({
                type: "erro",
                message: "Falha na Auditoria de Modelos",
                details: `Erro ao listar: ${listError.message}`,
                user: "Sistema",
                createdAt: new Date().toISOString()
            });
        }

        // 4. Ler arquivo e preparar Prompt
        const fileBuffer = fs.readFileSync(tempFilePath);
        const prompt = `Você é um assistente administrativo médico experiente. 
        Analise este atestado médico (pode ser imagem ou PDF) e extraia os dados necessários para o RH.
        
        EXTRAIA EM JSON:
        - nome: Nome completo do paciente/músico. (Seja preciso).
        - cid: Código CID mencionado. Se não houver, retorne null.
        - data_inicio: Data de início do afastamento no formato YYYY-MM-DD. Use a data de emissão se não houver data de início explícita.
        - dias: Quantidade de dias de afastamento (inteiro). Se for apenas comparecimento, coloque 0.
        - resumo_cid: Uma explicação breve e profissional (máx 200 caracteres) sobre o que significa este CID ou a condição descrita, em termos leigos para um administrador.
        
        REGRAS:
        - Retorne APENAS o objeto JSON, sem markdown ou textos adicionais.
        - Se não conseguir ler o nome, use "Nao_Identificado".`;

        // 5. Executar extração com Gemini 2.5 Flash (Modelo Atual em 2026)
        let aiData;
        let geminiFailed = false;
        let geminiErrorMsg = "";

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    data: fileBuffer.toString("base64"),
                                    mimeType: contentType
                                }
                            }
                        ]
                    }
                ]
            });

            const resultText = response.text || "";
            console.log("[Atestados] Resposta da IA:", resultText);
            
            // Limpar o JSON (às vezes a IA coloca ```json ... ```)
            const jsonMatch = resultText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("A IA não retornou um JSON válido.");
            
            aiData = JSON.parse(jsonMatch[0]);
            console.log("[Atestados] Dados extraídos com sucesso:", aiData);
        } catch (geminiError) {
            console.error("[Atestados] Falha na API do Gemini:", geminiError);
            geminiFailed = true;
            geminiErrorMsg = geminiError.message || String(geminiError);
            
            // Fallback de dados para permitir preenchimento manual no Admin
            aiData = {
                nome: "Revisão Manual Requerida",
                cid: null,
                data_inicio: "",
                dias: "",
                resumo_cid: `Falha na extração automática da IA. A API do Gemini retornou um erro: ${geminiErrorMsg}. Por favor, verifique o documento anexado e preencha as informações manualmente.`
            };
        }

        // 5. Processamento de PDF
        let pdfDoc;
        if (contentType === "application/pdf") {
            pdfDoc = await PDFDocument.load(fileBuffer);
        } else {
            // Converter Imagem para PDF
            pdfDoc = await PDFDocument.create();
            const image = (contentType.includes("png")) 
                ? await pdfDoc.embedPng(fileBuffer) 
                : await pdfDoc.embedJpg(fileBuffer);
            
            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        }

        // 6. Adicionar página de análise da IA com Design Premium (Sugestão 2)
        const infoPage = pdfDoc.addPage([600, 700]);
        const { width, height } = infoPage.getSize();
        
        // Tentar carregar o logo
        try {
            const logoPath = path.join(__dirname, 'assets', 'logo.png');
            if (fs.existsSync(logoPath)) {
                const logoBytes = fs.readFileSync(logoPath);
                const logoImage = await pdfDoc.embedPng(logoBytes);
                const logoDims = logoImage.scale(0.3);
                infoPage.drawImage(logoImage, {
                    x: width / 2 - logoDims.width / 2,
                    y: height - 80,
                    width: logoDims.width,
                    height: logoDims.height,
                });
            }
        } catch (logoErr) {
            console.warn("Não foi possível carregar o logo no PDF:", logoErr);
        }

        // Título e Subtítulo
        if (geminiFailed) {
            infoPage.drawText("ALERTA: FALHA NO PROCESSAMENTO AUTOMÁTICO", { 
                x: 50, y: height - 120, size: 16, 
                color: { type: 'RGB', red: 0.8, green: 0.1, blue: 0.1 } 
            });
            
            infoPage.drawText("Não foi possível extrair os dados usando a Inteligência Artificial.", { 
                x: 50, y: height - 140, size: 9, 
                color: { type: 'RGB', red: 0.5, green: 0.2, blue: 0.2 } 
            });
        } else {
            infoPage.drawText("RELATÓRIO DE ANÁLISE — ROBÔ OER", { 
                x: 50, y: height - 120, size: 18, 
                color: { type: 'RGB', red: 0.1, green: 0.1, blue: 0.1 } 
            });
            
            infoPage.drawText("Documento processado via Inteligência Artificial para gestão administrativa.", { 
                x: 50, y: height - 140, size: 9, 
                color: { type: 'RGB', red: 0.4, green: 0.4, blue: 0.4 } 
            });
        }

        // Linha Divisória
        infoPage.drawLine({
            start: { x: 50, y: height - 155 },
            end: { x: width - 50, y: height - 155 },
            thickness: 1,
            color: { type: 'RGB', red: 0.8, green: 0.8, blue: 0.8 }
        });

        // Cálculos e formatação de datas (DD/MM/YYYY)
        let dataInicioFormatada = "Pendente";
        let dataFimFormatada = "Pendente";

        if (!geminiFailed && aiData.data_inicio && aiData.dias !== undefined) {
            try {
                const parts = aiData.data_inicio.split("-");
                if (parts.length === 3) {
                    const [year, month, day] = parts.map(Number);
                    const dataInicioObj = new Date(year, month - 1, day);
                    const diasInt = parseInt(aiData.dias, 10);
                    
                    // Formata a data de início para DD/MM/YYYY
                    const fInicioYear = dataInicioObj.getFullYear();
                    const fInicioMonth = String(dataInicioObj.getMonth() + 1).padStart(2, '0');
                    const fInicioDay = String(dataInicioObj.getDate()).padStart(2, '0');
                    dataInicioFormatada = `${fInicioDay}/${fInicioMonth}/${fInicioYear}`;
                    
                    // Calcula a data de término
                    if (!isNaN(diasInt)) {
                        const diasToAdd = diasInt > 0 ? diasInt - 1 : 0;
                        dataInicioObj.setDate(dataInicioObj.getDate() + diasToAdd);
                        
                        const fFimYear = dataInicioObj.getFullYear();
                        const fFimMonth = String(dataInicioObj.getMonth() + 1).padStart(2, '0');
                        const fFimDay = String(dataInicioObj.getDate()).padStart(2, '0');
                        dataFimFormatada = `${fFimDay}/${fFimMonth}/${fFimYear}`;
                    }
                }
            } catch (e) {
                console.warn("[Atestados] Erro ao formatar datas no PDF:", e);
            }
        }

        // Dados Extraídos
        const startY = height - 190;
        const lineSpacing = 25;

        const drawDataRow = (label, value, y) => {
            infoPage.drawText(label, { x: 50, y, size: 12, color: { type: 'RGB', red: 0.5, green: 0.5, blue: 0.5 } });
            infoPage.drawText(value || "Pendente", { x: 180, y, size: 12 });
        };

        drawDataRow("Músico(a):", geminiFailed ? "Revisão Manual" : aiData.nome, startY);
        drawDataRow("CID:", geminiFailed ? "Revisão Manual" : aiData.cid, startY - lineSpacing);
        drawDataRow("Início:", dataInicioFormatada, startY - lineSpacing * 2);
        drawDataRow("Término:", dataFimFormatada, startY - lineSpacing * 3);
        drawDataRow("Período:", geminiFailed ? "Revisão Manual" : `${aiData.dias} dias`, startY - lineSpacing * 4);

        // Seção de Explicação
        infoPage.drawText(geminiFailed ? "DETALHES DO ERRO DA IA:" : "EXPLICAÇÃO DA CONDIÇÃO (CID):", { 
            x: 50, y: startY - 130, size: 12, 
            color: geminiFailed ? { type: 'RGB', red: 0.8, green: 0.1, blue: 0.1 } : { type: 'RGB', red: 0.1, green: 0.1, blue: 0.1 } 
        });

        const explanation = aiData.resumo_cid || "Nenhuma informação adicional.";
        infoPage.drawText(explanation, { 
            x: 50, y: startY - 155, size: 11, 
            maxWidth: 500,
            lineHeight: 14,
            color: { type: 'RGB', red: 0.2, green: 0.2, blue: 0.2 } 
        });

        // Rodapé
        infoPage.drawText(`Processado em: ${new Date().toLocaleString('pt-BR')}`, { 
            x: 50, y: 50, size: 8, 
            color: { type: 'RGB', red: 0.6, green: 0.6, blue: 0.6 } 
        });

        const finalPdfBytes = await pdfDoc.save();

        // 6. Upload para pasta processada com nome padronizado
        let datePart = "";
        if (geminiFailed || !aiData.data_inicio) {
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, '0');
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            datePart = `${dd}.${mm}`;
        } else {
            // aiData.data_inicio está no formato YYYY-MM-DD
            const parts = aiData.data_inicio.split("-");
            if (parts.length === 3) {
                datePart = `${parts[2]}.${parts[1]}`;
            } else {
                datePart = "00.00";
            }
        }

        const cleanName = geminiFailed ? "Revisao_Manual" : (aiData.nome || "Atestado").replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_]/g, "");
        const cleanCid = geminiFailed ? "" : (aiData.cid || "SemCID").replace(/\s+/g, '').replace(/[^a-zA-Z0-9.]/g, "");

        const finalFileName = geminiFailed 
            ? `atestado_${datePart}_${cleanName}_0dias.pdf`
            : `atestado_${datePart}_${cleanName}_${cleanCid}_${aiData.dias}dias.pdf`;
        const finalPath = `atestados_processed/${finalFileName}`;

        await bucket.file(finalPath).save(finalPdfBytes, {
            metadata: { 
                contentType: "application/pdf",
                metadata: {
                    processedBy: "RoboOER",
                    originalName: path.basename(filePath),
                    geminiFailed: String(geminiFailed)
                }
            }
        });

        // 7. Salvar no Firestore (medicalCertificates)
        await admin.firestore().collection("medicalCertificates").add({
            nome: geminiFailed ? "" : aiData.nome,
            cid: geminiFailed ? "" : aiData.cid,
            dataInicio: geminiFailed ? "" : aiData.data_inicio,
            dias: geminiFailed ? "" : aiData.dias,
            resumoCid: geminiFailed ? "Falha na API do Gemini. Por favor, revise e preencha as informações manualmente." : aiData.resumo_cid,
            fileName: finalFileName,
            filePath: finalPath,
            status: "pendente",
            createdAt: new Date().toISOString(),
            processedAt: new Date().toISOString(),
            geminiFailed: geminiFailed
        });

        // 8. Log de Auditoria / Notificação no Admin
        if (geminiFailed) {
            await admin.firestore().collection("adminLogs").add({
                type: "erro",
                message: "Atestado recebido, mas não foi possível processar automaticamente via IA.",
                details: `O arquivo ${path.basename(filePath)} foi recebido e disponibilizado no painel administrativo para preenchimento manual.\n\nErro retornado pela API:\n${geminiErrorMsg}`,
                user: "Robô OER",
                createdAt: new Date().toISOString()
            });
        } else {
            await admin.firestore().collection("adminLogs").add({
                type: "atestado",
                message: `Atestado processado: ${aiData.nome}`,
                details: `IA identificou CID ${aiData.cid} e ${aiData.dias} dias de afastamento.\n\nParecer da IA: ${aiData.resumo_cid || "Nenhuma explicação adicional."}`,
                user: "Robô OER",
                createdAt: new Date().toISOString()
            });
        }

        // 9. Remover original (atestados_temp) para segurança
        await bucket.file(filePath).delete();
        console.log(`[Atestados] Processamento concluído ${geminiFailed ? 'com fallback de erro' : 'com sucesso'}: ${finalFileName}`);

    } catch (error) {
        console.error("[Atestados] Erro crítico no processamento:", error);
        
        // Log de erro crítico do sistema
        await admin.firestore().collection("adminLogs").add({
            type: "erro",
            message: `Falha ao processar atestado: ${path.basename(filePath)}`,
            details: error.message,
            user: "Sistema",
            createdAt: new Date().toISOString()
        });
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
});

/**
 * Módulo de Calendário: Processa cronograma em texto ou PDF para JSON
 */
exports.parseScheduleWithGemini = onCall({
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey]
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
    }
    const { text, pdfBase64, mimeType } = request.data;
    if (!text && !pdfBase64) {
        throw new HttpsError("invalid-argument", "Forneça o texto ou o PDF do cronograma.");
    }

    const apiKey = process.env.GEMINI_API_KEY || admin.remoteConfig().parameters?.GEMINI_API_KEY?.defaultValue?.value;
    if (!apiKey) throw new HttpsError("internal", "GEMINI_API_KEY não configurada.");

    const genAI = new GoogleGenAI({ apiKey });

    const prompt = `Você é um assistente que extrai cronogramas de ensaios e concertos de e-mails
da Orquestra Experimental de Repertório (OER).

Retorne APENAS um JSON válido com esta estrutura:
{
  "eventos": [{
    "date": "YYYY-MM-DD",
    "tipo": "ensaio_tutti" | "ensaio_naipe" | "concerto" | "folga",
    "naipe": "string ou null",
    "descricaoEnsaio": "Tutti" | "GERAL" | "OER" | "OER + Cantora Solista" | "Folga" | "string",
    "horarioInicio": "HH:MM",
    "horarioFim": "HH:MM",
    "local": "string",
    "localComplemento": "string ou null",
    "localMapsUrl": "string ou null",
    "status": "Confirmado" | "Cancelado",
    "concertoNome": "string ou null",
    "repertorio": ["COMPOSITOR Nome da obra"],
    "avisos": ["string"]
  }],
  "avisos_semana": [{
    "texto": "string",
    "tipo": "info" | "warning" | "danger"
  }]
}

REGRAS:
- Cada ensaio de naipe e cada ensaio tutti são documentos SEPARADOS mesmo no mesmo dia.
- Repertório: formato "COMPOSITOR Nome da obra" (COMPOSITOR em maiúsculas).
- Separadores "/" e "e" entre obras → itens separados no array.
- Se houver "Intervalo" entre peças → inserir "--- Intervalo ---" como item do array.
- "Repertório completo" aceito como valor literal.
- "Metacosmos" sozinho como repertório → valor literal aceito.
- localComplemento vem entre parênteses após o local (ex: "prédio Corpos Artísticos").
- "concertoNome" é o nome do programa/série (ex: "Metacosmos"), não o tipo do evento.
- Avisos globais da semana (IMPORTANTE:, Lembrando:) → "avisos_semana".
- "Cronograma sujeito a alterações." ou "Sujeito a alteração." → IGNORAR de avisos e repertórios do evento (o sistema visual já possui aviso padrão).
- Datas no formato YYYY-MM-DD.
- Folga: Se o cronograma indicar que não haverá ensaio/atividade em determinada data (ex: "Folga", "Sem ensaio", "Dispensado", "Folgas programadas"), crie um evento com tipo "folga" e descricaoEnsaio "Folga" ou "Folga Programada". Todos os outros campos do evento podem ser nulos ou conter valores padrão.

REGRAS DE INFERÊNCIA DE DADOS (EM CASO DE OMISSÃO):
1. STATUS:
   - Todo evento criado deve ter status = "Confirmado" por padrão.
   - Se o texto indicar que o ensaio ou concerto foi suspenso ou não ocorrerá (ex: "não haverá ensaio", "ensaio cancelado", "concerto suspenso"), defina status = "Cancelado".

2. HORÁRIOS PADRÃO (se omitidos):
   - Concertos aos domingos no Teatro Municipal (TMSP) → horárioInicio padrão: "11:00". (Exceção rara: em janeiro, às 17h, se indicado).
   - Concertos de Camerata ou Oficina na Sala do Conservatório → horárioInicio padrão: "19:00" se for sexta-feira, ou "18:00" se for sábado.
   - Apresentações "No Vale" (geralmente às quintas-feiras) → horárioInicio padrão: "16:00".
   - Reavaliações de Músicos → horárioInicio padrão: "13:00" e horárioFim padrão: "16:30".
   - Testes Externos (Audições) → horárioInicio padrão: "13:00" ou "14:00".

3. LOCAIS PADRÃO E NORMALIZAÇÃO (se omitidos):
   - Concerto da orquestra completa (Tutti) sem local especificado → local padrão: "Teatro Municipal de São Paulo (TMSP)".
   - Ensaios de Naipe, Ensaios Gerais (orquestra reduzida), Reavaliações de Músicos ou Testes Externos (Audições) sem local especificado → local padrão: "Sala de Ensaios do TMSP (Subsolo)".
   - Concertos de Camerata ou Oficina → local padrão: "Sala do Conservatório (Praça das Artes)".
   - Normalização Estrita de String: Se o local contiver o texto "Sala de Ensaio" ou variações aproximadas, salve OBRIGATORIAMENTE como "Sala de Ensaios do TMSP (Subsolo)".

4. LINKS DE MAPAS (Google Maps):
   - Se houver qualquer link do Google Maps (ex: maps.app.goo.gl ou google.com/maps) no texto ou e-mail, extraia essa URL completa e defina-a no campo "localMapsUrl".
   - Remova a URL crua do campo "localComplemento" ou "local" para evitar exibição poluída na interface.

Texto do e-mail: ${text ? text : "Veja o documento PDF anexo."}`;

    try {
        const parts = [{ text: prompt }];
        if (pdfBase64) {
            parts.push({
                inlineData: {
                    data: pdfBase64,
                    mimeType: mimeType || "application/pdf"
                }
            });
        }

        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: parts
                }
            ]
        });

        // SDK @google/genai v2.x: response.text() é método, não propriedade
        const resultText = (typeof response.text === "function") ? response.text() : (response.text || "");
        console.log("[parseSchedule] Resposta bruta da IA:", resultText.substring(0, 500));

        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("A IA não retornou um JSON válido. Resposta: " + resultText.substring(0, 300));
        
        return JSON.parse(jsonMatch[0]);

    } catch (error) {
        console.error("Erro ao processar cronograma:", error.message, error.stack);
        throw new HttpsError("internal", "Erro ao processar calendário com a IA: " + error.message);
    }
});

/**
 * Realiza uma varredura em tempo real (FCM dryRun) para calibrar os tokens de assinantes ativos.
 * Remove tokens obsoletos/inválidos e ajusta o contador estatístico.
 */
exports.checkSubscribersNow = onCall({
    region: "us-central1",
    maxInstances: 5,
    memory: "256MiB"
}, async (request) => {
    // Validar se o usuário está autenticado
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Apenas administradores autenticados podem rodar a varredura.");
    }

    const email = request.auth.token.email || "Administrador";
    console.log(`[Varredura Manual] Iniciada por: ${email}`);

    const db = admin.firestore();
    const statsRef = db.collection("config").doc("stats");
    const dailyStatsRef = db.collection("config").doc("dailyStats");
    const logsRef = db.collection("adminLogs");
    const fcmTokensRef = db.collection("fcmTokens");

    try {
        // 1. Buscar todos os tokens registrados
        const tokensSnapshot = await fcmTokensRef.get();
        const tokens = [];
        tokensSnapshot.forEach(doc => {
            const data = doc.data();
            if (data && data.token) {
                tokens.push(data.token);
            }
        });

        const initialCount = tokens.length;
        console.log(`[Varredura Manual] Analisando ${initialCount} tokens salvos...`);

        if (initialCount === 0) {
            // Caso especial: sem tokens no banco
            await statsRef.set({
                subscriberCount: 0,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            await logsRef.add({
                type: "bot",
                message: "Robô OER (Manual): Varredura concluída (Sem tokens).",
                details: "O Robô OER realizou a varredura manual e detectou que não há nenhum token de dispositivo registrado no banco de dados. O contador foi zerado.",
                user: email,
                createdAt: new Date().toISOString()
            });

            return {
                success: true,
                removedCount: 0,
                newCount: 0,
                corrected: false
            };
        }

        // 2. Validar cada token em lotes de 500 usando dryRun
        const failedTokens = [];
        for (let i = 0; i < tokens.length; i += 500) {
            const tokensBatch = tokens.slice(i, i + 500);
            const payload = {
                notification: {
                    title: "Validação silenciosa",
                    body: "Apenas para teste de conectividade."
                },
                tokens: tokensBatch
            };

            try {
                // dryRun = true: não envia mensagem para o aparelho, só valida no Google/Apple
                const response = await admin.messaging().sendEachForMulticast(payload, true);
                if (response.failureCount > 0) {
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            const errCode = resp.error.code;
                            if (errCode === 'messaging/invalid-registration-token' ||
                                errCode === 'messaging/registration-token-not-registered') {
                                failedTokens.push(tokensBatch[idx]);
                            }
                        }
                    });
                }
            } catch (err) {
                console.error(`[Varredura Manual] Erro ao enviar dryRun para lote ${i}:`, err);
            }
        }

        const removedCount = failedTokens.length;
        console.log(`[Varredura Manual] ${removedCount} tokens inválidos encontrados.`);

        // 3. Remover tokens inválidos do Firestore em batches de 500
        if (removedCount > 0) {
            for (let i = 0; i < failedTokens.length; i += 500) {
                const batch = db.batch();
                const batchTokens = failedTokens.slice(i, i + 500);
                batchTokens.forEach(badToken => {
                    const docRef = fcmTokensRef.doc(badToken);
                    batch.delete(docRef);
                });
                await batch.commit();
            }
            console.log(`[Varredura Manual] Removidos ${removedCount} documentos de fcmTokens.`);
        }

        // 4. Recalcular e atualizar o contador de estatísticas em tempo real
        const finalCountSnap = await fcmTokensRef.count().get();
        const finalCount = finalCountSnap.data().count;

        let corrected = false;
        const statsSnap = await statsRef.get();
        const storedCount = statsSnap.exists ? (statsSnap.data().subscriberCount || 0) : 0;

        // Se o valor armazenado for diferente do valor real pós-limpeza, houve auto-cura
        if (storedCount !== finalCount) {
            corrected = true;
            await statsRef.set({
                subscriberCount: finalCount,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }

        // 5. Registrar logs de auditoria
        const logMsg = `Robô OER (Manual): Varredura manual de assinaturas concluída.`;
        const logDetails = `O Robô OER executou uma varredura em tempo real a pedido de ${email}.
- Tokens analisados: ${initialCount}
- Tokens inválidos removidos: ${removedCount}
- Total ativo pós-limpeza: ${finalCount} músicos.
${corrected ? `Divergência detectada e auto-curada! O contador do painel foi ajustado de ${storedCount} para ${finalCount}.` : `O contador já estava perfeitamente sincronizado com o banco.`}`;

        await logsRef.add({
            type: "bot",
            message: logMsg,
            details: logDetails,
            user: email,
            createdAt: new Date().toISOString()
        });

        // 6. Atualizar o backup diário para o robô das 6h não registrar variações indevidas
        await dailyStatsRef.set({
            lastCount: finalCount,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            success: true,
            removedCount: removedCount,
            newCount: finalCount,
            corrected: corrected,
            message: `Varredura concluída. ${removedCount} tokens antigos foram removidos. Total de inscritos: ${finalCount}.`
        };

    } catch (error) {
        console.error("[Varredura Manual] Erro crítico:", error);
        throw new HttpsError("internal", "Erro ao executar a varredura manual de assinaturas: " + error.message);
    }
});

// A função callable temporária backfillOcr foi removida com sucesso após a execução bem-sucedida da migração na produção.

/**
 * Função utilitária para download de PDF, extração de eventos via Gemini,
 * e sincronização (criação/atualização/exclusão) no banco de dados.
 */
async function processAndSyncSchedule(type, url, filename, displayVersion) {
    const db = admin.firestore();
    const apiKey = process.env.GEMINI_API_KEY || admin.remoteConfig().parameters?.GEMINI_API_KEY?.defaultValue?.value;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");

    const genAI = new GoogleGenAI({ apiKey });

    // 1. Download do PDF usando fetch nativo
    console.log(`[processAndSyncSchedule] Baixando PDF de: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Falha ao baixar PDF do Storage. HTTP status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = buffer.toString('base64');

    // 2. Montar prompt do Gemini com suporte a tipo 'folga'
    const prompt = `Você é um assistente que extrai cronogramas de ensaios e concertos de e-mails
da Orquestra Experimental de Repertório (OER).

Retorne APENAS um JSON válido com esta estrutura:
{
  "eventos": [{
    "date": "YYYY-MM-DD",
    "tipo": "ensaio_tutti" | "ensaio_naipe" | "concerto" | "folga",
    "naipe": "string ou null",
    "descricaoEnsaio": "Tutti" | "GERAL" | "OER" | "OER + Cantora Solista" | "Folga" | "string",
    "horarioInicio": "HH:MM",
    "horarioFim": "HH:MM",
    "local": "string",
    "localComplemento": "string ou null",
    "localMapsUrl": "string ou null",
    "status": "Confirmado" | "Cancelado",
    "concertoNome": "string ou null",
    "repertorio": ["COMPOSITOR Nome da obra"],
    "avisos": ["string"]
  }],
  "avisos_semana": [{
    "texto": "string",
    "tipo": "info" | "warning" | "danger"
  }]
}

REGRAS:
- Cada ensaio de naipe e cada ensaio tutti são documentos SEPARADOS mesmo no mesmo dia.
- Repertório: formato "COMPOSITOR Nome da obra" (COMPOSITOR em maiúsculas).
- Separadores "/" e "e" entre obras → itens separados no array.
- Se houver "Intervalo" entre peças → inserir "--- Intervalo ---" como item do array.
- "Repertório completo" aceito como valor literal.
- "Metacosmos" sozinho como repertório → valor literal aceito.
- localComplemento vem entre parênteses após o local (ex: "prédio Corpos Artísticos").
- "concertoNome" é o nome do programa/série (ex: "Metacosmos"), não o tipo do evento.
- Avisos globais da semana (IMPORTANTE:, Lembrando:) → "avisos_semana".
- "Cronograma sujeito a alterações." ou "Sujeito a alteração." → IGNORAR de avisos e repertórios do evento (o sistema visual já possui aviso padrão).
- Datas no formato YYYY-MM-DD.
- Folga: Se o cronograma indicar que não haverá ensaio/atividade em determinada data (ex: "Folga", "Sem ensaio", "Dispensado", "Folgas programadas"), crie um evento com tipo "folga" e descricaoEnsaio "Folga" ou "Folga Programada". Todos os outros campos do evento podem ser nulos ou conter valores padrão.

REGRAS DE INFERÊNCIA DE DADOS (EM CASO DE OMISSÃO):
1. STATUS:
   - Todo evento criado deve ter status = "Confirmado" por padrão.
   - Se o texto indicar que o ensaio ou concerto foi suspenso ou não ocorrerá (ex: "não haverá ensaio", "ensaio cancelado", "concerto suspenso"), defina status = "Cancelado".

2. HORÁRIOS PADRÃO (se omitidos):
   - Concertos aos domingos no Teatro Municipal (TMSP) → horárioInicio padrão: "11:00". (Exceção rara: em janeiro, às 17h, se indicado).
   - Concertos de Camerata ou Oficina na Sala do Conservatório → horárioInicio padrão: "19:00" se for sexta-feira, ou "18:00" se for sábado.
   - Apresentações "No Vale" (geralmente às quintas-feiras) → horárioInicio padrão: "16:00".
   - Reavaliações de Músicos → horárioInicio padrão: "13:00" e horárioFim padrão: "16:30".
   - Testes Externos (Audições) → horárioInicio padrão: "13:00" ou "14:00".

3. LOCAIS PADRÃO E NORMALIZAÇÃO (se omitidos):
   - Concerto da orquestra completa (Tutti) sem local especificado → local padrão: "Teatro Municipal de São Paulo (TMSP)".
   - Ensaios de Naipe, Ensaios Gerais (orquestra reduzida), Reavaliações de Músicos ou Testes Externos (Audições) sem local especificado → local padrão: "Sala de Ensaios do TMSP (Subsolo)".
   - Concertos de Camerata ou Oficina → local padrão: "Sala do Conservatório (Praça das Artes)".
   - Normalização Estrita de String: Se o local contiver o texto "Sala de Ensaio" ou variações aproximadas, salve OBRIGATORIAMENTE como "Sala de Ensaios do TMSP (Subsolo)".

4. LINKS DE MAPAS (Google Maps):
   - Se houver qualquer link do Google Maps (ex: maps.app.goo.gl ou google.com/maps) no texto ou e-mail, extraia essa URL completa e defina-a no campo "localMapsUrl".
   - Remova a URL crua do campo "localComplemento" ou "local" para evitar exibição poluída na interface.

Texto do e-mail: Veja o documento PDF anexo.`;

    console.log(`[processAndSyncSchedule] Chamando Gemini 2.5 Flash...`);
    const parts = [
        { text: prompt },
        {
            inlineData: {
                data: pdfBase64,
                mimeType: "application/pdf"
            }
        }
    ];

    const responseGenAI = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
            {
                role: "user",
                parts: parts
            }
        ]
    });

    const resultText = (typeof responseGenAI.text === "function") ? responseGenAI.text() : (responseGenAI.text || "");
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error("A IA não retornou um JSON válido. Resposta: " + resultText.substring(0, 300));
    }

    const data = JSON.parse(jsonMatch[0]);
    const eventosNovos = data.eventos || [];
    const avisosSemana = data.avisos_semana || [];

    console.log(`[processAndSyncSchedule] Extraídos ${eventosNovos.length} eventos e ${avisosSemana.length} avisos da semana.`);

    if (eventosNovos.length === 0) {
        console.log("[processAndSyncSchedule] Nenhum evento encontrado para sincronizar.");
        return { added: 0, updated: 0, deleted: 0 };
    }

    // Ordenar as datas para achar a faixa
    const datasValidas = eventosNovos.map(e => e.date).filter(Boolean).sort();
    if (datasValidas.length === 0) {
        throw new Error("Os eventos extraídos não possuem datas válidas.");
    }
    const minDate = datasValidas[0];
    const maxDate = datasValidas[datasValidas.length - 1];

    console.log(`[processAndSyncSchedule] Faixa de datas identificada: ${minDate} até ${maxDate}`);

    // Buscar eventos existentes no Firestore no intervalo
    const eventosRef = db.collection("eventos");
    const snapshot = await eventosRef.where("date", ">=", minDate).where("date", "<=", maxDate).get();

    const eventosExistentes = [];
    snapshot.forEach(doc => {
        eventosExistentes.push({ id: doc.id, ...doc.data() });
    });

    console.log(`[processAndSyncSchedule] Encontrados ${eventosExistentes.length} eventos existentes no banco neste intervalo.`);

    let addedCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;

    // Ações de criação e atualização
    for (const novo of eventosNovos) {
        if (!novo.date) continue;

        // Tenta achar um correspondente no banco (mesma data, tipo e naipe)
        const match = eventosExistentes.find(ext => 
            ext.date === novo.date && 
            ext.tipo === novo.tipo && 
            (novo.tipo !== "ensaio_naipe" || ext.naipe === novo.naipe)
        );

        const eventoDoc = {
            date: novo.date,
            tipo: novo.tipo || "ensaio_tutti",
            naipe: novo.naipe || null,
            descricaoEnsaio: novo.descricaoEnsaio || "Ensaio",
            horarioInicio: novo.horarioInicio || "00:00",
            horarioFim: novo.horarioFim || "00:00",
            local: novo.local || "",
            localComplemento: novo.localComplemento || null,
            localMapsUrl: novo.localMapsUrl || null,
            status: novo.status || "Confirmado",
            concertoNome: novo.concertoNome || null,
            repertorio: (novo.repertorio && novo.repertorio.length > 0) ? novo.repertorio : null,
            avisos: (novo.avisos && novo.avisos.length > 0) ? novo.avisos : null,
            mesRef: novo.date.substring(0, 7),
            updatedAt: FieldValue.serverTimestamp()
        };

        if (match) {
            // Verificar se houve alguma mudança relevante
            let mudou = false;
            const camposParaComparar = [
                "descricaoEnsaio", "horarioInicio", "horarioFim", "local", 
                "localComplemento", "localMapsUrl", "status", "concertoNome"
            ];
            
            for (const campo of camposParaComparar) {
                if (eventoDoc[campo] !== match[campo]) {
                    mudou = true;
                    break;
                }
            }

            // Comparar repertórios
            const repNovo = JSON.stringify(eventoDoc.repertorio || []);
            const repVelho = JSON.stringify(match.repertorio || []);
            if (repNovo !== repVelho) mudou = true;

            // Comparar avisos
            const avNovo = JSON.stringify(eventoDoc.avisos || []);
            const avVelho = JSON.stringify(match.avisos || []);
            if (avNovo !== avVelho) mudou = true;

            if (mudou) {
                await eventosRef.doc(match.id).update(eventoDoc);
                updatedCount++;
                console.log(`[processAndSyncSchedule] Evento atualizado: ${novo.date} - ${novo.tipo}`);
            }
        } else {
            // Criar novo
            const finalDoc = {
                ...eventoDoc,
                createdAt: FieldValue.serverTimestamp(),
                criadoPor: "sistema_ia"
            };
            await eventosRef.add(finalDoc);
            addedCount++;
            console.log(`[processAndSyncSchedule] Evento criado: ${novo.date} - ${novo.tipo}`);
        }
    }

    // Ações de exclusão: eventos existentes que NÃO estão nos novos eventos
    for (const existente of eventosExistentes) {
        const match = eventosNovos.find(novo => 
            novo.date === existente.date && 
            novo.tipo === existente.tipo && 
            (existente.tipo !== "ensaio_naipe" || novo.naipe === existente.naipe)
        );

        if (!match) {
            await eventosRef.doc(existente.id).delete();
            deletedCount++;
            console.log(`[processAndSyncSchedule] Evento antigo excluído: ${existente.date} - ${existente.tipo}`);
        }
    }

    // Salvar avisos_semana extras se houver
    if (avisosSemana.length > 0) {
        const avisosRef = db.collection("avisos_semana");
        for (const aviso of avisosSemana) {
            if (!aviso.texto) continue;
            await avisosRef.add({
                texto: aviso.texto,
                tipo: aviso.tipo || "info",
                createdAt: FieldValue.serverTimestamp()
            });
        }
        console.log(`[processAndSyncSchedule] Salvos ${avisosSemana.length} avisos da semana na coleção avisos_semana.`);
    }

    return { added: addedCount, updated: updatedCount, deleted: deletedCount, minDate, maxDate };
}

/**
 * Trigger que roda em background ao atualizar config/pdfs.
 * Baixa e sincroniza automaticamente a agenda/temporada no calendário.
 */
exports.syncScheduleOnPDFUpload = onDocumentWritten({
    document: "config/pdfs",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (event) => {
    const beforeData = event.data.before ? event.data.before.data() : null;
    const afterData = event.data.after ? event.data.after.data() : null;

    if (!afterData || !afterData.pdfs) {
        console.log("[syncScheduleOnPDFUpload] Documento pdfs foi excluído ou está sem pdfs.");
        return;
    }

    const types = ["agenda", "temporada"];
    for (const type of types) {
        const beforePdf = beforeData && beforeData.pdfs ? beforeData.pdfs[type] : null;
        const afterPdf = afterData.pdfs[type];

        if (afterPdf && (!beforePdf || beforePdf.version !== afterPdf.version)) {
            console.log(`[syncScheduleOnPDFUpload] Detectada atualização na ${type}: v${afterPdf.displayVersion}`);
            
            try {
                const syncResult = await processAndSyncSchedule(
                    type, 
                    afterPdf.url, 
                    afterPdf.arquivo, 
                    afterPdf.displayVersion
                );

                // Gravar log de sucesso com tipo bot
                await admin.firestore().collection("adminLogs").add({
                    type: "bot",
                    message: `🤖 [Robô OER] Sincronização automática concluída para ${type.toUpperCase()}.`,
                    details: `Arquivo: ${afterPdf.arquivo} (v${afterPdf.displayVersion})\n- Faixa: ${syncResult.minDate} até ${syncResult.maxDate}\n- Adicionados: ${syncResult.added} novos eventos\n- Atualizados: ${syncResult.updated} eventos\n- Excluídos: ${syncResult.deleted} eventos antigos.`,
                    user: "sistema",
                    link: afterPdf.url,
                    createdAt: new Date().toISOString()
                });

                console.log(`[syncScheduleOnPDFUpload] Sincronização automática concluída com sucesso para ${type}!`);
            } catch (err) {
                console.error(`[syncScheduleOnPDFUpload] Erro na sincronização automática da ${type}:`, err);

                // Gravar log de erro no histórico
                await admin.firestore().collection("adminLogs").add({
                    type: "erro",
                    message: `❌ [Robô OER] Falha na sincronização automática de ${type.toUpperCase()}.`,
                    details: `Erro na leitura ou processamento do PDF: ${err.message}\n\nPor favor, tente refazer o processo clicando no botão "Tentar Novamente" abaixo ou entre em contato com o Administrador para corrigir o ERRO.`,
                    user: "sistema",
                    link: afterPdf.url,
                    fileType: type,
                    fileName: afterPdf.arquivo,
                    fileVersion: afterPdf.displayVersion,
                    retryCount: 0,
                    createdAt: new Date().toISOString()
                });
            }
        }
    }
});

/**
 * Função callable para reprocessamento manual de PDF a partir de um log de erro.
 */
exports.reprocessSchedulePDF = onCall({
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey]
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
    }
    const { logId } = request.data;
    if (!logId) {
        throw new HttpsError("invalid-argument", "Forneça o ID do log de erro.");
    }

    const db = admin.firestore();
    const logRef = db.collection("adminLogs").doc(logId);
    const logSnap = await logRef.get();
    if (!logSnap.exists) {
        throw new HttpsError("not-found", "Log de erro não encontrado.");
    }

    const logData = logSnap.data();
    if (logData.type !== 'erro' || !logData.fileType || !logData.link) {
        throw new HttpsError("invalid-argument", "Log não elegível para reprocessamento.");
    }

    const retryCount = (logData.retryCount || 0) + 1;
    if (retryCount > 3) {
        throw new HttpsError("failed-precondition", "Limite de 3 tentativas de reprocessamento excedido para este arquivo.");
    }

    // Atualiza contador de tentativas no log de erro
    await logRef.update({ retryCount });

    try {
        console.log(`[reprocessSchedulePDF] Iniciando reprocessamento. Tentativa ${retryCount}/3 para ${logData.fileType}`);
        const syncResult = await processAndSyncSchedule(
            logData.fileType, 
            logData.link, 
            logData.fileName || logData.message, 
            logData.fileVersion || "1.0"
        );

        // Gravar log de sucesso do Robô OER
        await db.collection("adminLogs").add({
            type: "bot",
            message: `🤖 [Robô OER] Sincronização automática concluída via reprocessamento para ${logData.fileType.toUpperCase()}.`,
            details: `Reprocessamento bem-sucedido após erro anterior.\n- Faixa: ${syncResult.minDate} até ${syncResult.maxDate}\n- Adicionados: ${syncResult.added} novos eventos\n- Atualizados: ${syncResult.updated} eventos\n- Excluídos: ${syncResult.deleted} eventos antigos.`,
            user: request.auth.token.email || "sistema",
            link: logData.link,
            createdAt: new Date().toISOString()
        });

        // Deleta o log de erro anterior após o sucesso
        await logRef.delete();

        return { success: true, message: "Arquivo reprocessado e sincronizado com sucesso!" };
    } catch (error) {
        console.error(`[reprocessSchedulePDF] Erro na tentativa ${retryCount}/3:`, error);
        
        // Atualiza a mensagem de erro com a nova falha e a contagem
        await logRef.update({
            details: `Erro (Tentativa ${retryCount}/3): ${error.message}\n\nPor favor, tente refazer o processo clicando no botão "Tentar Novamente" abaixo ou entre em contato com o Administrador para corrigir o ERRO.`
        });
        
        throw new HttpsError("internal", `Erro no reprocessamento (Tentativa ${retryCount}/3): ${error.message}`);
    }
});

/**
 * Função callable para forçar a sincronização dos PDFs atuais com o calendário.
 */
exports.forceSyncCalendar = onCall({
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [geminiApiKey]
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
    }
    const db = admin.firestore();
    const configRef = db.collection("config").doc("pdfs");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
        throw new HttpsError("not-found", "Documento pdfs não encontrado.");
    }
    const data = configSnap.data();
    if (!data.pdfs) {
        throw new HttpsError("failed-precondition", "Nenhum PDF cadastrado.");
    }

    let count = 0;
    // Modifica a versão/timestamp para disparar a trigger de upload
    for (const type of ["agenda", "temporada"]) {
        if (data.pdfs[type]) {
            data.pdfs[type].version = Date.now() + count;
            data.pdfs[type].updatedAt = new Date().toISOString();
            count++;
        }
    }
    await configRef.set(data);
    return { success: true, message: "Forçada sincronização! A trigger syncScheduleOnPDFUpload foi disparada em segundo plano." };
});

