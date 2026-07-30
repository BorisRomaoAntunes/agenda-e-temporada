/**
 * OER Admin Panel — admin_preview.js v2
 * Lógica completa do protótipo: navegação, busca, músicos, avisos,
 * calendário, uploads, links, ajustes e toasts.
 */

/* ============================================
   MOCK DATA
   ============================================ */
const MUSICOS_MOCK = [
    { id:"m1", nomeArtistico:"Ana Beatriz Costa", nomeRegistro:"Ana Beatriz da Costa Silva", instrumento:"Violino I", status:"bolsista", escalado:"Sim", telefone:"(11) 99201-3344", email:"ana.beatriz@oer.com.br", cpf:"123.456.789-00", rg:"45.678.901-2", pis:"12345678900", banco:"Nubank", agencia:"0001", conta:"12345678-9", genero:"Feminino", nascimento:"2000-04-15", anos:"3 anos", tempo:"3 anos e 2 meses", inicioContrato:"2023-03-01", terminoContrato:"2026-02-28", tipoContrato:"Bolsa Integral", endereco:"Rua das Flores, 123, Bela Vista", cep:"01310-100", restricao:"Amendoim (alergia grave)", carro:"Branco • Honda Fit • ABC-1234", presencas:42, faltas:3, atrasos:1, atestados:[{nome:"Atestado Médico", data:"Abr/2026", arquivo:"at_abr26.pdf"}] },
    { id:"m2", nomeArtistico:"Bruno Mendes", nomeRegistro:"Bruno Rodrigues Mendes", instrumento:"Violoncelo", status:"bolsista", escalado:"Sim", telefone:"(11) 98765-4321", email:"bruno.mendes@oer.com.br", cpf:"987.654.321-00", rg:"78.901.234-5", pis:"98765432100", banco:"Caixa", agencia:"0072", conta:"00123456-7", genero:"Masculino", nascimento:"1998-07-22", anos:"5 anos", tempo:"5 anos e 7 meses", inicioContrato:"2021-01-01", terminoContrato:"2026-12-31", tipoContrato:"Bolsa com Monitor", endereco:"Av. Paulista, 456, ap. 12", cep:"01310-200", restricao:"Nenhuma", carro:"Preto • Fiat Uno • DEF-5678", presencas:58, faltas:1, atrasos:0, atestados:[] },
    { id:"m3", nomeArtistico:"Clara Nakamura", nomeRegistro:"Clara Hiromi Nakamura", instrumento:"Flauta Transversal", status:"monitor", escalado:"Sim", telefone:"(11) 97654-3210", email:"clara.nakamura@oer.com.br", cpf:"111.222.333-44", rg:"11.222.333-4", pis:"11122233344", banco:"Itaú", agencia:"4571", conta:"98765-4", genero:"Feminino", nascimento:"1996-11-10", anos:"7 anos", tempo:"7 anos e 1 mês", inicioContrato:"2019-06-01", terminoContrato:"2026-05-31", tipoContrato:"Monitor Sênior", endereco:"Rua Augusta, 789", cep:"01305-100", restricao:"Lactose", carro:"Não possui", presencas:65, faltas:0, atrasos:2, atestados:[{nome:"Atestado Físico", data:"Jan/2026", arquivo:"at_jan26.pdf"}] },
    { id:"m4", nomeArtistico:"Diego Souza", nomeRegistro:"Diego Almeida Souza", instrumento:"Trombone", status:"bolsista", escalado:"Não", telefone:"(11) 91234-5678", email:"diego.souza@oer.com.br", cpf:"555.666.777-88", rg:"55.666.777-8", pis:"55566677788", banco:"Bradesco", agencia:"1234", conta:"567890-1", genero:"Masculino", nascimento:"2001-02-28", anos:"2 anos", tempo:"2 anos e 4 meses", inicioContrato:"2024-03-01", terminoContrato:"2027-02-28", tipoContrato:"Bolsa Integral", endereco:"Rua Vergueiro, 1010", cep:"04102-000", restricao:"Nenhuma", carro:"Não possui", presencas:24, faltas:5, atrasos:3, atestados:[{nome:"Atestado Médico", data:"Mai/2026", arquivo:"at_mai26.pdf"},{nome:"Declaração Médica", data:"Jun/2026", arquivo:"at_jun26.pdf"}] },
    { id:"m5", nomeArtistico:"Elena Pires", nomeRegistro:"Elena Cristina Pires", instrumento:"Violino II", status:"convidado", escalado:"Sim", telefone:"(11) 93456-7890", email:"elena.pires@email.com", cpf:"222.333.444-55", rg:"22.333.444-5", pis:"22233344455", banco:"Santander", agencia:"3030", conta:"12345-6", genero:"Feminino", nascimento:"1992-09-05", anos:"1 ano", tempo:"8 meses", inicioContrato:"2025-10-01", terminoContrato:"2026-09-30", tipoContrato:"Convidada Temporada", endereco:"Rua da Consolação, 500", cep:"01301-000", restricao:"Nenhuma", carro:"Prata • Toyota Corolla • GHI-9012", presencas:18, faltas:2, atrasos:1, atestados:[] },
    { id:"m6", nomeArtistico:"Felipe Carvalho", nomeRegistro:"Felipe Augusto Carvalho", instrumento:"Oboé", status:"monitor", escalado:"Sim", telefone:"(11) 94567-8901", email:"felipe.carvalho@oer.com.br", cpf:"333.444.555-66", rg:"33.444.555-6", pis:"33344455566", banco:"Nubank", agencia:"0001", conta:"56789012-3", genero:"Masculino", nascimento:"1994-06-18", anos:"6 anos", tempo:"6 anos e 3 meses", inicioContrato:"2020-04-01", terminoContrato:"2026-03-31", tipoContrato:"Monitor Titular", endereco:"Al. Santos, 200, Jardim Paulista", cep:"01419-001", restricao:"Glúten (intolerância)", carro:"Cinza • VW Golf • JKL-3456", presencas:72, faltas:2, atrasos:0, atestados:[] },
];

let AVISOS_DATA = [
    { id:"av1", title:"Ensaio de Naipe — Metais", message:"Lembramos que amanhã haverá ensaio de naipe exclusivo para os metais às 18h na Sala 2. Presença obrigatória.", sentAt:"29/06/2026 08:30", status:"active", link:"", scheduledFor:null },
    { id:"av2", title:"Alteração de Cronograma — Julio", message:"O ensaio tutti de sexta-feira 04/07 foi antecipado para quinta-feira 03/07 às 14h. Favor confirmar presença.", sentAt:"27/06/2026 16:45", status:"sent", link:"https://oer.com.br/cronograma", scheduledFor:null },
    { id:"av3", title:"Pesquisa de Repertório 2027", message:"Participe da nossa pesquisa anual sobre preferências de repertório para a próxima temporada. Sua opinião é muito importante!", sentAt:null, status:"scheduled", link:"https://forms.gle/xyz123", scheduledFor:"05/07/2026 09:00" },
    { id:"av4", title:"Publicação da Temporada 2026/2027", message:"O PDF da nova Temporada foi atualizado. Acesse a aba Temporada & Agenda para conferir o novo repertório.", sentAt:"20/06/2026 10:00", status:"sent", link:"", scheduledFor:null },
];

