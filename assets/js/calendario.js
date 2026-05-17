/**
 * calendario.js - Módulo de Calendário Interativo OER
 * Localização: assets/js/
 */

import { db } from "./firebase-config.js";
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    onSnapshot,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

class CalendarioOER {
    constructor() {
        this.container = document.getElementById('calendario-oer-container');
        if (!this.container) return;

        this.currentDate = new Date();
        this.events = [];
        this.weeklyNotices = [];
        this.filter = 'all';

        this.init();
    }

    async init() {
        this.renderSkeleton();
        this.setupListeners();
        this.loadData();
    }

    renderSkeleton() {
        this.container.innerHTML = `
            <div class="cal-header">
                <div class="cal-month-title" id="cal-month-display">...</div>
                <div class="cal-nav-btns">
                    <button class="cal-btn" id="cal-prev"><i data-lucide="chevron-left"></i></button>
                    <button class="cal-btn" id="cal-next"><i data-lucide="chevron-right"></i></button>
                </div>
            </div>

            <div class="cal-filters">
                <button class="filter-chip active" data-filter="all">Tudo</button>
                <button class="filter-chip" data-filter="ensaio_tutti">Ensaios Tutti</button>
                <button class="filter-chip" data-filter="ensaio_naipe">Ensaios Naipe</button>
                <button class="filter-chip" data-filter="concerto">Concertos</button>
            </div>

            <div id="cal-weekly-area"></div>
            <div id="cal-days-grid" class="cal-days-grid">
                <div style="text-align:center; padding: 3rem; color: #999;">
                    <i data-lucide="loader-2" class="spin" style="width: 40px; height: 40px; margin-bottom: 1rem;"></i>
                    <p>Sincronizando agenda...</p>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }

    setupListeners() {
        this.container.addEventListener('click', (e) => {
            const prevBtn = e.target.closest('#cal-prev');
            const nextBtn = e.target.closest('#cal-next');
            const filterChip = e.target.closest('.filter-chip');
            const eventCard = e.target.closest('.cal-event-card');

            if (prevBtn) {
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                this.loadData();
            }
            if (nextBtn) {
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                this.loadData();
            }
            if (filterChip) {
                this.setFilter(filterChip.getAttribute('data-filter'));
            }
            if (eventCard && !e.target.closest('a')) {
                this.toggleEventDetails(eventCard);
            }
        });
    }

    setFilter(filter) {
        this.filter = filter;
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.getAttribute('data-filter') === filter);
        });
        this.renderEvents();
    }

    async loadData() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth() + 1;
        const monthStr = String(month).padStart(2, '0');
        const startOfMonth = `${year}-${monthStr}-01`;
        const endOfMonth = `${year}-${monthStr}-31`;

        this.updateMonthDisplay();

        try {
            // 1. Carregar Eventos
            const qEvents = query(
                collection(db, "eventos"),
                where("date", ">=", startOfMonth),
                where("date", "<=", endOfMonth),
                orderBy("date", "asc")
            );

            const snapEvents = await getDocs(qEvents);
            this.events = snapEvents.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Carregar Avisos da Semana (opcional, pode ser filtrado por mesRef também ou apenas os mais recentes)
            // Por enquanto, pegamos os avisos que batem com o mês atual
            const qNotices = query(
                collection(db, "avisos_semana"),
                orderBy("createdAt", "desc")
            );
            const snapNotices = await getDocs(qNotices);
            this.weeklyNotices = snapNotices.docs
                .map(doc => doc.data())
                .filter(n => {
                    // Simples filtro: se o aviso foi criado no mês que estamos vendo
                    // Ou podemos usar uma lógica de semanaRef se implementada
                    return true; // Mostrar os últimos 3 avisos sempre por enquanto
                })
                .slice(0, 3);

            this.renderWeeklyNotices();
            this.renderEvents();

        } catch (err) {
            console.error("Erro ao carregar calendário:", err);
            document.getElementById('cal-days-grid').innerHTML = `
                <div style="color: #dc3545; text-align: center; padding: 2rem;">
                    Erro ao carregar agenda. Verifique sua conexão.
                </div>
            `;
        }
    }

    updateMonthDisplay() {
        const display = document.getElementById('cal-month-display');
        const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
        const formatted = formatter.format(this.currentDate);
        display.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    renderWeeklyNotices() {
        const area = document.getElementById('cal-weekly-area');
        if (this.weeklyNotices.length === 0) {
            area.innerHTML = '';
            return;
        }

        area.innerHTML = `
            <div class="cal-weekly-notices">
                <h4><i data-lucide="info"></i> Avisos Importantes</h4>
                ${this.weeklyNotices.map(n => `<p><strong>${n.tipo}:</strong> ${n.texto}</p>`).join('')}
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }

