const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const { FieldValue } = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
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

            const storedCount = statsSnap.exists() ? (statsSnap.data().subscriberCount || 0) : 0;
            const previousCount = dailySnap.exists() ? (dailySnap.data().lastCount || 0) : 0;

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
                    message: "Auto-Cura: Contador de inscritos sincronizado.",
                    details: `O sistema detectou uma divergência (armazenado: ${storedCount}, real: ${actualTokenCount}) e realizou a correção automática.`,
                    user: "Sistema",
                    createdAt: new Date().toISOString()
                });
            }

            // 3. Log de tendência (Robô OER)
            if (currentCount !== previousCount) {
                const diff = currentCount - previousCount;
                const trend = diff > 0 ? "aumento" : "queda";
                
                const logMessage = `Monitoramento Diário: Houve uma ${trend} no número de inscritos.`;
                const logDetails = `Total atual: ${currentCount} músicos. Variação: ${diff > 0 ? "+" : ""}${diff} desde a última verificação.`;

                transaction.set(logsRef.doc(), {
                    type: "bot",
                    message: logMessage,
                    details: logDetails,
                    user: "Robô OER",
                    createdAt: new Date().toISOString()
                });
                console.log(`Log do robô registrado: ${currentCount} inscritos (${diff > 0 ? "+" : ""}${diff})`);
            } else {
                console.log(`Nenhuma alteração real no número de inscritos (${currentCount}).`);
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
 * Gera uma sugestão de título e corpo para notificação push usando IA.
 */
exports.suggestNotificationText = onCall({
    region: "us-central1", // Ou sua região padrão
    maxInstances: 10,
    memory: "512MiB"
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

            // NOVO: Adiciona ao histórico de avisos do site e atualiza o letreiro
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