let LINKS_DATA = [
    { id:"lk1", icon:"ticket", name:"Ingresso Concerto Julho", url:"https://ingressos.com/oer-julho", active:true, createdAt:"28/06/2026", availableUntil:"31/07/2026 23:59" },
    { id:"lk2", icon:"file-text", name:"Formulário de Férias", url:"https://forms.gle/ferias2026", active:true, createdAt:"25/06/2026", availableUntil:null },
    { id:"lk3", icon:"external-link", name:"Regulamento OER", url:"https://oer.com.br/regulamento", active:false, createdAt:"01/06/2026", availableUntil:null },
];

let EVENTOS_DATA = [
    { id:"ev1", tipo:"ensaio_tutti", status:"Confirmado", descricao:"Tutti — Programa Dvorák", concerto:"Dvorák Sinfonia nº 8", naipe:"", data:"2026-07-01", inicio:"19:00", fim:"22:00", local:"Sala de Ensaio OSM/OER", complemento:"Prédio Corpos Estáveis", maps:"", avisos:"Trazer partituras novas\nEntrada pelo portão lateral", repertorio:"DVOŘÁK Sinfonia nº 8" },
    { id:"ev2", tipo:"ensaio_naipe", status:"Confirmado", descricao:"Naipe de Cordas", concerto:"Metacosmos", naipe:"Violoncelos e Violas", data:"2026-07-03", inicio:"14:00", fim:"17:00", local:"Sala de Ensaio 2", complemento:"Prédio Corpos Estáveis", maps:"", avisos:"", repertorio:"RIPKE Metacosmos" },
    { id:"ev3", tipo:"concerto", status:"Confirmado", descricao:"Concerto de Abertura", concerto:"Temporada 2026", naipe:"", data:"2026-07-15", inicio:"20:00", fim:"22:30", local:"Teatro Municipal de São Paulo", complemento:"", maps:"", avisos:"Usar traje preto completo\nChegada até 19h", repertorio:"DVOŘÁK Sinfonia nº 8\nRIPKE Metacosmos" },
    { id:"ev4", tipo:"ensaio_tutti", status:"Cancelado", descricao:"Tutti — Geral", concerto:"", naipe:"", data:"2026-07-08", inicio:"19:00", fim:"22:00", local:"Sala de Ensaio OSM/OER", complemento:"", maps:"", avisos:"CANCELADO por motivos de reforma", repertorio:"" },
    { id:"ev5", tipo:"ensaio_tutti", status:"Confirmado", descricao:"Tutti — Programa Final", concerto:"Dvorák Sinfonia nº 8", naipe:"", data:"2026-07-22", inicio:"19:00", fim:"22:00", local:"Sala de Ensaio OSM/OER", complemento:"Prédio Corpos Estáveis", maps:"", avisos:"Passagem geral com regente convidado", repertorio:"DVOŘÁK Sinfonia nº 8" },
];

const ATESTADOS_MOCK = [
    { musico:"Diego Souza", instrumento:"Trombone", motivo:"Afecção respiratória — Bronquite", periodo:"26/06 a 02/07/2026", ia:"Válido", statusIa:"approve" },
    { musico:"Ana Beatriz Costa", instrumento:"Violino I", motivo:"Tendinite no punho direito — repouso 5 dias", periodo:"28/06 a 03/07/2026", ia:"Válido", statusIa:"approve" },
];

const LOGS_MOCK = [
    { cat:"pdf", msg:"PDF da Temporada atualizado — versão 2.3", date:"Hoje, 10:42" },
    { cat:"aviso", msg:"Aviso enviado: "Ensaio de Naipe — Metais"", date:"Hoje, 08:30" },
    { cat:"bot", msg:"Atestado de Diego Souza aprovado pela IA", date:"Ontem, 17:22" },
    { cat:"links", msg:"Link "Ingresso Concerto Julho" criado", date:"Ontem, 14:10" },
    { cat:"sistema", msg:"Toggle "Letreiro" ativado pelo Inspetor", date:"27/06/2026, 09:00" },
    { cat:"aviso", msg:"Aviso agendado: "Pesquisa de Repertório 2027"", date:"26/06/2026, 15:55" },
];

/* ============================================
   ESTADO GLOBAL
   ============================================ */
let currentFilter     = "all";
let currentNotifFilter = "all";
let currentCalMonth    = 6; // 0-indexed (Julho = 6)
let currentCalYear     = 2026;
let selectedIcon       = "link";
let editingEventId     = null;
let pdfVersions        = { temporada: "2.3", agenda: "3.1" };

/* ============================================
   INICIALIZAÇÃO
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initSuperSearch();
    initTheme();
    initDashboard();
    initMusicos();
    initAvisos();
    initCalendario();
    initArquivos();
    initLinks();
    initModals();
    initIconPicker();
    updateDashboardStats();
    focusSearchOnSlash();
});

/* ============================================
   NAVEGAÇÃO (SIDEBAR + BOTTOM NAV)
   ============================================ */
function initNav() {
    const allNavBtns = document.querySelectorAll('[data-target]');
    allNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            if (target) goToSection(target);
        });
    });

    // Sidebar: Settings
    document.getElementById('btn-open-settings')?.addEventListener('click', () => openModal('settings-modal'));
    document.getElementById('btn-open-settings-header')?.addEventListener('click', () => openModal('settings-modal'));

    // Bottom sheet "Mais"
    document.getElementById('btn-open-bottom-sheet')?.addEventListener('click', openBottomSheet);
    document.getElementById('bottom-sheet-overlay')?.addEventListener('click', closeBottomSheet);

    // Drawer
    document.getElementById('drawer-backdrop')?.addEventListener('click', closeDrawer);
    document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);

    // Drawer Tabs
    document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.drawer-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target)?.classList.add('active');
        });
    });

    // Fechar icon picker ao clicar fora
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('btn-icon-picker')?.closest('.icon-picker-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            document.getElementById('icon-picker-dropdown-links')?.classList.remove('open');
        }
    });
}

function goToSection(sectionId) {
    document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');

    const allNavBtns = document.querySelectorAll('.nav-item, .bottom-nav-item');
    allNavBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === sectionId);
    });

    // Reinitialize icons for newly shown section
    setTimeout(() => lucide.createIcons(), 80);
}

