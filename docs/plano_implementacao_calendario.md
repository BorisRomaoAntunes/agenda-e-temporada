# Módulo de Calendário Interativo OER
## Plano de Implementação v4.0 — FINAL

> Consolidado em 15/05/2026 com base em todos os feedbacks e análise de 3 modelos reais de e-mail de cronograma.

---

## Visão Geral

Substituição completa da interface de PDFs estáticos por uma agenda dinâmica e interativa para os músicos da OER. Controlada pelo **feature flag `show_new_calendar`** no Firestore.

> [!IMPORTANT]
> **Durante o desenvolvimento local:** toggle **ON** por padrão para facilitar desenvolvimento visual.
> **Em produção:** toggle OFF até validação completa. Quando toggle ON, os botões de download dos PDFs e os visualizadores somem completamente — só o calendário aparece.

---

## Estrutura de Dados (Firestore) — Schema Final

### Coleção `/eventos/{eventoId}`

```
date:             "2026-05-15"         ← ISO internamente; exibido como DD/MM/AAAA
tipo:             "ensaio_tutti"
                  "ensaio_naipe"
                  "concerto"
naipe:            "Violoncelos"        ← Preenchido só quando tipo = ensaio_naipe
descricaoEnsaio:  "Tutti"             ← Modificador livre: "Tutti", "GERAL", "OER",
                                         "OER + Cantora Solista", etc.
horarioInicio:    "17:00"             ← Editável pelo Admin
horarioFim:       "20:00"             ← Editável pelo Admin
local:            "Sala de Ensaio OSM/OER"
localComplemento: "prédio Corpos Artísticos"  ← Opcional (vem entre parênteses no e-mail)
localMapsUrl:     "https://..."        ← Opcional, campo livre no admin
concertoNome:     "Metacosmos"         ← Nome do programa/série (opcional)
repertorio:       [                    ← Formato: "COMPOSITOR Nome da obra"
  "MAHLER Sinfonia nº 4",              ← Separadores "/" e "e" viram itens distintos
  "ANNA Metacosmos",
  "--- Intervalo ---",                 ← Marcador especial → renderiza divisor visual
  "DVOŘÁK Sinfonia nº 8",
  "SMETANA A Noiva Vendida"
]                                      ← "Repertório completo" aceito como valor especial
avisos:           ["Acesso após 16h30"] ← Avisos do dia → box amarelo no card
updatedAt:        Timestamp            ← Controla bolinha vermelha de atualização
createdAt:        Timestamp
criadoPor:        "admin_uid"
fonteEmailOriginal: "string"           ← Texto do e-mail processado pela IA (auditoria)
```

> [!NOTE]
> **Um mesmo dia pode ter múltiplos documentos** em `/eventos` com o mesmo `date`. Isso é normal e esperado (ex: Naipe Violoncelos 15h30 + Naipe Sopros 17h + Tutti 17h = 3 documentos para o mesmo dia).

### Coleção `/avisos_semana/{avisoId}`

```
semana_inicio:  "2026-04-28"   ← Segunda-feira da semana
semana_fim:     "2026-05-04"   ← Domingo da semana
texto:          "Acesso à sala após liberação da equipe da OER"
tipo:           "info" | "warning" | "danger"
createdAt:      Timestamp
```

Avisos globais que valem para **todos os dias da semana** (aparecem no topo do card, com destaque em vermelho/laranja, replicando o "IMPORTANTE:" do e-mail).

### `/config/app`

```
show_new_calendar: boolean
```

---

## Tipos de Evento e Cores dos Dots

Cores alinhadas à paleta oficial da OER (`#8B0000` bordô / `#A52A2A` vinho):

| Tipo | Cor do Dot | Hex | Descrição |
|---|---|---|---|
| `ensaio_tutti` | ⬤ Bordô escuro | `#8B0000` | Ensaio geral / tutti / OER — cor primária da marca |
| `concerto` | ⬤ Dourado/Âmbar | `#C8972A` | Concerto / apresentação — contrasta com bordô sem sair da paleta |
| `ensaio_naipe` | ⬤ Vinho claro | `#C24B4B` | Ensaio de naipe — variação mais clara do vinho secundário |

> [!NOTE]
> As três cores são distinguíveis entre si e coerentes com a identidade visual bordô/vinho da OER. Nenhuma cor "estranha" (azul puro, verde néon) é usada.

**Dots múltiplos por dia:** exibidos em sequência abaixo do número. Máximo 3 visíveis; se houver mais, exibe `+N`.

**Bolinha de atualização** no canto superior direito do card de dia: cor `#8B0000` (bordô) com borda branca — indica evento atualizado nas últimas 48h (`updatedAt`). Sem push notification — só indicador visual.

---

## Front-end do Músico

### A. Cabeçalho de Navegação

```
[ MAIO 2026  ▾ ]                    [ HOJE ]
```

