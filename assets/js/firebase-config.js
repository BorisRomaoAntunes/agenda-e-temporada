/**
 * firebase-config.js — Configuração Firebase Centralizada
 * Este arquivo é a ÚNICA fonte de verdade para a config do Firebase.
 * Todos os outros scripts (admin, version-tracker, notifications) importam daqui.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";

// ====== CONFIGURAÇÃO DO FIREBASE ======
export const firebaseConfig = {
    apiKey: "AIzaSyA_exFw1oK-xGsksVaNTr1lAYHKswzYhGM",
    authDomain: "oer-agenda.firebaseapp.com",
    projectId: "oer-agenda",
    storageBucket: "oer-agenda.firebasestorage.app",
    messagingSenderId: "1020948916905",
    appId: "1:1020948916905:web:0fe90eb1fb1b7f183c17b8"
};

// ====== CHAVE VAPID PARA WEB PUSH ======
export const VAPID_KEY = "BBAdQPGa4tQ3tJYodKvQHLqC2T8-J38SV3U4y2HGCDgKCsH6G74Jjk8lKRPXYtZ5AbzCu7baF25rm7045PJszko";

// Inicializa a instância do Firebase (única no projeto)
export const app = initializeApp(firebaseConfig);
