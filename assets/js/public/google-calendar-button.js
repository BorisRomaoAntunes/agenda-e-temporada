/**
 * google-calendar-button.js — Módulo Público para o Botão Seguir Calendário OER
 * Detecta automaticamente o dispositivo (iPhone/Apple vs Android/PC)
 * e abre direto no aplicativo nativo com 1 toque.
 */

import { app } from "../firebase-config.js";
import { getFirestore, doc, onSnapshot, setDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const db = getFirestore(app);

/**
 * Registra o clique para seguir o calendário no Firestore (métricas de adesão).
 */
async function trackCalendarClick() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        const isApple = isAppleDevice();
        const platformKey = isApple ? 'calendarClicks_apple' : 'calendarClicks_google';

        // 1. Atualizar métricas diárias na coleção engagement
        const engagementDocRef = doc(db, "engagement", todayStr);
        await setDoc(engagementDocRef, {
            date: todayStr,
            timestamp: serverTimestamp(),
            calendarClicks: increment(1),
            [platformKey]: increment(1)
        }, { merge: true });

        // 2. Atualizar estatísticas acumuladas em config/stats
        const statsDocRef = doc(db, "config", "stats");
        await setDoc(statsDocRef, {
            totalCalendarClicks: increment(1),
            [platformKey]: increment(1),
            lastCalendarClickAt: new Date().toISOString()
        }, { merge: true });

        console.log(`[GoogleCalendarButton] Clique registrado com sucesso! Plataforma: ${isApple ? 'Apple' : 'Google'}`);
    } catch (err) {
        console.warn("[GoogleCalendarButton] Erro ao registrar métrica de clique:", err);
    }
}

/**
 * Detecta se o dispositivo do usuário é do ecossistema Apple (iOS, iPadOS ou macOS).
 */
function isAppleDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isMacTouch = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPad Pro
    const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/.test(ua);
    return isIOS || isMacTouch || isMac;
}

/**
 * Obtém a URL mais apropriada para o dispositivo do usuário.
 */
function getDeviceSpecificCalendarUrl(data) {
    const calendarId = data.calendarId || "69773d46e381fd83e0bd48ac4467488245c78fec1ea5315f8ab21c64314cfd25@group.calendar.google.com";
    const encodedId = encodeURIComponent(calendarId);

    if (isAppleDevice()) {
        // Protocolo nativo webcal:// para abrir diretamente no app Calendário do iPhone / Apple
        return `webcal://calendar.google.com/calendar/ical/${encodedId}/public/basic.ics`;
    } else {
        // Inscrição direta no Google Agenda para Android / Windows / Desktop
        return `https://calendar.google.com/calendar/render?cid=${encodedId}`;
    }
}

function initGoogleCalendarPublicButton() {
    const btnCalendar = document.getElementById("btnGoogleCalendarPublic");
    if (!btnCalendar) return;

    // Adiciona listener de clique para métricas (uma única vez)
    if (!btnCalendar._hasClickTracker) {
        btnCalendar._hasClickTracker = true;
        btnCalendar.addEventListener("click", () => {
            trackCalendarClick();
        });
    }

    const calendarConfigRef = doc(db, "config", "googleCalendar");

    onSnapshot(calendarConfigRef, (snapshot) => {
        if (!snapshot.exists()) {
            btnCalendar.style.display = "none";
            return;
        }

        const data = snapshot.data();
        const isEnabled = data.showButton === true;

        if (isEnabled) {
            const targetUrl = getDeviceSpecificCalendarUrl(data);
            btnCalendar.href = targetUrl;
            
            // Em dispositivos Apple, não usamos target="_blank" para que o iOS abra o app Calendário nativo sem abrir aba em branco
            if (isAppleDevice()) {
                btnCalendar.removeAttribute("target");
            } else {
                btnCalendar.setAttribute("target", "_blank");
            }

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