- **"MAIO 2026 ▾"** → abre modal de calendário completo
- **"HOJE"** → retorna ao dia atual com animação suave
- O **mês/ano** atualiza automaticamente conforme o músico scrolla a régua (via `IntersectionObserver`)
- **Snap automático de mês**: quando o primeiro dia de um novo mês entrar na área visível, a régua faz snap suave para posicioná-lo à esquerda e o header atualiza. Deixa clara a transição de mês.

> [!IMPORTANT]
> **Responsividade obrigatória**: o cabeçalho deve funcionar bem em celular e desktop.
> - **Mobile** (< 480px): mês em bordô compacto à esquerda, botão "HOJE" à direita, ambos com área de toque mínima de 44px.
> - **Tablet / Desktop** (≥ 768px): mesma estrutura, espaçamento maior, régua de dias mais larga com mais cards visíveis simultaneamente.
> - A régua de dias usa `scroll-snap-type: x mandatory` para comportamento suave em touch e mouse.

---

### B. Banner "Próximo Evento"

Faixa compacta logo abaixo do cabeçalho. Atualiza automaticamente à meia-noite.

```
🟢  Próximo ensaio: Ter 20/05 · 17h às 20h · Sala OSM/OER
```

---

### C. Régua de Dias (Calendar Strip)

- Scroll horizontal · limite ±3 meses a partir do mês atual
- Cards de dia:
  - **Selecionado** → fundo bordô `#8B0000`, texto branco, sombra
  - **Não selecionado** → fundo cinza claro, texto cinza escuro
  - **Acinzentado pelo filtro** → opacity reduzida, não removido
  - **Bolinha vermelha** 🔴 no canto superior direito → evento atualizado recentemente

---

### D. Filtros (Pill Buttons)

```
[ TUDO ]   [ ENSAIOS ]   [ CONCERTOS ]
```

Filtro **acinzenta** os dias sem o tipo selecionado — não os remove da régua (evita saltos visuais).

---

### E. Card de Detalhe do Dia — Múltiplos Eventos

Aparece abaixo dos filtros com animação `slide-up`. Quando o dia tem múltiplos eventos, são exibidos **empilhados** na ordem:
1. Ensaios de Naipe (horário crescente)
2. Ensaio Tutti / OER
3. Concertos

**Layout do card (baseado nos e-mails reais):**

```
┌─────────────────────────────────────────────┐
│  ⚠️ IMPORTANTE: Acesso após liberação OER   │  ← aviso_semana (bordô/laranja)
├─────────────────────────────────────────────┤
│  28/04 — Terça-feira                        │
├─────────────────────────────────────────────┤
│  🔵  Naipe Violoncelos                      │
│      15h30 às 16h30                         │
│      Sala 502 · prédio Corpos Artísticos    │
├─────────────────────────────────────────────┤
│  🔵  Naipe Sopros                           │
│      17h às 20h                             │
│      Sala 307 · prédio Corpos Artísticos    │
├─────────────────────────────────────────────┤
│  🟢  Ensaio Tutti                           │
│      17h às 20h                             │
│      Sala de Ensaio OSM/OER   [Ver no Maps] │
│                                             │
│      Concerto: Metacosmos                   │
│                                             │
│      Repertório:                            │
│      • MAHLER Sinfonia nº 4                 │
│      • ANNA Metacosmos                      │
│      ────── Intervalo ──────                │
│      • DVOŘÁK Sinfonia nº 8                 │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ⚠️  Acesso à sala após 16h30        │    │  ← box AMARELO
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**Regras de exibição:**
- `descricaoEnsaio` → exibido em bordô, negrito (fiel ao e-mail)
- `concertoNome` → exibido com rótulo "Concerto:" sublinhado (fiel ao e-mail)
- `repertorio` → lista com `•`, formato `COMPOSITOR Nome da obra`; `"--- Intervalo ---"` vira divisor visual; `"Repertório completo"` em itálico
- `localComplemento` → exibido após `·` em tom mais suave
- `avisos` do dia → box amarelo destacado
- `avisos_semana` → faixa no topo do card, em bordô/laranja
- **Dia sem evento** → mensagem "Dia livre 🎶 — Nenhum evento agendado."

---

### F. Modal de Calendário Completo

- Grid mensal com dots coloridos em cada data
- Botão inferior **"IR PARA HOJE"** em bordô escuro
- Acessibilidade: `role="dialog"`, `aria-modal="true"`, trap de foco, ESC fecha
- Datas no formato DD/MM/AAAA

---

### G. Cache Offline e Performance

- Eventos do mês atual + ±1 mês salvos em `localStorage` (TTL 1h)
- App funciona sem internet com dados em cache
- Skeleton loading em todos os componentes durante carregamento
- Deep link via URL: `?data=15-05-2026` → abre diretamente aquele dia

---

## Painel Administrativo

### A. Toggle `show_new_calendar`

Toggle já existente no admin. **Validação adicionada**: antes de ativar, verifica se há ao menos 1 evento no mês atual. Se não houver, exibe aviso antes de confirmar.

---

### B. Seção "📅 Gerenciar Calendário"

**Formulário de Novo Evento:**

```
Tipo:            [ Ensaio Tutti ▾ ] / [ Concerto ] / [ Ensaio de Naipe: _Violoncelos_ ]
Descrição:       Tutti  (editável, ex: "OER + Cantora Solista")
Data:            DD/MM/AAAA
Horário:         17:00  às  20:00      ← campos editáveis, vêm pré-preenchidos
Local:           ____________________
Complemento:     ____________________ (opcional, ex: prédio Corpos Artísticos)
Link Maps:       ____________________ (opcional)
Concerto:        ____________________ (opcional, ex: Metacosmos)
Repertório:      + Adicionar peça     ← placeholder: "COMPOSITOR Nome da obra"
                 [ ] Tem Intervalo    ← checkbox que insere "--- Intervalo ---" no array
