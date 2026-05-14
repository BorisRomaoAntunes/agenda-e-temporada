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

        // Dados Extraídos
        const startY = height - 190;
        const lineSpacing = 25;

        const drawDataRow = (label, value, y) => {
            infoPage.drawText(label, { x: 50, y, size: 12, color: { type: 'RGB', red: 0.5, green: 0.5, blue: 0.5 } });
            infoPage.drawText(value || "N/A", { x: 180, y, size: 12 });
        };

        drawDataRow("Músico(a):", aiData.nome, startY);
        drawDataRow("CID:", aiData.cid, startY - lineSpacing);
        drawDataRow("Início:", aiData.data_inicio, startY - lineSpacing * 2);
        drawDataRow("Período:", `${aiData.dias} dias`, startY - lineSpacing * 3);

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
