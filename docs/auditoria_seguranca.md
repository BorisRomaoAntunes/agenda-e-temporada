# 🔒 Auditoria Completa de Segurança — Projeto OER

> [!CAUTION]
> **Foram encontradas vulnerabilidades CRÍTICAS** que permitem acesso não autorizado a dados sensíveis (incluindo atestados médicos) e manipulação completa do banco de dados por qualquer pessoa com uma conta Firebase. **Ação imediata é necessária.**

---

## 📊 Resumo Executivo

| Severidade | Qtd | Impacto |
|---|---|---|
| 🔴 **CRITICAL** | 12 | Acesso não autorizado, exposição de credenciais, upload público sem restrição |
| 🟠 **HIGH** | 14 | XSS massivo, dados médicos expostos, funções sem verificação admin |
| 🟡 **MEDIUM** | 15 | Rate limiting ausente, cache poisoning, validação de entrada fraca |
| 🔵 **LOW** | 8 | Logs sensíveis, dependências desatualizadas, código não minificado |
| ℹ️ **INFO** | 10 | Boas práticas, observações gerais |

---

## 🔴 CRITICAL — Ação Imediata Necessária

---

### CRIT-01: Firestore Rules — Qualquer Usuário Autenticado Tem Escrita Total

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules)
- **Linhas:** 7-63

> [!CAUTION]
> A função `isSignedIn()` verifica apenas `request.auth != null`. **NÃO EXISTE** verificação de claims de admin (`request.auth.token.admin == true`). Qualquer pessoa que crie uma conta Firebase tem escrita TOTAL em TODAS as coleções.

**Coleções afetadas:**
| Coleção | Linha | Risco |
|---|---|---|
| `config` | 14 | Alterar configurações globais do app |
| `adminNotifications` | 20 | Enviar notificações falsas para todos |
| `dynamicLinks` | 31 | Criar links maliciosos |
| `eventos` | 37 | Manipular calendário |
| `avisos_semana` | 42 | Alterar avisos semanais |
| `adminLogs` | 47 | Manipular logs de auditoria |
| `scheduledNotifications` | 57 | Agendar notificações push |
| `medicalCertificates` | 63 | Acessar/alterar dados médicos (LGPD!) |

**Cenário de ataque:** Atacante → Cria conta via Firebase Auth SDK → Ganha escrita total

**Remediação:**
```javascript
function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}
// Substituir isSignedIn() por isAdmin() em TODAS as operações de escrita admin
```

---

### CRIT-02: Storage Rules — Upload Público Sem NENHUMA Restrição

- **Arquivo:** [storage.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/storage.rules), Linha 22

```
match /atestados_temp/{allPaths=**} {
  allow write: if true; // ⚠️ Qualquer pessoa na internet pode fazer upload
```

**Riscos:**
- 💰 **DoS financeiro** — upload de GBs de dados gerando custos no GCP
- 🦠 **Upload de malware** — sem validação de tipo de arquivo
- 📦 **Abuso de armazenamento** — sem limite de tamanho
- A Cloud Function `onAtestadoUpload` processará QUALQUER arquivo, consumindo créditos da API Gemini

**Remediação:**
```
allow write: if request.resource.size < 10 * 1024 * 1024  // 10MB max
             && (request.resource.contentType.matches('image/.*') 
                 || request.resource.contentType == 'application/pdf');
```

---

### CRIT-03: Storage Rules — Regra Default Abre TUDO

- **Arquivo:** [storage.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/storage.rules), Linhas 32-35

```
match /{allPaths=**} {
  allow read: if true;      // ⚠️ TUDO é público para leitura
  allow write: if request.auth != null;  // ⚠️ Qualquer autenticado escreve em qualquer path
}
```

**Impacto:** Anula TODAS as regras específicas acima. Qualquer arquivo presente ou futuro no Storage é publicamente acessível.

**Remediação:** Mudar para `allow read, write: if false;`

---

### CRIT-04: Storage Rules — Sem Validação de Tipo/Tamanho em NENHUM Path

- **Arquivo:** [storage.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/storage.rules)
- **NENHUMA** regra verifica `request.resource.contentType` ou `request.resource.size`
- Executáveis, scripts e arquivos maliciosos podem ser armazenados

