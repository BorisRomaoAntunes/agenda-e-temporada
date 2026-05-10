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

            const iconName = data.icon || 'link';

            linkElement.innerHTML = `
                <span class="btn-form-icon">
                    <i data-lucide="${iconName}"></i>
                </span>
                <span class="btn-form-label">${data.name}</span>
            `;

            container.appendChild(linkElement);
        });

        // Inicializa ícones Lucide nos novos elementos
        if (window.lucide) {
            window.lucide.createIcons();
        }
    });
});