Avisos do dia:   + Adicionar aviso
```

**Listagem mensal:**
- Navegação: `← Abril 2026 | Maio 2026 | Junho 2026 →`
- Cards dos eventos com botões Editar / Deletar

---

### C. Parser de IA — Fluxo com Revisão

> Admin fornece fonte → IA processa → Admin **revisa** → Admin **publica**

O parser aceita **duas fontes de entrada**, à escolha do Admin:

#### Fonte 1 — Texto do E-mail (já existia)
Admin cola o texto do e-mail de cronograma na textarea.

#### Fonte 2 — Upload de PDF ⭐ (novo)
Admin faz upload direto do **PDF de Temporada ou Agenda de Ensaios** — os mesmos documentos que já existem no sistema. A IA lê o PDF, extrai os eventos e os apresenta para revisão. Isso elimina a necessidade de copiar e colar manualmente.

**Passo a passo unificado:**
1. Admin escolhe a fonte: **[ 📄 Colar texto do e-mail ]** ou **[ 📎 Enviar PDF ]**
2. Cola o texto OU faz upload do PDF (aceita os mesmos arquivos da Temporada/Agenda)
3. Clica em **"✨ Processar com IA"**
4. Sistema chama Cloud Function `parseScheduleWithGemini`
   - Se texto → envia como string
   - Se PDF → converte para base64 e envia para Gemini com `inlineData` (mime `application/pdf`)
5. IA retorna JSON com eventos e avisos de semana
6. Sistema exibe **cards de prévia editáveis** por evento — admin pode corrigir qualquer campo
7. Admin clica em **"Publicar X eventos"**
8. Eventos salvos no Firestore · fonte original salva em `fonteEmailOriginal`

> [!NOTE]
> O Gemini 1.5/2.0 Flash suporta leitura nativa de PDFs via `inlineData`. A mesma Cloud Function `parseScheduleWithGemini` já usada para atestados pode servir de referência para este padrão.

**Prompt Gemini (calibrado para os 3 formatos de e-mail da OER):**

```
Você é um assistente que extrai cronogramas de ensaios e concertos de e-mails
da Orquestra Experimental de Repertório (OER).

Retorne APENAS um JSON válido com esta estrutura:
{
  "eventos": [{
    "date": "YYYY-MM-DD",
    "tipo": "ensaio_tutti" | "ensaio_naipe" | "concerto",
    "naipe": "string ou null",
    "descricaoEnsaio": "Tutti" | "GERAL" | "OER" | "OER + Cantora Solista" | "string",
    "horarioInicio": "HH:MM",
    "horarioFim": "HH:MM",
    "local": "string",
    "localComplemento": "string ou null",
    "concertoNome": "string ou null",
    "repertorio": ["COMPOSITOR Nome da obra"],
    "avisos": ["string"]
  }],
  "avisos_semana": [{
    "texto": "string",
    "tipo": "info" | "warning" | "danger"
  }]
}

REGRAS:
- Cada ensaio de naipe e cada ensaio tutti são documentos SEPARADOS mesmo no mesmo dia.
- Repertório: formato "COMPOSITOR Nome da obra" (COMPOSITOR em maiúsculas).
- Separadores "/" e "e" entre obras → itens separados no array.
- Se houver "Intervalo" entre peças → inserir "--- Intervalo ---" como item do array.
- "Repertório completo" aceito como valor literal.
- "Metacosmos" sozinho como repertório → valor literal aceito.
- localComplemento vem entre parênteses após o local (ex: "prédio Corpos Artísticos").
- "concertoNome" é o nome do programa/série (ex: "Metacosmos"), não o tipo do evento.
- Avisos globais da semana (IMPORTANTE:, Lembrando:) → "avisos_semana".
- "Cronograma sujeito a alterações." → IGNORAR.
- Datas no formato YYYY-MM-DD.

