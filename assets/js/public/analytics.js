import { db } from "../firebase-config.js";
import { doc, setDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

async function trackEngagement() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        const docRef = doc(db, "engagement", todayStr);
        
        // 1. Rastreamento de Visita Única (por dispositivo por dia)
        const lastVisit = localStorage.getItem('oer_last_visit');
        const isNewUniqueAccess = (lastVisit !== todayStr);

        // 2. Rastreamento de Clique de Notificação
        const urlParams = new URLSearchParams(window.location.search);
        const isFromNotification = urlParams.get('source') === 'notification';

        // Prepara o objeto de atualização
        const updateData = {
            date: todayStr,
            timestamp: serverTimestamp()
        };

        let hasUpdates = false;

        if (isNewUniqueAccess) {
            updateData.uniqueAccesses = increment(1);
            hasUpdates = true;
        }

        if (isFromNotification) {
            updateData.notificationAccesses = increment(1);
            hasUpdates = true;

            // Limpa o parâmetro da URL de forma transparente para evitar duplo incremento em F5
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('source');
                window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
            } catch (e) {
                console.error("[Analytics] Erro ao limpar query param da URL:", e);
            }
        }

        // Se houver atualizações a fazer, envia ao Firestore
        if (hasUpdates) {
            await setDoc(docRef, updateData, { merge: true });
            
            // Salva no localStorage somente após o sucesso para garantir consistência
            if (isNewUniqueAccess) {
                localStorage.setItem('oer_last_visit', todayStr);
            }
            console.log(`[Analytics] Engajamento registrado com sucesso. Visita Única: ${isNewUniqueAccess}, Via Notificação: ${isFromNotification}`);
        }
    } catch (error) {
        console.error("[Analytics] Erro ao registrar métricas de engajamento:", error);
    }
}

// Executa o rastreamento após o carregamento da página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackEngagement);
} else {
    trackEngagement();
}