---

### CRIT-05: CORS Wildcard — Qualquer Site Acessa Seus Arquivos

- **Arquivo:** [cors.json](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/cors.json)

```json
{
  "origin": ["*"],
  "method": ["GET"],
  "maxAge": 3600
}
```

**Impacto:** Qualquer site malicioso pode acessar seus arquivos do Storage diretamente.

**Remediação:** Restringir a origens específicas:
```json
{
  "origin": ["https://oer-agenda.web.app", "https://oer-app-8a5f0.web.app"],
  "method": ["GET"],
  "maxAge": 3600
}
```

---

### CRIT-06: Firestore Rules — Escrita Pública na Coleção `fcmTokens`

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules), Linha 26

```
allow write: if true; // Permite que usuários se inscrevam sem login
```

**Riscos:**
- Inundar a coleção com milhões de documentos falsos (custo financeiro)
- Injetar tokens FCM falsos
- Deletar tokens de outros usuários (se o ID do documento for conhecido)

---

### CRIT-07: Firestore Rules — Escrita Pública na Coleção `engagement`

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules), Linha 69

```
allow create, update: if true;
```

**Impacto:** Manipulação de métricas de engajamento, abuso de armazenamento

---

### CRIT-08: Credenciais de Admin Hardcoded

- **Arquivo:** [create_prod_user.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/create_prod_user.js), Linhas 8-10

```js
email: 'romaoboris@gmail.com',
password: 'OER@2026',
displayName: 'Boris Romao (Produção)'
```

> [!CAUTION]
> Senha do admin de produção em texto puro. Mesmo que o arquivo esteja no `.gitignore`, está no iCloud Drive (`Mobile Documents/com~apple~CloudDocs`) — sincronizado para todos os dispositivos.

**Ação:** Trocar a senha IMEDIATAMENTE e deletar este arquivo.

---

### CRIT-09: Credenciais de Teste Hardcoded (Mesma Senha!)

- **Arquivo:** [create_test_user.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/create_test_user.js), Linhas 9-11
- Mesma senha `OER@2026`
- **Este arquivo NÃO está no `.gitignore`** — pode ter sido commitado ao repositório!

---

### CRIT-10: Chave de API Gemini Hardcoded no `.env`

- **Arquivo:** [.env](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/.env), Linha 3

```
GEMINI_API_KEY=AIzaSyCpx1DD9AE27PlezZsMmqXREYBT36QBbR4
```

**Impacto:** Chave em texto puro sincronizada via iCloud. Qualquer pessoa com acesso pode usar seus créditos da API Gemini.

**Remediação:** Usar `firebase functions:secrets:set GEMINI_API_KEY` (Secret Manager do GCP). Revogar e rotacionar a chave atual.

---

### CRIT-11: Firestore Rules — Leitura Pública em TODAS as Coleções

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules)
- **TODAS** as coleções têm `allow read: if true`
- Inclui dados pessoais de músicos, notificações, configurações, feedbacks
- Com a Firebase config exposta no client-side, qualquer pessoa pode baixar o banco inteiro

---

### CRIT-12: Firestore Rules — Ausência TOTAL de Validação de Campos

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules)
- **NENHUMA** regra usa `request.resource.data.keys().hasOnly([...])`, verificação de tipo, ou tamanho
- Qualquer campo arbitrário pode ser inserido em qualquer documento

---

## 🟠 HIGH — Prioridade Alta

---

### HIGH-01: XSS Massivo no `admin.js` (100+ ocorrências de `innerHTML`)

- **Arquivo:** [admin.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/assets/js/admin/admin.js)
- 100+ usos de `innerHTML` com dados do Firestore sem sanitização
- Se qualquer documento Firestore contiver `<img src=x onerror=alert(1)>`, executa no browser do admin
- **Combinado com CRIT-01** (qualquer autenticado pode escrever no Firestore), isso é uma **cadeia de ataque completa**: Atacante → escreve payload XSS no Firestore → admin abre painel → código malicioso executa com privilégios do admin

---

### HIGH-02: XSS nas Páginas Públicas

- **Arquivos afetados:**
  - [index.html](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/index.html) — Linhas 328-340, 395, 530
  - [preview.html](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/preview.html) — Linha 128+
  - [notifications.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/assets/js/public/notifications.js) — Linhas 198-260
  - [calendario.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/assets/js/public/calendario.js) — Linhas 193-246

