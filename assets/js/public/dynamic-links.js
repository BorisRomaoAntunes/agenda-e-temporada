import { app } from "../firebase-config.js";
import { getFirestore, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const db = getFirestore(app);

function formatAvailabilityText(availableFrom, availableUntil) {
    if (!availableFrom && !availableUntil) return '';

    const formatTime = (ts) => {
        if (!ts) return null;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return null;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const weekdayAbbr = d.toLocaleDateString('pt-BR', { weekday: 'short' });
        const capitalizedWeekday = weekdayAbbr.charAt(0).toUpperCase() + weekdayAbbr.slice(1).replace('.', '');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month} (${capitalizedWeekday}) às ${hours}:${minutes}`;
    };

    const fromFormatted = formatTime(availableFrom);
    const untilFormatted = formatTime(availableUntil);

    if (fromFormatted && untilFormatted) {
        return `Disponível de ${fromFormatted} até ${untilFormatted}`;
    } else if (fromFormatted) {
        return `Disponível a partir de ${fromFormatted}`;
    } else if (untilFormatted) {
        return `Disponível até ${untilFormatted}`;
    }
    return '';
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('dynamic-links-container');
    if (!container) return;

    const linksRef = collection(db, 'dynamicLinks');
    const q = query(linksRef, orderBy('createdAt', 'asc'));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';

        if (snapshot.empty) {
            return;
        }

        const now = new Date();

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // Renderizar apenas se estiver ativo
            if (data.active !== true) return;
            
            // Validar janela de tempo se definida
            if (data.availableFrom) {
                const fromDate = data.availableFrom.toDate ? data.availableFrom.toDate() : new Date(data.availableFrom);
                if (!isNaN(fromDate.getTime()) && now < fromDate) {
                    return; // Ainda não disponível
                }
            }
            if (data.availableUntil) {
                const untilDate = data.availableUntil.toDate ? data.availableUntil.toDate() : new Date(data.availableUntil);
                if (!isNaN(untilDate.getTime()) && now > untilDate) {
                    return; // Já expirado
                }
            }
            
            const linkElement = document.createElement('a');
            linkElement.href = data.url;
            linkElement.className = 'btn-form btn-dynamic-link'; 
            linkElement.target = '_blank';
            linkElement.title = data.name;

            const iconName = data.icon || 'link';
            const availabilityText = formatAvailabilityText(data.availableFrom, data.availableUntil);

            if (availabilityText) {
                linkElement.innerHTML = `
                    <span class="btn-form-icon">
                        <i data-lucide="${iconName}"></i>
                    </span>
                    <div class="btn-dynamic-link-text-group">
                        <span class="btn-form-label">${data.name}</span>
                        <span class="btn-dynamic-link-subtitle">${availabilityText}</span>
                    </div>
                `;
            } else {
                linkElement.innerHTML = `
                    <span class="btn-form-icon">
                        <i data-lucide="${iconName}"></i>
                    </span>
                    <span class="btn-form-label">${data.name}</span>
                `;
            }

            container.appendChild(linkElement);
        });

        // Inicializa ícones Lucide nos novos elementos
        if (window.lucide) {
            window.lucide.createIcons();
        }
    });
});