Texto do e-mail: {EMAIL_TEXT}
```

---

## Arquivos a Criar / Modificar

### Front-end Público

| Ação | Arquivo | O que muda |
|---|---|---|
| **MODIFY** | `index.html` | Adicionar `#calendario-section`, modal, script `calendario.js`; remover `#pdf-grid` e botões PDF quando toggle ON |
| **NEW** | `assets/js/public/calendario.js` | Toda a lógica do calendário (onSnapshot, régua, dots, filtros, cards, modal, cache, deep link) |
| **MODIFY** | `assets/css/public.css` | Estilos do calendário: strip, cards, filtros, modal, detail cards empilhados |

### Painel Administrativo

| Ação | Arquivo | O que muda |
|---|---|---|
| **MODIFY** | `admin.html` | Nova seção "Gerenciar Calendário" com form, listagem e textarea IA |
| **MODIFY** | `assets/js/admin/admin.js` | CRUD de eventos, parser IA com prévia, validação toggle |
| **MODIFY** | `assets/css/admin.css` | Estilos da seção calendário no admin |

### Backend

| Ação | Arquivo | O que muda |
|---|---|---|
| **MODIFY** | `functions/index.js` | Nova função `parseScheduleWithGemini` (HTTP callable) |
| **MODIFY** | `firebase/firestore.rules` | Leitura pública de `/eventos` e `/avisos_semana`; escrita só admin |

---

## Firestore Security Rules

```firestore
match /eventos/{eventoId} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.token.admin == true;
}
match /avisos_semana/{avisoId} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.token.admin == true;
}
match /config/app {
  allow read: if true;
  allow write: if request.auth != null && request.auth.token.admin == true;
}
```

---

## Plano de Rollout

```
LOCAL (agora)
  Toggle ON por padrão → desenvolver e validar visualmente
  PDFs somem → calendário aparece

STAGING / PRODUÇÃO
  Toggle OFF → músicos continuam vendo PDFs
  Admin cadastra eventos da semana (manual ou via IA)
  Admin valida o visual

ATIVAÇÃO
  Admin liga toggle ON
  Monitora por 1 semana · colhe feedback

FUTURO (fora do escopo agora)
  Botão de compartilhar evento (navigator.share)
  Haptic feedback mobile
```

---

## Fora do Escopo (removido/adiado)

| Feature | Decisão |
|---|---|
| Confirmação de presença | ❌ Não será implementada |
| Push notification ao salvar evento | ❌ Não por enquanto (só bolinha vermelha) |
| Filtro por naipe na régua | ❌ Não nesta versão |
| Botão Compartilhar | ⏳ Fase futura |

---

## Checklist de Verificação

### Funcional
- [ ] Toggle OFF → PDFs exibidos normalmente
- [ ] Toggle ON → PDFs e botões somem, calendário aparece
- [ ] Header de mês atualiza por scroll (IntersectionObserver)
- [ ] Snap automático ao primeiro dia do novo mês ao scrollar
- [ ] Dia com múltiplos eventos → dots múltiplos, cards empilhados
- [ ] Dots corretos: verde/tutti, amarelo/concerto, azul/naipe
- [ ] Máximo 3 dots visíveis + `+N` se houver mais
- [ ] Bolinha vermelha 🔴 em dias atualizados nas últimas 48h
- [ ] Filtros acinzentam (não removem) dias sem o tipo selecionado
- [ ] `avisos_semana` exibido no topo do card em faixa bordô/laranja
- [ ] `avisos` do dia em box amarelo destacado
- [ ] `"--- Intervalo ---"` renderiza como divisor visual no repertório
- [ ] `"Repertório completo"` exibido em itálico
- [ ] `localComplemento` exibido em tom suave após `·`
- [ ] Link "Ver no Maps" só aparece se `localMapsUrl` preenchido
- [ ] Estado vazio elegante para dias sem evento
- [ ] Cache offline funciona (desligar rede → dados do cache)
- [ ] Deep link `?data=28-04-2026` abre o dia correto
- [ ] Formato de data em toda a UI: DD/MM/AAAA
- [ ] Parser IA separa "/" e "e" em itens distintos do repertório
- [ ] Parser IA reconhece "IMPORTANTE:" como aviso_semana
- [ ] Prévia editável antes de publicar
- [ ] Texto original do e-mail salvo em `fonteEmailOriginal`
- [ ] Validação de eventos ao ativar toggle

### Acessibilidade
- [ ] Modal com `role="dialog"`, `aria-modal`, trap de foco, ESC fecha
- [ ] Régua navegável por teclado
- [ ] `aria-live` atualiza leitores de tela ao mudar de dia
- [ ] Skeleton loading em todos os componentes
