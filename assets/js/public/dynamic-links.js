import { app } from "../firebase-config.js";
import { getFirestore, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('dynamic-links-container');
    if (!container) return;

    const linksRef = collection(db, 'dynamicLinks');
    // Pega apenas links ativos. Não podemos combinar where e orderBy em campos diferentes sem índice composto.
    // Como a ordem de criação não é estritamente necessária no público ou podemos ordenar no cliente.
    // Vamos fazer a query apenas por orderBy ou where. Firebase geralmente precisa de índice se usar where(active) + orderBy(createdAt).
    // O mais simples sem criar índice extra no Firebase console:
    const q = query(linksRef, orderBy('createdAt', 'asc'));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';

        if (snapshot.empty) {
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // Renderizar apenas se estiver ativo
            if (data.active !== true) return;
            
            const linkElement = document.createElement('a');
            linkElement.href = data.url;
            linkElement.className = 'btn-form btn-dynamic-link'; 
            linkElement.target = '_blank';
            linkElement.title = data.name;

            // Ícone padrão de link (Lucide)
            linkElement.innerHTML = `
                <span class="btn-form-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                </span>
                <span class="btn-form-label">${data.name}</span>
            `;

            container.appendChild(linkElement);
        });
    });
});
