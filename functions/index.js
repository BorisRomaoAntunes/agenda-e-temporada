const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const statsSnap = await transaction.get(statsRef);
            const dailySnap = await transaction.get(dailyStatsRef);

            const currentCount = statsSnap.exists() ? (statsSnap.data().subscriberCount || 0) : 0;
            const previousCount = dailySnap.exists() ? (dailySnap.data().lastCount || 0) : 0;

            // Só registra log se houver mudança
            if (currentCount !== previousCount) {
                const diff = currentCount - previousCount;
                const trend = diff > 0 ? "aumento" : "queda";
                const absDiff = Math.abs(diff);
                
                const logMessage = `Monitoramento Diário: Houve uma ${trend} no número de inscritos.`;
                const logDetails = `Total atual: ${currentCount} músicos. Variação: ${diff > 0 ? "+" : ""}${diff} desde a última verificação.`;

                const newLog = {
                    type: "bot",
                    message: logMessage,
                    details: logDetails,
                    user: "Robô OER",
                    createdAt: new Date().toISOString()
                };

                transaction.set(logsRef.doc(), newLog);
                console.log(`Log do robô registrado: ${currentCount} inscritos (${diff > 0 ? "+" : ""}${diff})`);
            } else {
                console.log(`Nenhuma alteração no número de inscritos (${currentCount}). Pulando registro de log.`);
            }

            // Atualiza o contador diário para a próxima verificação
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
 * Gera uma sugestão de título e corpo para notificação push usando IA.
 */
exports.suggestNotificationText = onCall({
    region: "us-central1", // Ou sua região padrão
    maxInstances: 10,
    memory: "256MiB"
}, async (request) => {
    // Verificar autenticação (apenas admins podem chamar)
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "O usuário precisa estar autenticado.");
    }

    const { type, version } = request.data;
    if (!type || !version) {
        throw new HttpsError("invalid-argument", "Os campos 'type' e 'version' são obrigatórios.");
    }

    const apiKey = process.env.GEMINI_API_KEY || admin.remoteConfig().parameters?.GEMINI_API_KEY?.defaultValue?.value;
    
    if (!apiKey) {
        console.warn("GEMINI_API_KEY não configurada. Usando fallback estático.");
        return {
            title: `Nova ${type} disponível!`,
            message: `A ${type} foi atualizada para a versão v${version}. Confira os detalhes no site.`
        };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Você é o Robô OER, o assistente oficial e entusiasta da Orquestra Experimental de Repertório.
        Sua missão é avisar os músicos sobre atualizações nas partituras e cronogramas com energia e precisão.
        
        Um administrador acabou de atualizar a "${type}" para a versão "${version}".
        
        Crie um título curto (máx 50 caracteres) e uma mensagem vibrante (máx 150 caracteres) para uma notificação push.
        
        DIRETRIZES DE ESTILO:
        1. Título: Deve ser impactante e chamar a atenção (clicável), mas ser informativo. Deve ficar claro que se trata de uma atualização ou nova versão da "${type}".
        2. Corpo da Mensagem: Use referências musicais sutis e "dosadas" para dar personalidade (ex: "em sintonia", "nova pauta", "ritmo de ensaio"), mas evite o excesso de termos técnicos. Priorize a clareza da informação sobre a "${type}".
        3. Emojis: Utilize emojis musicais de forma elegante e moderada (máximo 2 ou 3).
        4. Identidade e Tom: Você é o assistente oficial da OER. O tom deve ser vibrante e inspirador, mas profissional.
        
        REGRAS TÉCNICAS:
        - Retorne APENAS um objeto JSON válido.
        - Formato: {"title": "...", "message": "..."}`;


        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Limpar possíveis blocos de código markdown do JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        throw new Error("Falha ao processar resposta da IA.");

    } catch (error) {
        console.error("Erro ao gerar sugestão com IA (usando fallback):", error);
        return {
            title: `🎼 Novo andamento: ${type} v${version}`,
            message: `Atenção, naipe! A ${type} foi atualizada para a versão v${version}. Partituras na estante! 🎻`
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

    if (snap.empty) { console.log("Sem notificacoes pendentes."); return; }

    const dueDocs = snap.docs.filter(d => new Date(d.data().scheduledAt) <= now);
    if (dueDocs.length === 0) { console.log("Nenhuma notificacao vencida."); return; }

    const tokensSnap = await db.collection("fcmTokens").get();
    const tokens = [];
    tokensSnap.forEach(d => { if (d.data().token) tokens.push(d.data().token); });

    for (const docSnap of dueDocs) {
        const data = docSnap.data();
        await docSnap.ref.update({ status: "processing" });
        try {
            if (tokens.length > 0) {
                await admin.messaging().sendEachForMulticast({
                    notification: {
                        title: data.title || "Novo aviso",
                        body: data.message || "",
                        ...(data.imageUrl ? { image: data.imageUrl } : {})
                    },
                    tokens
                });
            }
            await docSnap.ref.update({ status: "sent", sentAt: now.toISOString() });
            await db.collection("adminLogs").add({
                type: "aviso",
                message: "Aviso agendado enviado: " + data.title,
                details: "Agendado para " + data.scheduledAt + ". Enviado para " + tokens.length + " musico(s).",
                user: data.createdBy || "agendamento",
                ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
                createdAt: now.toISOString()
            });
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
    memory: "128MiB"
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Autenticacao obrigatoria.");
    }
    const { title, message, imageUrl, scheduledAt } = request.data;
    if (!title || !scheduledAt) {
        throw new HttpsError("invalid-argument", "Os campos title e scheduledAt sao obrigatorios.");
    }
    const scheduled = new Date(scheduledAt);
    if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
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
