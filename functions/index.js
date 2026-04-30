const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

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