/* ============================================
   SUPER BUSCA
   ============================================ */
function initSuperSearch() {
    const input = document.getElementById('super-search');
    const dropdown = document.getElementById('search-results-dropdown');
    const container = document.getElementById('search-results-container');

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) { dropdown.classList.remove('active'); return; }

        const results = MUSICOS_MOCK.filter(m =>
            m.nomeArtistico.toLowerCase().includes(q) ||
            m.instrumento.toLowerCase().includes(q) ||
            m.cpf?.includes(q) ||
            m.email?.toLowerCase().includes(q) ||
            m.telefone?.includes(q) ||
            m.carro?.toLowerCase().includes(q) ||
            m.status?.toLowerCase().includes(q)
        );

        if (!results.length) {
            container.innerHTML = `<div class="no-results">Nenhum músico encontrado para "<strong>${q}</strong>"</div>`;
        } else {
            container.innerHTML = `
                <div class="results-section-title">Músicos encontrados (${results.length})</div>
                ${results.map(m => `
                    <div class="result-item" onclick="openDrawer('${m.id}');closeSearch();">
                        <div class="result-musico-info">
                            <div class="result-avatar">${m.nomeArtistico.slice(0,2).toUpperCase()}</div>
                            <div>
                                <div class="result-name">${highlightQuery(m.nomeArtistico, q)}</div>
                                <div class="result-subtitle">${m.instrumento} — ${m.email}</div>
                            </div>
                        </div>
                        <span class="result-badge ${m.status}">${m.status}</span>
                    </div>
                `).join('')}
            `;
        }
        dropdown.classList.add('active');
        setTimeout(() => lucide.createIcons(), 50);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearch();
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) closeSearch();
    });
}

function closeSearch() {
    document.getElementById('search-results-dropdown')?.classList.remove('active');
}

function highlightQuery(text, q) {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return text.replace(re, '<strong>$1</strong>');
}

function focusSearchOnSlash() {
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            document.getElementById('super-search')?.focus();
        }
    });
}

/* ============================================
   TEMA
   ============================================ */
function initTheme() {
    const saved = localStorage.getItem('oer-admin-theme');
    if (saved === 'dark') applyTheme('dark');

    document.getElementById('theme-toggle').addEventListener('click', () => {
        const isDark = document.documentElement.dataset.theme === 'dark';
        applyTheme(isDark ? 'light' : 'dark');
    });
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('oer-admin-theme', theme);
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    setTimeout(() => lucide.createIcons(), 30);
}

/* ============================================
   DASHBOARD
   ============================================ */