---

### HIGH-03: Cloud Functions Sem Verificação de Admin Claim

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js)
- Funções que verificam apenas `request.auth` mas **NÃO** `request.auth.token.admin`:

| Função | Linha | Risco |
|---|---|---|
| `suggestNotificationText` | ~236 | Qualquer user consome créditos Gemini |
| `scheduleNotification` | ~476 | Qualquer user agenda notificações push |
| `parseScheduleWithGemini` | ~876 | Qualquer user consome créditos Gemini |
| `checkSubscribersNow` | ~998 | Qualquer user manipula tokens FCM |

**Remediação:**
```js
if (!request.auth || !request.auth.token.admin) {
  throw new HttpsError("permission-denied", "Apenas administradores.");
}
```

---

### HIGH-04: Atestados Médicos Processados — Acesso Sem Admin Check

- **Arquivo:** [storage.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/storage.rules), Linha 28

```
match /atestados_processed/{allPaths=**} {
  allow read, write: if request.auth != null;  // Comentário diz "Admin only" mas regra não implementa
```

**Impacto:** Dados médicos sensíveis (nome, CID, dias de afastamento) acessíveis por qualquer usuário autenticado. **Violação potencial da LGPD.**

---

### HIGH-05: Dados Médicos Armazenados Sem Criptografia

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js), Linhas 826-837
- Coleção `medicalCertificates` armazena em texto puro: nome do paciente, CID, dias de afastamento, resumo médico
- **LGPD exige proteção adequada de dados de saúde**

---

### HIGH-06: Leitura Pública de Dados Admin Sensíveis

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules)
- `adminNotifications` (L19): Histórico de notificações admin público
- `config` (L13): Feature flags e configurações internas públicas
- `medicalCertificates` com `allow read: if true` → dados de saúde públicos

---

### HIGH-07: Ausência Total de Security Headers no Firebase Hosting

