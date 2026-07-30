import { app } from "../firebase-config.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const db = getFirestore(app);

function formatAvailabilityText(availableFrom, availableUntil, isFuture = false) {
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

    if (isFuture && fromFormatted) {
        return `Disponível a partir de ${fromFormatted}`;
    }

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

    // ----- CRONÔMETRO DE INTERVALO EM TEMPO REAL -----
    let intervalTicker = null;
    const intervalRef = doc(db, 'config', 'intervalo');

    onSnapshot(intervalRef, (docSnap) => {
        const existingCard = document.getElementById('musician-countdown-card');
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            const now = new Date();
            const end = data.endTime ? (data.endTime.toDate ? data.endTime.toDate() : new Date(data.endTime)) : null;

            if (data.active === true && end && end > now) {
                let card = existingCard;
                if (!card) {
                    card = document.createElement('div');
                    card.id = 'musician-countdown-card';
                    card.className = 'btn-interval-countdown';
                    container.prepend(card);
                }

                const returnTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                card.innerHTML = `
                    <span class="btn-form-icon">
                        <i data-lucide="timer"></i>
                    </span>
                    <div style="display: flex; flex-direction: column; flex: 1; text-align: left; min-width: 0;">
                        <span class="countdown-label">Volta do Intervalo</span>
                        <span class="countdown-time" id="musician-countdown-numbers">00:00</span>
                        <span class="countdown-subtitle">ensaio retorna às <strong>${returnTime}</strong></span>
                    </div>
                `;

                if (intervalTicker) clearInterval(intervalTicker);
                const updateCountdown = () => {
                    const currentNow = new Date();
                    const diffMs = end - currentNow;
                    const numbersElem = document.getElementById('musician-countdown-numbers');

                    if (diffMs <= 0) {
                        if (numbersElem) numbersElem.textContent = '00:00';
                        if (intervalTicker) clearInterval(intervalTicker);
                        if (card) card.remove();
                        return;
                    }

                    const totalSec = Math.floor(diffMs / 1000);
                    const mins = Math.floor(totalSec / 60);
                    const secs = totalSec % 60;
                    if (numbersElem) {
                        numbersElem.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                    }
                };

                updateCountdown();
                intervalTicker = setInterval(updateCountdown, 1000);

                if (window.lucide) {
                    window.lucide.createIcons();
                }
                return;
            }
        }

        // Se inativo ou encerrado, limpa o contador e remove o card
        if (intervalTicker) {
            clearInterval(intervalTicker);
            intervalTicker = null;
        }
        if (existingCard) {
            existingCard.remove();
        }
    });

    // ----- LINKS DINÂMICOS -----
    const linksRef = collection(db, 'dynamicLinks');
    const q = query(linksRef, orderBy('createdAt', 'asc'));

    onSnapshot(q, (snapshot) => {
        // Remover links dinâmicos antigos preservando o card do intervalo se existir
        const activeIntervalCard = document.getElementById('musician-countdown-card');
        container.innerHTML = '';
        if (activeIntervalCard) {
            container.appendChild(activeIntervalCard);
        }

        if (snapshot.empty) {
            return;
        }

        const now = new Date();

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // Renderizar apenas se estiver ativo no Admin
            if (data.active !== true) return;
            
            let isFuture = false;

            // Validar janela de tempo se definida
            if (data.availableFrom) {
                const fromDate = data.availableFrom.toDate ? data.availableFrom.toDate() : new Date(data.availableFrom);
                if (!isNaN(fromDate.getTime()) && now < fromDate) {
                    isFuture = true; // Ainda não liberado -> Exibir esmaecido/desabilitado
                }
            }
            if (data.availableUntil) {
                const untilDate = data.availableUntil.toDate ? data.availableUntil.toDate() : new Date(data.availableUntil);
                if (!isNaN(untilDate.getTime()) && now > untilDate) {
                    return; // Já expirado -> Ocultar
                }
            }
            
            const linkElement = document.createElement('a');
            const iconName = data.icon || 'link';

            if (isFuture) {
                linkElement.className = 'btn-form btn-dynamic-link btn-dynamic-link-disabled'; 
                linkElement.href = 'javascript:void(0)';
                linkElement.setAttribute('aria-disabled', 'true');
                linkElement.title = `Disponível a partir de ${formatAvailabilityText(data.availableFrom, null, true)}`;

                const availabilityText = formatAvailabilityText(data.availableFrom, null, true);

                linkElement.innerHTML = `
                    <span class="btn-form-icon">
                        <i data-lucide="${iconName}"></i>
                    </span>
                    <div class="btn-dynamic-link-text-group">
                        <span class="btn-form-label">${data.name}</span>
                        <span class="btn-dynamic-link-subtitle">${availabilityText || 'Disponível em breve'}</span>
                    </div>
                `;
            } else {
                linkElement.href = data.url;
                linkElement.className = 'btn-form btn-dynamic-link'; 
                linkElement.target = '_blank';
                linkElement.title = data.name;

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
            }

            container.appendChild(linkElement);
        });

        // Inicializa ícones Lucide nos novos elementos
        if (window.lucide) {
            window.lucide.createIcons();
        }
    });
});