function initDashboard() {
    // Data
    const now = new Date();
    const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
    const label = now.toLocaleDateString('pt-BR', opts);
    const el = document.getElementById('dash-date-label');
    if (el) el.textContent = label.charAt(0).toUpperCase() + label.slice(1);

    // Agenda de hoje
    const todayStr = now.toISOString().split('T')[0];
    const todayEvents = EVENTOS_DATA.filter(e => e.data === todayStr);
    const agendaEl = document.getElementById('dash-agenda-list');
    if (agendaEl) {
        if (!todayEvents.length) {
            agendaEl.innerHTML = '<div class="agenda-empty"><i data-lucide="calendar-x" style="margin:0 auto .4rem;display:block;width:28px;height:28px;color:var(--text-muted);"></i>Nenhum evento para hoje.</div>';
        } else {
            agendaEl.innerHTML = todayEvents.map(e => buildAgendaItem(e)).join('');
        }
    }

    // Atestados
    const atEl = document.getElementById('dash-atestados-list');
    if (atEl) {
        if (!ATESTADOS_MOCK.length) {
            atEl.innerHTML = '<div class="atestado-dash-empty">✅ Nenhum atestado pendente.</div>';
        } else {
            atEl.innerHTML = ATESTADOS_MOCK.map(a => `
                <div class="atestado-dash-card">
                    <div class="atestado-dash-header">
                        <div>
                            <div class="atestado-dash-musico">${a.musico}</div>
                            <div class="atestado-dash-meta">${a.instrumento} — ${a.periodo}</div>
                        </div>
                        <span class="atestado-dash-ia"><i data-lucide="sparkles"></i>${a.ia}</span>
                    </div>
                    <div class="atestado-dash-body">${a.motivo}</div>
                    <div class="atestado-dash-actions">
                        <button class="btn-dash-action approve" onclick="showToast('Atestado aprovado!','success')">
                            <i data-lucide="check"></i> Aprovar
                        </button>
                        <button class="btn-dash-action view" onclick="showToast('Abrindo documento...','info')">
                            <i data-lucide="eye"></i> Ver PDF
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    // Logs
    const logsEl = document.getElementById('dash-logs-list');
    if (logsEl) {
        logsEl.innerHTML = LOGS_MOCK.map(l => `
            <div class="log-dash-item">
                <span class="log-dash-cat ${l.cat}">${l.cat.toUpperCase()}</span>
                <div class="log-dash-info">
                    <div class="log-dash-msg">${l.msg}</div>
                    <div class="log-dash-date">${l.date}</div>
                </div>
            </div>
        `).join('');
    }
}

function buildAgendaItem(e) {
    const tipos = { ensaio_tutti:'Ensaio Tutti', ensaio_naipe:'Ensaio de Naipe', concerto:'Concerto' };
    return `
        <div class="agenda-item">
            <div class="agenda-item-left">
                <div class="agenda-time-badge">
                    <span class="agenda-time-start">${e.inicio}</span>
                    <span class="agenda-time-end">${e.fim}</span>
                </div>
                <div>
                    <span class="agenda-type">${tipos[e.tipo] || e.tipo}</span>
                    <span class="agenda-title">${e.descricao}${e.concerto ? ` — ${e.concerto}` : ''}</span>
                    <span class="agenda-location"><i data-lucide="map-pin"></i>${e.local}</span>
                </div>
            </div>
            <span class="agenda-status-tag" style="${e.status==='Cancelado' ? 'background:var(--danger-light);color:var(--danger)' : ''}">${e.status}</span>
        </div>
    `;
}

function updateDashboardStats() {
    const total = MUSICOS_MOCK.length;
    const bolsistas = MUSICOS_MOCK.filter(m => m.status === 'bolsista').length;
    const monitores = MUSICOS_MOCK.filter(m => m.status === 'monitor').length;
    const pendentes = ATESTADOS_MOCK.length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-membros', total);
    set('stat-bolsistas-val', bolsistas);
    set('stat-monitores-val', monitores);
    set('stat-pendentes-val', pendentes);
    set('stat-total-musicos', total);
    set('stat-bolsistas-musicos', bolsistas);
    set('stat-monitores-musicos', monitores);
    const restricoes = MUSICOS_MOCK.filter(m => m.restricao && m.restricao !== 'Nenhuma').length;
    set('stat-restricoes-musicos', restricoes);
    const badge = document.getElementById('badge-pendentes');
    if (badge) badge.textContent = pendentes;
}

/* ============================================
   MÚSICOS
   ============================================ */
function initMusicos() {
    renderMusicosTable(MUSICOS_MOCK);
    updateDashboardStats();

    // Busca reativa
    document.getElementById('musicos-search')?.addEventListener('input', function() {
        filterMusicos(this.value, currentFilter);
    });

    // Filtros em pills
    document.querySelectorAll('#musicos-filter-pills .filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#musicos-filter-pills .filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            filterMusicos(document.getElementById('musicos-search')?.value || '', currentFilter);
        });
    });

    // Stat cards clicáveis
    document.querySelectorAll('.clickable-stat').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.clickable-stat').forEach(c => c.classList.remove('active-filter'));
            card.classList.add('active-filter');
            currentFilter = card.dataset.filter;
            document.querySelectorAll('#musicos-filter-pills .filter-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.filter === currentFilter);
            });
            filterMusicos(document.getElementById('musicos-search')?.value || '', currentFilter);
        });
    });

    // Relatórios
    document.getElementById('btn-report-ficha')?.addEventListener('click', () => showToast('Gerando Ficha Técnica... (PDF simulado)', 'info'));
    document.getElementById('btn-report-metas')?.addEventListener('click', () => showToast('Gerando Resumo de Metas...', 'info'));
    document.getElementById('btn-report-presenca')?.addEventListener('click', () => showToast('Gerando Lista de Presença...', 'info'));
    document.getElementById('btn-report-faltas')?.addEventListener('click', () => showToast('Gerando Relatório de Faltas...', 'info'));

    lucide.createIcons();
}

function filterMusicos(query, filter) {
    const q = query.toLowerCase().trim();
    const filtered = MUSICOS_MOCK.filter(m => {
        const matchFilter = filter === 'all' || m.status === filter;
        const matchQuery = !q || 
            m.nomeArtistico.toLowerCase().includes(q) ||
            m.instrumento.toLowerCase().includes(q) ||
            m.cpf?.includes(q) ||
            m.email?.toLowerCase().includes(q) ||
            m.telefone?.includes(q) ||
            m.carro?.toLowerCase().includes(q) ||
            m.status?.toLowerCase().includes(q);
        return matchFilter && matchQuery;
    });
    renderMusicosTable(filtered);
}

function renderMusicosTable(musicos) {
    const tbody = document.getElementById('musicos-table-body');
    const label = document.getElementById('table-showing-label');
    if (!tbody) return;

    tbody.innerHTML = musicos.map(m => `
        <tr onclick="openDrawer('${m.id}')">
            <td>
                <div class="musico-cell-info">
                    <div class="musico-cell-avatar">${m.nomeArtistico.slice(0,2).toUpperCase()}</div>
                    <span class="musico-cell-name">${m.nomeArtistico}</span>
                </div>
            </td>
            <td>${m.instrumento}</td>
            <td><span class="status-badge ${m.status}">${m.status}</span></td>
            <td>${m.telefone}</td>
            <td>${m.email}</td>
        </tr>
    `).join('');

    if (label) label.textContent = `Exibindo ${musicos.length} de ${MUSICOS_MOCK.length} músicos`;
}

/* ============================================
   DRAWER FICHA 360°
   ============================================ */
function openDrawer(id) {
    const m = MUSICOS_MOCK.find(x => x.id === id);
    if (!m) return;

    const calc = (n) => {
        if (!n) return '–';
        const [y,mo,d] = n.split('-');
        const age = new Date().getFullYear() - parseInt(y);
        return `${d}/${mo}/${y} (${age} anos)`;
    };

    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val || '–'; };

    document.getElementById('drawer-avatar').textContent = m.nomeArtistico.slice(0,2).toUpperCase();
    set('drawer-nome-artistico', m.nomeArtistico);
    set('drawer-instrumento-header', m.instrumento);
    set('dw-nome-registro', m.nomeRegistro);
    set('dw-genero', m.genero);
    set('dw-idade', calc(m.nascimento));
    set('dw-status', m.status);
    set('dw-escalado', m.escalado);
    set('dw-anos-oer', m.anos);
    set('dw-tempo-oer', m.tempo);
    set('dw-inicio-contrato', formatDate(m.inicioContrato));
    set('dw-termino-contrato', formatDate(m.terminoContrato));
    set('dw-tipo-contrato', m.tipoContrato);
    set('dw-email', m.email);
    set('dw-telefone', m.telefone);
    set('dw-cpf', m.cpf);
    set('dw-rg', m.rg);
    set('dw-pis', m.pis);
    set('dw-banco', m.banco);
    set('dw-agencia', m.agencia);
    set('dw-conta', m.conta);
    set('dw-mini-presencas', m.presencas);
    set('dw-mini-faltas', m.faltas);
    set('dw-mini-atrasos', m.atrasos);
    set('dw-endereco', m.endereco);
    set('dw-cep', m.cep);
    set('dw-restricao', m.restricao);
    set('dw-carro', m.carro);

    // Atestados
    const atEl = document.getElementById('dw-atestados-list');
    if (atEl) {
        if (!m.atestados?.length) {
            atEl.innerHTML = '<div class="drawer-list-empty">Nenhum atestado registrado.</div>';
        } else {
            atEl.innerHTML = m.atestados.map(a => `
                <div class="drawer-list-item">
                    <div class="drawer-list-item-left">
                        <div class="drawer-list-item-title">${a.nome}</div>
                        <div class="drawer-list-item-sub">${a.data}</div>
                    </div>
                    <button class="btn-list-download" onclick="showToast('Abrindo PDF...','info')">
                        <i data-lucide="download" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            `).join('');
        }
    }

    // WhatsApp e Copiar
    document.getElementById('dw-btn-whatsapp').onclick = () => {
        const num = m.telefone.replace(/\D/g, '');
        window.open(`https://wa.me/55${num}`, '_blank');
    };
    document.getElementById('dw-btn-copy').onclick = () => {
        const text = `🎻 *Ficha OER — ${m.nomeArtistico}*\nInstrumento: ${m.instrumento}\nStatus: ${m.status}\nTelefone: ${m.telefone}\nE-mail: ${m.email}`;
        navigator.clipboard.writeText(text).then(() => showToast('Ficha copiada!', 'success'));
    };

    // Reset tabs
    document.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.drawer-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.drawer-tab-btn')?.classList.add('active');
    document.getElementById('dw-tab-geral')?.classList.add('active');

    document.getElementById('drawer-backdrop')?.classList.add('active');
    document.getElementById('musico-drawer-360')?.classList.add('active');
    setTimeout(() => lucide.createIcons(), 50);
}

function closeDrawer() {
    document.getElementById('drawer-backdrop')?.classList.remove('active');
    document.getElementById('musico-drawer-360')?.classList.remove('active');
}

function formatDate(str) {
    if (!str) return '–';
    const parts = str.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return str;
}

/* ============================================
   AVISAR ORQUESTRA
   ============================================ */
function initAvisos() {
    renderNotifHistory();

    // Filtros de notificações
    document.querySelectorAll('[data-notif-filter]').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('[data-notif-filter]').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentNotifFilter = pill.dataset.notifFilter;
            renderNotifHistory();
        });
    });

    // Contadores de caracteres
    const inputNotifLinkText = document.getElementById('notif-link-text-input');
    const charCountNotifLinkText = document.getElementById('notif-link-text-char-count');
    if (inputNotifLinkText && charCountNotifLinkText) {
        inputNotifLinkText.addEventListener('input', () => {
            charCountNotifLinkText.textContent = `${inputNotifLinkText.value.length}/30`;
        });
    }

    const inputEditNotifLinkText = document.getElementById('edit-notif-link-text');
    const charCountEditNotifLinkText = document.getElementById('edit-notif-link-text-char-count');
    if (inputEditNotifLinkText && charCountEditNotifLinkText) {
        inputEditNotifLinkText.addEventListener('input', () => {
            charCountEditNotifLinkText.textContent = `${inputEditNotifLinkText.value.length}/30`;
        });
    }
}

