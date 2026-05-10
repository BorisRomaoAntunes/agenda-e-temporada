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

// ====== CONEXÃO COM EMULADORES (TESTE LOCAL) ======
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// ====== MODO DE EXECUÇÃO (Lido do localStorage ou padrão false) ======
const USE_EMULATORS = localStorage.getItem('USE_EMULATORS') === 'true'; 

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");
const storage = getStorage(app);

if (USE_EMULATORS && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    console.log("🛠️ Conectando aos emuladores locais...");
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
    connectStorageEmulator(storage, "localhost", 9199);
} else {
    console.log("🌐 Conectado ao Firebase Produção.");
}


export { auth, db, functions, storage };
