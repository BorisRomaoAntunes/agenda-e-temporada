/**
 * google-calendar-button.js — Módulo Público para o Botão Seguir Calendário OER
 * Escuta em tempo real o estado de ativação e link do Google Calendar em config/googleCalendar.
 */

import { app } from "../firebase-config.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const db = getFirestore(app);

function initGoogleCalendarPublicButton() {
    const btnCalendar = document.getElementById("btnGoogleCalendarPublic");
    if (!btnCalendar) return;

    const calendarConfigRef = doc(db, "config", "googleCalendar");

    onSnapshot(calendarConfigRef, (snapshot) => {
        if (!snapshot.exists()) {
            btnCalendar.style.display = "none";
            return;
        }

        const data = snapshot.data();
        const isEnabled = data.showButton === true;
        const targetUrl = data.subscribeUrl || data.publicUrl;

        if (isEnabled && targetUrl) {
            btnCalendar.href = targetUrl;
            btnCalendar.style.display = "flex";
            if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
                lucide.createIcons();
            }
        } else {
            btnCalendar.style.display = "none";
        }
    }, (error) => {
        console.warn("[GoogleCalendarButton] Erro ao carregar configuração do calendário:", error);
        btnCalendar.style.display = "none";
    });
}

// Inicializa quando o DOM estiver pronto
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGoogleCalendarPublicButton);
} else {
    initGoogleCalendarPublicButton();
}