function toggleScheduling(cb) {
    const row = document.getElementById('schedule-inputs-row');
    if (row) row.classList.toggle('hidden', !cb.checked);
}

function sendNotification() {
    const title = document.getElementById('notif-title-input')?.value.trim();
    const message = document.getElementById('notif-message-input')?.value.trim();
    const link = document.getElementById('notif-link-input')?.value.trim();
    const linkText = document.getElementById('notif-link-text-input')?.value.trim();
    const isScheduled = document.getElementById('toggle-schedule-checkbox')?.checked;
    const schedDate = document.getElementById('schedule-date')?.value;
    const schedTime = document.getElementById('schedule-time')?.value;

    if (!title) { showToast('Preencha o título do aviso!', 'warning'); return; }
    if (!message) { showToast('Preencha a mensagem do aviso!', 'warning'); return; }

    const newId = 'av' + Date.now();
    let status = 'active';
    let scheduledFor = null;

    if (isScheduled && schedDate && schedTime) {
        status = 'scheduled';
        const [yy, mm, dd] = schedDate.split('-');
        scheduledFor = `${dd}/${mm}/${yy} ${schedTime}`;
    }

    const now = new Date();
    const sentAt = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    AVISOS_DATA.unshift({ id:newId, title, message, link, linkText, status, sentAt: status === 'scheduled' ? null : sentAt, scheduledFor });

    // Limpar form
    document.getElementById('notif-title-input').value = '';
    document.getElementById('notif-message-input').value = '';
    document.getElementById('notif-link-input').value = '';
    const textInput = document.getElementById('notif-link-text-input');
    if (textInput) {
        textInput.value = '';
        const charCount = document.getElementById('notif-link-text-char-count');
        if (charCount) charCount.textContent = '0/30';
    }
    document.getElementById('toggle-schedule-checkbox').checked = false;
    document.getElementById('schedule-inputs-row')?.classList.add('hidden');

    const msg = status === 'scheduled'
        ? `✅ Aviso agendado para ${scheduledFor}!`
        : '🔔 Aviso disparado com sucesso para todos os músicos!';
    showToast(msg, 'success');
    renderNotifHistory();
}

