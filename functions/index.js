const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const { FieldValue } = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const { PDFDocument } = require("pdf-lib");
const path = require("path");
const os = require("os");
const fs = require("fs");

admin.initializeApp();

exports.sendPushNotification = onDocumentCreated("adminNotifications/{notificationId}", async (event) => {
    const data = event.data.data();
    if (!data) return;

    const { title, message } = data;

    console.log(`Disparando notificação: ${title}`);

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
        return;
    }

    console.log(`Enviando para ${tokens.length} dispositivos...`);

    const payload = {
        notification: {
            title: title || "Novo aviso",
            body: message || "",
            image: data.imageUrl || undefined,
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
    memory: "512MiB"
}, async (request) => {
    // Verificar autenticação (apenas admins podem chamar)
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "O usuário precisa estar autenticado.");
    }

    const { userPrompt, includeContext, selectedContexts, image, type, version } = request.data;
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
                ...(data.imageUrl ? { imageUrl: data.imageUrl } : {})
            };
            await db.collection("adminNotifications").add(notifData);
            await db.collection("config").doc("latestNotice").set(notifData);
            await db.collection("adminLogs").add({
                type: "aviso",
                message: "Aviso agendado enviado: " + data.title,
                details: "Agendado para " + data.scheduledAt + ". Disparado via histórico de avisos para todos os músicos ativos.",
                user: data.createdBy || "agendamento",
                ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
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
    const { title, message, imageUrl, scheduledAt } = request.data;
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
    memory: "1GB"
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
        
        const aiData = JSON.parse(jsonMatch[0]);
        console.log("[Atestados] Dados extraídos com sucesso:", aiData);

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
        infoPage.drawText("RELATÓRIO DE ANÁLISE — ROBÔ OER", { 
            x: 50, y: height - 120, size: 18, 
            color: { type: 'RGB', red: 0.1, green: 0.1, blue: 0.1 } 
        });
        
        infoPage.drawText("Documento processado via Inteligência Artificial para gestão administrativa.", { 
            x: 50, y: height - 140, size: 9, 
            color: { type: 'RGB', red: 0.4, green: 0.4, blue: 0.4 } 
        });

        // Linha Divisória
        infoPage.drawLine({
            start: { x: 50, y: height - 155 },
            end: { x: width - 50, y: height - 155 },
            thickness: 1,
            color: { type: 'RGB', red: 0.8, green: 0.8, blue: 0.8 }
        });

        // Cálculos e formatação de datas (DD/MM/YYYY)
        let dataInicioFormatada = aiData.data_inicio || "N/A";
        let dataFimFormatada = "N/A";

        if (aiData.data_inicio && aiData.dias !== undefined) {
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
            infoPage.drawText(value || "N/A", { x: 180, y, size: 12 });
        };

        drawDataRow("Músico(a):", aiData.nome, startY);
        drawDataRow("CID:", aiData.cid, startY - lineSpacing);
        drawDataRow("Início:", dataInicioFormatada, startY - lineSpacing * 2);
        drawDataRow("Término:", dataFimFormatada, startY - lineSpacing * 3);
        drawDataRow("Período:", `${aiData.dias} dias`, startY - lineSpacing * 4);

        // Seção de Explicação
        infoPage.drawText("EXPLICAÇÃO DA CONDIÇÃO (CID):", { 
            x: 50, y: startY - 130, size: 12, 
            color: { type: 'RGB', red: 0.1, green: 0.1, blue: 0.1 } 
        });

        const explanation = aiData.resumo_cid || "Nenhuma informação adicional extraída sobre o CID.";
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
        const cleanName = (aiData.nome || "Atestado").replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_]/g, "");
        const finalFileName = `atestado_${cleanName}_${aiData.data_inicio}_${aiData.dias}dias.pdf`;
        const finalPath = `atestados_processed/${finalFileName}`;

        await bucket.file(finalPath).save(finalPdfBytes, {
            metadata: { 
                contentType: "application/pdf",
                metadata: {
                    processedBy: "RoboOER",
                    originalName: path.basename(filePath)
                }
            }
        });

        // 7. Salvar no Firestore (medicalCertificates)
        await admin.firestore().collection("medicalCertificates").add({
            nome: aiData.nome,
            cid: aiData.cid,
            dataInicio: aiData.data_inicio,
            dias: aiData.dias,
            resumoCid: aiData.resumo_cid,
            fileName: finalFileName,
            filePath: finalPath,
            status: "pendente",
            createdAt: new Date().toISOString(),
            processedAt: new Date().toISOString()
        });

        // 8. Log de Auditoria
        await admin.firestore().collection("adminLogs").add({
            type: "atestado",
            message: `Atestado processado: ${aiData.nome}`,
            details: `IA identificou CID ${aiData.cid} e ${aiData.dias} dias de afastamento.\n\nParecer da IA: ${aiData.resumo_cid || "Nenhuma explicação adicional."}`,
            user: "Robô OER",
            createdAt: new Date().toISOString()
        });

        // 9. Remover original (atestados_temp) para segurança
        await bucket.file(filePath).delete();
        console.log(`[Atestados] Processamento concluído com sucesso: ${finalFileName}`);

    } catch (error) {
        console.error("[Atestados] Erro crítico no processamento:", error);
        
        // Log de erro
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
    memory: "512MiB"
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
    "tipo": "ensaio_tutti" | "ensaio_naipe" | "concerto",
    "naipe": "string ou null",
    "descricaoEnsaio": "Tutti" | "GERAL" | "OER" | "OER + Cantora Solista" | "string",
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