- **Arquivo:** [firebase.json](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase.json)
- Headers ausentes: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`
- **Facilita ataques de XSS, clickjacking, MIME sniffing**

---

### HIGH-08: Guard de Autenticação Admin Inadequado

- **Arquivo:** [admin.html](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/admin.html)
- A página carrega completamente (HTML + todos os scripts) antes do JavaScript verificar autenticação
- A verificação `checkAdmin()` pode ser sobrescrita no console do browser
- Sem proteção server-side para a página admin

---

### HIGH-09: `fcmTokens` — Escrita Pública Permite Manipulação de Destinatários

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules), Linhas 24-27
- Permite `write` total (create, update, delete) sem autenticação
- Atacante pode deletar tokens legítimos ou injetar tokens falsos

---

### HIGH-10: Sem Rate Limiting em Cloud Functions

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js)
- Nenhuma função implementa rate limiting por usuário
- Funções que chamam API Gemini são especialmente vulneráveis a abuso financeiro

---

### HIGH-11: `set_admin_claim.js` — Sem Validação de Entrada

- **Arquivo:** [set_admin_claim.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/scripts/set_admin_claim.js)
- Email institucional hardcoded (Linha 9): `borisantunes@prefeitura.sp.gov.br`
- Sem confirmação antes de conceder privilégios admin

---

### HIGH-12: GitHub Actions — Merge Workflow Sem `permissions` Declaradas

- **Arquivo:** [firebase-hosting-merge.yml](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/.github/workflows/firebase-hosting-merge.yml)
- Herda permissões default do repositório (potencialmente amplas)
- **Remediação:** Adicionar `permissions: contents: read`

---

### HIGH-13: Firebase Hosting Serve Arquivos Sensíveis

- **Arquivo:** [firebase.json](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase.json)
- `"public": "."` — diretório raiz é servido
- Arquivos acessíveis publicamente: `package.json`, `package-lock.json`, `firestore-debug.log`, `functions_logs.txt`, `README.md`, `pdf-config.json`

---

### HIGH-14: Firebase App Check NÃO Configurado

- Nenhuma Cloud Function usa `appCheck` enforcement
- Qualquer cliente HTTP pode chamar as funções callable, não apenas o app oficial

---

## 🟡 MEDIUM — Prioridade Média

---

### MED-01: Notificações Push — Abuso em Massa

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js)
- Sem cooldown entre notificações, sem limite de frequência
- Sem sanitização de conteúdo (phishing via push notification)

---

### MED-02: Sem Validação de Input nas Cloud Functions

- Funções de criação/atualização de eventos não validam formatos de data
- `suggestNotificationText` — campo `image.inlineData.data` (base64) sem limite de tamanho
- `parseScheduleWithGemini` — `pdfBase64` e `text` sem limite de tamanho

---

### MED-03: `onAtestadoUpload` Processa Qualquer Tipo de Arquivo

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js), Linhas 582-592
- Não valida `contentType` antes de processar, consumindo recursos e créditos Gemini

---

### MED-04: `onPDFUpload` Sem Limite de Tamanho

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js), Linhas 506-576
- PDFs enormes podem causar timeout ou OOM (função tem apenas 512MB)

---

### MED-05: Erros Vazam Detalhes Internos

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js)
- Múltiplas funções retornam `error.message` ao cliente:
```js
throw new HttpsError("internal", "Erro: " + error.message);
```
- Pode vazar detalhes da API Gemini, estrutura do Firestore, stack traces

---

### MED-06: DOM-Based Open Redirect

- **Arquivo:** [dynamic-links.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/assets/js/public/dynamic-links.js), Linhas 15-45
- Lê parâmetros da URL para determinar redirecionamento

---

### MED-07: FCM Token Armazenado no `localStorage`

- **Arquivo:** [notifications.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/assets/js/public/notifications.js), Linhas 30-50
- Combinado com XSS, tokens podem ser roubados

---

### MED-08: Upload de Atestado Sem Validação Client-Side

- **Arquivo:** [medical-cert.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/assets/js/public/medical-cert.js), Linhas 50-80
- Sem validação de tipo ou tamanho no cliente antes do upload

---

### MED-09: Content Security Policy Permite `unsafe-inline`

- **Arquivo:** [index.html](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/index.html), Linhas 25-26
- CSP existe mas permite `'unsafe-inline'` para scripts — reduz proteção contra XSS

---

### MED-10: Ausência de CSP nas Páginas Admin e Preview

- **Arquivos:** [admin.html](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/admin.html), [preview.html](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/preview.html)
- Sem meta tag CSP em nenhuma das páginas

---

### MED-11: Service Worker — Cache Poisoning

- **Arquivo:** [sw.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/sw.js), Linhas 99-115
- Estratégia stale-while-revalidate sem validação de integridade
- Resposta com status 200 é cacheada sem SRI

---

### MED-12: CDN com `@latest` — Supply Chain Risk

- **Arquivos:** [sw.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/sw.js) (Linhas 13-14), [index.html](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/index.html) (Linha 38)
```
https://unpkg.com/lucide@latest
https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js
```
- Versão não fixada + sem SRI = supply chain attack possível

---

### MED-13: Service Worker Cache Nunca Invalida

- **Arquivo:** [sw.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/sw.js), Linha 1
- Nome do cache `oer-agenda-v1` é estático — atualizações podem não propagar

---

### MED-14: `static.yml` Deploy do Diretório Raiz Completo

- **Arquivo:** [static.yml](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/.github/workflows/static.yml), Linha 40
- Faz upload de TODO o repositório como artefato para GitHub Pages

---

### MED-15: Firebase Admin SDK com Service Account Default

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js), Linhas 1-5
- Usa credenciais default que tipicamente têm permissões amplas
- Deveria usar service account de menor privilégio

---

## 🔵 LOW — Prioridade Baixa

---

### LOW-01: Console Logging de Dados Sensíveis (Backend)

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js)
- Logs contêm User IDs, FCM tokens, dados de documentos
- Logs do Cloud Functions acessíveis no Google Cloud Console
- Potencial violação da LGPD

---

### LOW-02: Console Logging de Dados Sensíveis (Frontend)

- Múltiplos arquivos JS logam tokens, IDs, dados de documentos no console do browser
- `admin.js`, `notifications.js` são os mais afetados

---

### LOW-03: `engagement` Collection — Create/Update Públicos

- **Arquivo:** [firestore.rules](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase/firestore.rules), Linhas 67-71
- Pode inflar métricas de engajamento

---

### LOW-04: Tokens FCM Usados como Document IDs

- **Arquivo:** [index.js](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/index.js)
- Se token contiver caracteres especiais ou ultrapassar 1500 bytes (limite Firestore), causa erros silenciosos
- Deveria usar hash do token como document ID

---

### LOW-05: `.gitignore` Incompleto

- Falta excluir: `firestore-debug.log`, `functions_logs.txt`
- `create_test_user.js` NÃO está excluído (contém credenciais)

---

### LOW-06: JavaScript Não Minificado

- Todos os arquivos JS servidos sem minificação
- Facilita engenharia reversa e descoberta de vulnerabilidades

---

### LOW-07: Long Cache Duration para JS/CSS

- **Arquivo:** [firebase.json](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/firebase.json)
- `max-age=604800` (7 dias) — patches de segurança demoram a propagar

---

### LOW-08: `node-fetch` v2 em Manutenção

- **Arquivo:** [package.json](file:///Users/borisromaoantunes/Library/Mobile%20Documents/com~apple~CloudDocs/Developer/AI/Projeto%20-%20OER/functions/package.json)
- Pode ter vulnerabilidades não corrigidas
- Executar `npm audit` para verificar

---

## ℹ️ INFO — Observações

---

| # | Observação |
|---|---|
| 1 | Nenhum uso de `eval()` ou funções perigosas detectado ✅ |
| 2 | Nenhuma vulnerabilidade de SQL/NoSQL injection detectada ✅ |
| 3 | Nenhum teste automatizado (unit, integration, security) no projeto |
| 4 | Sem versionamento de API nas Cloud Functions |
| 5 | `functions_logs.txt` no diretório raiz pode ter sido commitado |
| 6 | Firebase config exposta no client é normal para Firebase, mas reforça necessidade de rules seguras |
| 7 | VAPID key exposta no client é normal por design |
| 8 | `pdf-config.json` e `manifest.json` sem problemas de segurança |
| 9 | Código duplicado em `calendario.js` (raiz vs public/) aumenta risco de patches inconsistentes |
| 10 | Sem `package-lock.json` consistente entre ambientes |

---

## 🎯 Plano de Remediação Prioritizado

> [!IMPORTANT]
> Recomendo executar as correções nesta ordem exata:

### Fase 1 — Urgente (Hoje) 🔥
1. **Trocar senha do admin** (`OER@2026`) — está exposta em arquivos
2. **Revogar e rotacionar** a chave Gemini API
3. **Implementar `isAdmin()`** nas Firestore Rules para TODAS as escritas admin
4. **Fechar regra default** do Storage (`allow read: if false`)
5. **Restringir upload** de `atestados_temp/` (tipo + tamanho)
6. **Restringir CORS** a origens específicas

### Fase 2 — Prioridade Alta (Esta Semana) 🟠
7. Adicionar verificação de admin claim em TODAS as Cloud Functions callable
8. Restringir acesso a `atestados_processed/` (admin only)
9. Configurar security headers no Firebase Hosting
10. Adicionar validação de campos nas Firestore Rules
11. Configurar Firebase App Check
12. Deletar `create_prod_user.js` e `create_test_user.js`

### Fase 3 — Prioridade Média (Próximas 2 Semanas) 🟡
13. Sanitizar TODOS os `innerHTML` (usar `textContent` ou DOMPurify)
14. Implementar rate limiting nas Cloud Functions
15. Adicionar CSP em `admin.html` e `preview.html`
16. Fixar versões de CDNs e adicionar SRI
17. Adicionar validação de input em Cloud Functions

### Fase 4 — Melhorias Contínuas 🔵
18. Minificar JavaScript para produção
19. Implementar logging seguro (sem dados sensíveis)
20. Adicionar testes de segurança automatizados
21. Atualizar `.gitignore`
22. Considerar criptografia adicional para dados médicos (LGPD)

---

> [!NOTE]
> Esta auditoria foi realizada em 23/05/2026 com base na análise estática do código-fonte. Recomenda-se também realizar testes de penetração dinâmicos e executar `npm audit` para verificar vulnerabilidades em dependências.