function renderNotifHistory() {
    const list = document.getElementById('notif-history-list');
    if (!list) return;

    const filtered = currentNotifFilter === 'all'
        ? AVISOS_DATA
        : AVISOS_DATA.filter(a => a.status === currentNotifFilter);

    if (!filtered.length) {
        list.innerHTML = `<div style="text-align:center;padding:2rem 0;color:var(--text-muted);font-size:.85rem;">
            Nenhum aviso encontrado para o filtro selecionado.
        </div>`;
        return;
    }

    const statusLabels = { active:'Ativo no site', scheduled:'Agendado', sent:'Enviado' };
    const icons = { active:'bell', scheduled:'calendar-clock', sent:'send' };

    list.innerHTML = filtered.map(a => `
        <div class="notif-history-card" id="notif-card-${a.id}">
            <div class="notif-card-left">
                <div class="notif-card-icon">
                    <i data-lucide="${icons[a.status] || 'megaphone'}"></i>
                </div>
                <div>
                    <div class="notif-card-title">${a.title}</div>
                    <div class="notif-card-preview">${a.message}</div>
                    <div class="notif-card-meta">
                        <span class="notif-status-badge ${a.status}">${statusLabels[a.status] || a.status}</span>
                        <span class="notif-card-date">
                            ${a.status === 'scheduled'
                                ? `📅 Agendado: ${a.scheduledFor}`
                                : `🕐 Enviado: ${a.sentAt}`}
                        </span>
                    </div>
                    ${a.link ? `<div class="notif-card-date" style="margin-top:2px;">🔗 <a href="${a.link}" target="_blank" style="color:var(--primary);">${a.linkText || 'Acessar Link'}</a></div>` : ''}
                </div>
            </div>
            <div class="notif-card-actions">
                <button class="btn-notif-action" title="Editar aviso" onclick="editNotif('${a.id}')">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-notif-action delete" title="Apagar aviso" onclick="deleteNotif('${a.id}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');

    setTimeout(() => lucide.createIcons(), 50);
}

function editNotif(id) {
    const a = AVISOS_DATA.find(x => x.id === id);
    if (!a) return;
    document.getElementById('edit-notif-id').value = id;
    document.getElementById('edit-notif-title').value = a.title;
    document.getElementById('edit-notif-message').value = a.message;
    document.getElementById('edit-notif-link').value = a.link || '';
    const textInput = document.getElementById('edit-notif-link-text');
    if (textInput) {
        textInput.value = a.linkText || '';
        const charCountEdit = document.getElementById('edit-notif-link-text-char-count');
        if (charCountEdit) {
            charCountEdit.textContent = `${textInput.value.length}/30`;
        }
    }
    openModal('edit-notif-modal');
}

function saveEditedNotif() {
    const id = document.getElementById('edit-notif-id').value;
    const idx = AVISOS_DATA.findIndex(x => x.id === id);
    if (idx === -1) return;
    AVISOS_DATA[idx].title = document.getElementById('edit-notif-title').value;
    AVISOS_DATA[idx].message = document.getElementById('edit-notif-message').value;
    AVISOS_DATA[idx].link = document.getElementById('edit-notif-link').value;
    const textInput = document.getElementById('edit-notif-link-text');
    if (textInput) AVISOS_DATA[idx].linkText = textInput.value;
    closeModal('edit-notif-modal');
    renderNotifHistory();
    showToast('Aviso atualizado com sucesso!', 'success');
}

function deleteNotif(id) {
    const card = document.getElementById('notif-card-' + id);
    if (card) {
        card.style.transition = 'all 0.25s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        setTimeout(() => {
            AVISOS_DATA = AVISOS_DATA.filter(x => x.id !== id);
            renderNotifHistory();
            showToast('Aviso removido.', 'info');
        }, 250);
    }
}

function roboOER() {
    const sugestoes = [
        { title:"Comunicado Urgente — Cronograma", msg:"Atenção músicos! O ensaio desta semana sofreu alterações. Verifique o cronograma atualizado e confirme sua presença o quanto antes." },
        { title:"Lembrete de Presença — Ensaio Tutti", msg:"Lembramos que o ensaio tutti é nesta quarta-feira às 19h. Presença obrigatória. Levar materiais para os dois programas." },
        { title:"PDF da Temporada Atualizado", msg:"A nova versão da Temporada foi publicada. Acesse o site e confira as alterações de repertório e cronograma para o segundo semestre." },
    ];
    const s = sugestoes[Math.floor(Math.random() * sugestoes.length)];
    const titleEl = document.getElementById('notif-title-input');
    const msgEl = document.getElementById('notif-message-input');
    if (titleEl && !titleEl.value) titleEl.value = s.title;
    if (msgEl && !msgEl.value) msgEl.value = s.msg;
    showToast('✨ Sugestão do Robô OER aplicada!', 'success');
}

/* ============================================
   CALENDÁRIO
   ============================================ */
function initCalendario() {
    renderCalEvents();

    // Naipe field toggle
    const tipoEl = document.getElementById('evento-tipo');
    if (tipoEl) toggleNaipeField(tipoEl.value);
}

function toggleNaipeField(tipo) {
    const wrapper = document.getElementById('naipe-field-wrapper');
    if (wrapper) wrapper.style.display = tipo === 'ensaio_naipe' ? 'flex' : 'none';
}

function changeCalMonth(delta) {
    currentCalMonth += delta;
    if (currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
    if (currentCalMonth < 0)  { currentCalMonth = 11; currentCalYear--; }
    renderCalEvents();
}

function renderCalEvents() {
    const label = document.getElementById('cal-month-label');
    const list  = document.getElementById('cal-events-list');
    if (!label || !list) return;

    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    label.textContent = `${months[currentCalMonth]} ${currentCalYear}`;

    const filtered = EVENTOS_DATA.filter(e => {
        const d = new Date(e.data + 'T00:00:00');
        return d.getMonth() === currentCalMonth && d.getFullYear() === currentCalYear;
    }).sort((a,b) => a.data.localeCompare(b.data));

    if (!filtered.length) {
        list.innerHTML = `<div class="cal-empty">
            <i data-lucide="calendar-x" style="display:block;margin:0 auto .5rem;width:28px;height:28px;"></i>
            Nenhum evento em ${months[currentCalMonth]}.
        </div>`;
        setTimeout(() => lucide.createIcons(), 50);
        return;
    }

    const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const typeCls = { ensaio_tutti:'tutti', ensaio_naipe:'naipe', concerto:'concerto' };
    const typeLabel = { ensaio_tutti:'Ensaio Tutti', ensaio_naipe:'Ensaio de Naipe', concerto:'Concerto' };

    list.innerHTML = filtered.map(e => {
        const dt = new Date(e.data + 'T00:00:00');
        const dayNum = dt.getDate();
        const dayName = weekdays[dt.getDay()];
        const cls = typeCls[e.tipo] || 'tutti';
        return `
            <div class="cal-event-item" id="cal-ev-${e.id}">
                <div class="cal-event-date-block">
                    <div class="cal-event-day-num">${dayNum}</div>
                    <div class="cal-event-day-name">${dayName}</div>
                </div>
                <div class="cal-event-divider"></div>
                <div class="cal-event-info">
                    <span class="cal-event-type-badge ${cls}">${typeLabel[e.tipo] || e.tipo}</span>
                    <span class="cal-event-title">${e.descricao}${e.concerto ? ` — ${e.concerto}` : ''}</span>
                    <div class="cal-event-time-loc">
                        <i data-lucide="clock"></i>${e.inicio}–${e.fim} &nbsp;
                        <i data-lucide="map-pin"></i>${e.local}
                    </div>
                    <span class="cal-event-status ${e.status.toLowerCase()}">${e.status}</span>
                </div>
                <div class="cal-event-actions">
                    <button class="btn-cal-action" title="Editar" onclick="editEvent('${e.id}')">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn-cal-action delete" title="Apagar" onclick="deleteEvent('${e.id}')">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    setTimeout(() => lucide.createIcons(), 50);
}

function saveEvent(e) {
    e.preventDefault();
    const id = document.getElementById('evento-id').value || 'ev' + Date.now();
    const ev = {
        id,
        tipo:        document.getElementById('evento-tipo').value,
        status:      document.getElementById('evento-status').value,
        descricao:   document.getElementById('evento-descricao').value,
        concerto:    document.getElementById('evento-concerto').value,
        naipe:       document.getElementById('evento-naipe').value,
        data:        document.getElementById('evento-date').value,
        inicio:      document.getElementById('evento-inicio').value,
        fim:         document.getElementById('evento-fim').value,
        local:       document.getElementById('evento-local').value,
        complemento: document.getElementById('evento-complemento').value,
        maps:        document.getElementById('evento-maps').value,
        avisos:      document.getElementById('evento-avisos').value,
        repertorio:  document.getElementById('evento-repertorio').value,
    };

    const idx = EVENTOS_DATA.findIndex(x => x.id === id);
    if (idx !== -1) {
        EVENTOS_DATA[idx] = ev;
        showToast('Evento atualizado com sucesso!', 'success');
    } else {
        EVENTOS_DATA.push(ev);
        showToast('Evento adicionado ao calendário!', 'success');
    }

    clearEventForm();
    renderCalEvents();

    // Navegar para o mês do evento salvo
    const evDate = new Date(ev.data + 'T00:00:00');
    currentCalMonth = evDate.getMonth();
    currentCalYear  = evDate.getFullYear();
    renderCalEvents();
}

function editEvent(id) {
    const ev = EVENTOS_DATA.find(x => x.id === id);
    if (!ev) return;

    const setV = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
    setV('evento-id', ev.id);
    setV('evento-tipo', ev.tipo);
    setV('evento-status', ev.status);
    setV('evento-descricao', ev.descricao);
    setV('evento-concerto', ev.concerto);
    setV('evento-naipe', ev.naipe);
    setV('evento-date', ev.data);
    setV('evento-inicio', ev.inicio);
    setV('evento-fim', ev.fim);
    setV('evento-local', ev.local);
    setV('evento-complemento', ev.complemento);
    setV('evento-maps', ev.maps);
    setV('evento-avisos', ev.avisos);
    setV('evento-repertorio', ev.repertorio);

    toggleNaipeField(ev.tipo);

    const titleEl = document.getElementById('evento-form-title');
    if (titleEl) titleEl.textContent = 'Editar Evento';
    const btnLabel = document.getElementById('btn-evento-label');
    if (btnLabel) btnLabel.textContent = 'Atualizar Evento';

    // Scroll to form
    document.getElementById('evento-form')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function deleteEvent(id) {
    EVENTOS_DATA = EVENTOS_DATA.filter(x => x.id !== id);
    renderCalEvents();
    showToast('Evento removido do calendário.', 'info');
}

function clearEventForm() {
    document.getElementById('evento-form')?.reset();
    document.getElementById('evento-id').value = '';
    const titleEl = document.getElementById('evento-form-title');
    if (titleEl) titleEl.textContent = 'Adicionar Evento';
    const btnLabel = document.getElementById('btn-evento-label');
    if (btnLabel) btnLabel.textContent = 'Salvar Evento';
    toggleNaipeField('ensaio_tutti');
}

function iaTexto() {
    const text = window.prompt('Cole aqui o texto do e-mail ou cronograma:\n(Simulação — em produção isso usaria a API do Gemini)');
    if (text && text.trim()) {
        // Simulação de parse
        document.getElementById('evento-descricao').value = 'Evento extraído pela IA';
        document.getElementById('evento-local').value = 'Sala de Ensaio OSM/OER';
        showToast('✨ IA extraiu o evento! Revise os campos e salve.', 'success');
        setTimeout(() => lucide.createIcons(), 50);
    }
}

function iaPDF() {
    showToast('Upload de PDF com IA — disponível em produção com Gemini.', 'info');
}

/* ============================================
   TEMPORADA & AGENDA — UPLOADS
   ============================================ */
function initArquivos() {
    document.getElementById('version-label-temporada').textContent = pdfVersions.temporada;
    document.getElementById('version-label-agenda').textContent = pdfVersions.agenda;
}

function onFileSelected(tipo, input) {
    if (!input.files.length) return;
    const file = input.files[0];
    document.getElementById(`filename-${tipo}`).textContent = file.name;
    document.getElementById(`file-selected-${tipo}`).style.display = 'flex';
    document.getElementById(`btn-upload-${tipo}`).disabled = false;
    setTimeout(() => lucide.createIcons(), 30);
}

function onFileDrop(event, tipo) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file || file.type !== 'application/pdf') {
        showToast('Somente arquivos PDF são aceitos!', 'warning');
        return;
    }
    document.getElementById(`filename-${tipo}`).textContent = file.name;
    document.getElementById(`file-selected-${tipo}`).style.display = 'flex';
    document.getElementById(`btn-upload-${tipo}`).disabled = false;
    document.getElementById(`drag-${tipo}`).style.borderColor = 'var(--success)';
    setTimeout(() => lucide.createIcons(), 30);
}

