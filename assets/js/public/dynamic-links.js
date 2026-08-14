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

// ----- ESTRUTURA DO MODAL POP-UP (CRIADA DINAMICAMENTE SE NÃO EXISTIR) -----
function ensurePopupModalDOM() {
    let overlay = document.getElementById('link-popup-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'link-popup-modal-overlay';
        overlay.className = 'popup-modal-overlay';
        overlay.innerHTML = `
            <div class="popup-modal-card" id="popup-modal-card">
                <button type="button" class="popup-modal-close" id="btn-close-popup-modal" aria-label="Fechar">
                    <i data-lucide="x"></i>
                </button>
                <div class="popup-modal-image-container" id="popup-modal-image-container" style="display: none;">
                    <img id="popup-modal-image" src="" alt="Capa" referrerpolicy="no-referrer">
                </div>
                <div class="popup-modal-body">
                    <div class="popup-modal-icon-badge">
                        <i data-lucide="share-2" id="popup-modal-icon"></i>
                    </div>
                    <h3 class="popup-modal-title" id="popup-modal-title">Destaque Especial</h3>
                    <div class="popup-modal-actions">
                        <button type="button" class="btn-popup-share" id="btn-popup-share-action">
                            <i data-lucide="share-2"></i>
                            <span>Compartilhar</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Eventos de Fechamento
        const btnClose = overlay.querySelector('#btn-close-popup-modal');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                overlay.classList.remove('active');
            });
        }

        // Fechar ao clicar fora do card
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    }
    return overlay;
}

// ----- FUNÇÃO DE COMPARTILHAMENTO NATIVO / FALLBACK -----
async function handleShare(data) {
    const title = data.name || 'Destaque OER';
    const text = data.name || 'Confira este destaque';
    const url = data.url;

    if (navigator.share) {
        try {
            await navigator.share({
                title: title,
                text: text,
                url: url
            });
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Erro ao abrir o compartilhamento nativo:', err);
                copyToClipboard(url);
            }
        }
    } else {
        copyToClipboard(url);
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Link copiado para a área de transferência!');
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast('Link copiado para a área de transferência!');
    } catch (err) {
        console.error('Erro ao copiar link:', err);
    }
    document.body.removeChild(textArea);
}

function showToast(message) {
    let toast = document.getElementById('popup-share-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'popup-share-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #141419;
            color: #fff;
            padding: 12px 24px;
            border-radius: 30px;
            border: 1px solid rgba(138, 43, 226, 0.4);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            font-size: 0.9rem;
            font-weight: 500;
            z-index: 100000;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i data-lucide="check-circle-2" style="width: 18px; height: 18px; color: #2E8B57;"></i> ${message}`;
    if (window.lucide) window.lucide.createIcons();

    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
    }, 3000);
}

// ----- EXIBIR POP-UP MODAL NA TELA -----
function openPopupModal(data) {
    const overlay = ensurePopupModalDOM();
    const titleEl = overlay.querySelector('#popup-modal-title');
    const imageContainer = overlay.querySelector('#popup-modal-image-container');
    const imageEl = overlay.querySelector('#popup-modal-image');
    const iconEl = overlay.querySelector('#popup-modal-icon');
    const btnShare = overlay.querySelector('#btn-popup-share-action');
    const cardEl = overlay.querySelector('#popup-modal-card');

    if (titleEl) titleEl.textContent = data.name || 'Destaque';
    
    const iconName = data.icon || 'share-2';
    if (iconEl) iconEl.setAttribute('data-lucide', iconName);

    if (data.imageUrl && imageContainer && imageEl) {
        imageEl.onerror = () => {
            if (imageContainer) imageContainer.style.display = 'none';
        };
        imageEl.setAttribute('referrerpolicy', 'no-referrer');
        imageEl.src = data.imageUrl;
        imageContainer.style.display = 'block';
    } else if (imageContainer) {
        imageContainer.style.display = 'none';
        if (imageEl) imageEl.src = '';
    }

    if (btnShare) {
        const newBtn = btnShare.cloneNode(true);
        btnShare.parentNode.replaceChild(newBtn, btnShare);
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleShare(data);
        });
    }

    if (cardEl) {
        cardEl.onclick = (e) => {
            if (e.target.closest('#btn-close-popup-modal')) return;
            handleShare(data);
        };
    }

    if (window.lucide) window.lucide.createIcons();
    overlay.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('dynamic-links-container');
    if (!container) return;

    // ----- CRÔNOMETRO DE INTERVALO EM TEMPO REAL -----
    let intervalTicker = null;
    let isIntervalActive = false;
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

                    if (totalSec <= 60) {
                        card.classList.add('urgent');
                        card.classList.remove('warning');
                    } else if (totalSec <= 300) {
                        card.classList.add('warning');
                        card.classList.remove('urgent');
                    } else {
                        card.classList.remove('urgent');
                        card.classList.remove('warning');
                    }
                };

                updateCountdown();
                intervalTicker = setInterval(updateCountdown, 1000);

                isIntervalActive = true;
                container.querySelectorAll('.btn-dynamic-link').forEach(el => {
                    el.style.display = 'none';
                });

                if (window.lucide) window.lucide.createIcons();
                return;
            }
        }

        isIntervalActive = false;
        if (intervalTicker) { clearInterval(intervalTicker); intervalTicker = null; }
        if (existingCard) existingCard.remove();
        container.querySelectorAll('.btn-dynamic-link').forEach(el => {
            el.style.display = '';
        });
    });

    // ----- LINKS DINÂMICOS -----
    const linksRef = collection(db, 'dynamicLinks');
    const q = query(linksRef, orderBy('createdAt', 'asc'));

    onSnapshot(q, (snapshot) => {
        const activeIntervalCard = document.getElementById('musician-countdown-card');
        container.innerHTML = '';
        if (activeIntervalCard) container.appendChild(activeIntervalCard);

        if (snapshot.empty) {
            return;
        }

        const now = new Date();

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            if (data.active !== true) return;
            
            let isFuture = false;

            if (data.availableFrom) {
                const fromDate = data.availableFrom.toDate ? data.availableFrom.toDate() : new Date(data.availableFrom);
                if (!isNaN(fromDate.getTime()) && now < fromDate) {
                    isFuture = true;
                }
            }
            if (data.availableUntil) {
                const untilDate = data.availableUntil.toDate ? data.availableUntil.toDate() : new Date(data.availableUntil);
                if (!isNaN(untilDate.getTime()) && now > untilDate) {
                    return;
                }
            }

            const iconName = data.icon || 'link';

            // Se for do tipo POP-UP e estiver ativo/liberado:
            if (data.isPopup === true && !isFuture) {
                openPopupModal(data);

                const linkElement = document.createElement('a');
                linkElement.href = 'javascript:void(0)';
                linkElement.className = 'btn-form btn-dynamic-link btn-popup-link';
                linkElement.title = data.name;
                linkElement.innerHTML = `
                    <span class="btn-form-icon" style="background: rgba(139, 0, 0, 0.2); color: #ef5350;">
                        <i data-lucide="${iconName}"></i>
                    </span>
                    <span class="btn-form-label">${data.name}</span>

                `;
                linkElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    openPopupModal(data);
                });
                container.appendChild(linkElement);
                return;
            }
            
            // Botão tradicional
            const linkElement = document.createElement('a');

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

        if (window.lucide) {
            window.lucide.createIcons();
        }

        if (isIntervalActive) {
            container.querySelectorAll('.btn-dynamic-link').forEach(el => {
                el.style.display = 'none';
            });
        }
    });
});