    renderEvents() {
        const grid = document.getElementById('cal-days-grid');
        const filteredEvents = this.filter === 'all' 
            ? this.events 
            : this.events.filter(e => e.tipo === this.filter);

        if (filteredEvents.length === 0) {
            grid.innerHTML = `
                <div style="text-align:center; padding: 4rem 2rem; color: #999;">
                    <i data-lucide="calendar-x" style="width: 48px; height: 48px; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p>Nenhum compromisso encontrado para este mês.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Agrupar por dia
        const eventsByDay = {};
        filteredEvents.forEach(e => {
            if (!eventsByDay[e.date]) eventsByDay[e.date] = [];
            eventsByDay[e.date].push(e);
        });

        grid.innerHTML = '';

        const todayStr = new Date().toISOString().split('T')[0];

        Object.keys(eventsByDay).sort().forEach(dateStr => {
            const dayEvents = eventsByDay[dateStr];
            const dateObj = new Date(dateStr + "T12:00:00"); // Avoid timezone issues
            const dayNum = dateObj.getDate();
            const dayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(dateObj).replace('.', '');
            const isToday = dateStr === todayStr;

            const row = document.createElement('div');
            row.className = 'cal-day-row';
            row.innerHTML = `
                <div class="cal-date-indicator ${isToday ? 'is-today' : ''}">
                    <span class="cal-day-num">${dayNum}</span>
                    <span class="cal-day-name">${dayName}</span>
                </div>
                <div class="cal-events-container">
                    ${dayEvents.map(e => this.createEventCard(e)).join('')}
                </div>
            `;
            grid.appendChild(row);
        });

        if (window.lucide) lucide.createIcons();
    }

    createEventCard(e) {
        const icon = e.tipo === 'concerto' ? 'music-4' : 'users';
        const typeLabel = e.tipo === 'ensaio_tutti' ? 'Ensaio Tutti' : e.tipo === 'ensaio_naipe' ? `Ensaio ${e.naipe || 'Naipe'}` : 'Concerto';
        
        return `
            <div class="cal-event-card ${e.tipo}" data-id="${e.id}">
                <div class="cal-event-time">
                    <i data-lucide="clock" style="width: 14px;"></i>
                    ${e.horarioInicio} - ${e.horarioFim}
                </div>
                <div class="cal-event-title">${e.descricaoEnsaio || e.concertoNome || 'Compromisso'}</div>
                <div class="cal-event-location">
                    <i data-lucide="map-pin" style="width: 14px;"></i>
                    <span>${e.local}</span>
                    ${e.localMapsUrl ? `<a href="${e.localMapsUrl}" target="_blank" onclick="event.stopPropagation()">(Mapa)</a>` : ''}
                </div>

                <div class="cal-event-details">
                    ${e.repertorio && e.repertorio.length > 0 ? `
                        <div class="cal-section-title">Repertório</div>
                        <ul class="cal-repertorio-list">
                            ${e.repertorio.map(item => `<li class="cal-repertorio-item">${item}</li>`).join('')}
                        </ul>
                    ` : ''}
                    
                    ${e.avisos && e.avisos.length > 0 ? `
                        <div class="cal-section-title">Observações</div>
                        <ul class="cal-avisos-list">
                            ${e.avisos.map(item => `<li class="cal-avisos-item">${item}</li>`).join('')}
                        </ul>
                    ` : ''}

                    ${e.localComplemento ? `<p style="font-size: 0.8rem; color: #888;"><strong>Dica:</strong> ${e.localComplemento}</p>` : ''}
                </div>
                
                <div style="text-align: center; margin-top: 0.5rem; color: #ccc;">
                    <i data-lucide="chevron-down" class="details-chevron" style="width: 16px;"></i>
                </div>
            </div>
        `;
    }

    toggleEventDetails(card) {
        const details = card.querySelector('.cal-event-details');
        const chevron = card.querySelector('.details-chevron');
        const isVisible = details.style.display === 'block';
        
        details.style.display = isVisible ? 'none' : 'block';
        chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        chevron.style.transition = 'transform 0.3s ease';
    }
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    new CalendarioOER();
});