function simulateUpload(tipo) {
    const track = document.getElementById(`progress-${tipo}-track`);
    const fill  = document.getElementById(`progress-${tipo}-fill`);
    const btn   = document.getElementById(`btn-upload-${tipo}`);

    track.style.display = 'block';
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i> Enviando...';
    setTimeout(() => lucide.createIcons(), 30);

    let pct = 0;
    const iv = setInterval(() => {
        pct += 12;
        fill.style.width = Math.min(pct, 100) + '%';
        if (pct >= 100) {
            clearInterval(iv);
            track.style.display = 'none';
            fill.style.width = '0';
            btn.innerHTML = '<i data-lucide="send"></i> Enviar novo PDF';
            btn.disabled = false;
            document.getElementById(`file-selected-${tipo}`).style.display = 'none';
            document.getElementById(`drag-${tipo}`).style.borderColor = '';
            const label = tipo === 'temporada' ? 'Temporada' : 'Agenda';
            showToast(`✅ PDF da ${label} publicado com sucesso!`, 'success');
            LOGS_MOCK.unshift({ cat:'pdf', msg:`PDF da ${label} atualizado`, date:'Agora' });
            setTimeout(() => lucide.createIcons(), 30);
        }
    }, 200);
}

function updateVersion(tipo) {
    const val = document.getElementById(`version-${tipo}`).value.trim();
    if (!val) { showToast('Informe o número da versão!', 'warning'); return; }
    pdfVersions[tipo] = val;
    document.getElementById(`version-label-${tipo}`).textContent = val;
    document.getElementById(`version-${tipo}`).value = '';
    const label = tipo === 'temporada' ? 'Temporada' : 'Agenda';
    showToast(`Versão da ${label} atualizada para ${val}!`, 'success');
}

/* ============================================
   LINKS EXTRAS
   ============================================ */
function initLinks() {
    renderLinks();
}

function renderLinks() {
    const list = document.getElementById('links-created-list');
    if (!list) return;

    if (!LINKS_DATA.length) {
        list.innerHTML = `<div style="text-align:center;padding:2rem 0;color:var(--text-muted);font-size:.85rem;">
            Nenhum link criado ainda. Use o formulário acima.
        </div>`;
        return;
    }

    list.innerHTML = LINKS_DATA.map(lk => `
        <div class="link-item-card ${lk.active ? '' : 'inactive'}" id="link-card-${lk.id}">
            <div class="link-item-icon">
                <i data-lucide="${lk.icon}"></i>
            </div>
            <div class="link-item-info">
                <div class="link-item-name">${lk.name}</div>
                <span class="link-item-url">${lk.url}</span>
                <div class="link-item-meta">
                    Criado em: ${lk.createdAt}
                    ${lk.availableUntil ? ` &nbsp;·&nbsp; Expira: ${lk.availableUntil}` : ''}
                    &nbsp;·&nbsp; <strong style="color:${lk.active ? 'var(--success)' : 'var(--danger)'}">
                        ${lk.active ? '● Visível no site' : '● Oculto'}
                    </strong>
                </div>
            </div>
            <div class="link-item-actions">
                <label class="toggle-switch" title="${lk.active ? 'Desativar' : 'Ativar'}">
                    <input type="checkbox" ${lk.active ? 'checked' : ''} 
                           onchange="toggleLink('${lk.id}',this)">
                    <span class="toggle-slider"></span>
                </label>
                <button class="btn-link-action" title="Editar" onclick="editLink('${lk.id}')">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-link-action delete" title="Apagar" onclick="deleteLink('${lk.id}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');

    setTimeout(() => lucide.createIcons(), 50);
}

function saveLink() {
    const name = document.getElementById('link-name')?.value.trim();
    const url  = document.getElementById('link-url')?.value.trim();
    const icon = document.getElementById('selected-icon-name')?.value || 'link';
    const from = document.getElementById('link-available-from')?.value;
    const until= document.getElementById('link-available-until')?.value;
    const editId = document.getElementById('link-id')?.value;

    if (!name) { showToast('Informe o nome do botão!', 'warning'); return; }
    if (!url)  { showToast('Informe a URL de destino!', 'warning'); return; }

    const now = new Date();
    const createdAt = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

    if (editId) {
        const idx = LINKS_DATA.findIndex(x => x.id === editId);
        if (idx !== -1) {
            LINKS_DATA[idx] = { ...LINKS_DATA[idx], name, url, icon, availableUntil: until || null };
            showToast('Link atualizado!', 'success');
        }
    } else {
        LINKS_DATA.unshift({ id:'lk'+Date.now(), icon, name, url, active:true, createdAt, availableFrom:from||null, availableUntil:until||null });
        showToast('✅ Botão criado e publicado no site!', 'success');
        LOGS_MOCK.unshift({ cat:'links', msg:`Link "${name}" criado`, date:'Agora' });
    }

    cancelLinkEdit();
    renderLinks();
}

function editLink(id) {
    const lk = LINKS_DATA.find(x => x.id === id);
    if (!lk) return;
    document.getElementById('link-id').value = id;
    document.getElementById('link-name').value = lk.name;
    document.getElementById('link-url').value = lk.url;
    document.getElementById('selected-icon-name').value = lk.icon;
    updateIconPickerPreview(lk.icon);
    updateNameCounter(document.getElementById('link-name'));

    document.getElementById('link-form-title').textContent = 'Editar Botão';
    document.getElementById('link-btn-text').textContent = 'Salvar Alterações';
    document.getElementById('link-btn-icon').setAttribute('data-lucide', 'save');
    document.getElementById('btn-cancel-link').style.display = 'flex';
    setTimeout(() => lucide.createIcons(), 30);

    document.getElementById('link-name')?.scrollIntoView({ behavior:'smooth', block:'center' });
}

function cancelLinkEdit() {
    document.getElementById('link-id').value = '';
    document.getElementById('link-name').value = '';
    document.getElementById('link-url').value = '';
    document.getElementById('link-available-from').value = '';
    document.getElementById('link-available-until').value = '';
    document.getElementById('link-form-title').textContent = 'Criar Novo Botão';
    document.getElementById('link-btn-text').textContent = 'Criar Botão';
    document.getElementById('link-btn-icon').setAttribute('data-lucide', 'plus');
    document.getElementById('btn-cancel-link').style.display = 'none';
    updateNameCounter({ value:'', maxLength:30 });
    setTimeout(() => lucide.createIcons(), 30);
}

function toggleLink(id, cb) {
    const idx = LINKS_DATA.findIndex(x => x.id === id);
    if (idx !== -1) {
        LINKS_DATA[idx].active = cb.checked;
        const card = document.getElementById('link-card-' + id);
        if (card) card.classList.toggle('inactive', !cb.checked);
        const msg = cb.checked ? 'Link ativado e visível no site!' : 'Link desativado — oculto no site.';
        showToast(msg, cb.checked ? 'success' : 'info');
        renderLinks();
    }
}

function deleteLink(id) {
    LINKS_DATA = LINKS_DATA.filter(x => x.id !== id);
    renderLinks();
    showToast('Link removido.', 'info');
}

/* ============================================
   ICON PICKER
   ============================================ */
function initIconPicker() {
    document.querySelectorAll('.icon-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            const icon = opt.dataset.icon;
            selectedIcon = icon;
            document.getElementById('selected-icon-name').value = icon;
            updateIconPickerPreview(icon);
            document.getElementById('icon-picker-dropdown-links')?.classList.remove('open');
        });
    });
}

function toggleIconPicker() {
    document.getElementById('icon-picker-dropdown-links')?.classList.toggle('open');
}

function updateIconPickerPreview(icon) {
    const preview = document.getElementById('icon-picker-preview');
    if (preview) {
        preview.setAttribute('data-lucide', icon);
        setTimeout(() => lucide.createIcons(), 30);
    }
}

function updateNameCounter(input) {
    const counter = document.getElementById('link-name-counter');
    if (counter && input) {
        const len = input.value ? input.value.length : 0;
        const max = input.maxLength || 30;
        counter.textContent = `${len}/${max}`;
        counter.style.color = len > max * 0.8 ? 'var(--warning)' : 'var(--text-muted)';
    }
}

/* ============================================
   AJUSTES DO SISTEMA
   ============================================ */
function onSettingChange(name, cb) {
    const labels = {
        letreiro: 'Letreiro',
        atestados: 'Módulo de Atestados',
        sininho: 'Botão de Notificação',
        calendario: 'Calendário Interativo',
        emulacao: 'Emulação'
    };
    const state = cb.checked ? 'ativado' : 'desativado';
    showToast(`${labels[name] || name} ${state}!`, cb.checked ? 'success' : 'info');
    LOGS_MOCK.unshift({ cat:'sistema', msg:`Toggle "${labels[name]}" ${state}`, date:'Agora' });
}

function toggleSecuritySection() {
    const content  = document.getElementById('security-content');
    const chevron  = document.getElementById('security-chevron');
    const isOpen   = content.style.display === 'flex';
    content.style.display = isOpen ? 'none' : 'flex';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

/* ============================================
   MODAIS
   ============================================ */
function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });
}

function openModal(id) {
    document.getElementById(id)?.classList.add('active');
    setTimeout(() => lucide.createIcons(), 50);
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

/* ============================================
   BOTTOM SHEET (Mobile)
   ============================================ */
function openBottomSheet() {
    document.getElementById('bottom-sheet-overlay')?.classList.add('active');
    document.getElementById('bottom-sheet')?.classList.add('active');
    setTimeout(() => lucide.createIcons(), 50);
}

function closeBottomSheet() {
    document.getElementById('bottom-sheet-overlay')?.classList.remove('active');
    document.getElementById('bottom-sheet')?.classList.remove('active');
}

/* ============================================
   TOAST NOTIFICATIONS
   ============================================ */
const TOAST_ICONS = { success:'check-circle', error:'x-circle', info:'info', warning:'alert-triangle' };

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i data-lucide="${TOAST_ICONS[type] || 'info'}" class="toast-icon"></i>
        <span class="toast-text">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => lucide.createIcons(), 20);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
