# Guia de Configuração do Power Automate: Webhook de Cadastro de Bolsistas e Monitores

Este guia fornece o passo a passo detalhado para configurar um fluxo automatizado na nuvem no **Microsoft Power Automate**, integrando as respostas de formulários (ex: **Microsoft Forms**) à **Cloud Function Webhook** do Firebase.

---

## 1. Visão Geral do Fluxo

```
[ Bolsista / Monitor preenche o Microsoft Forms ]
                         │
                         ▼
[ Gatilho Power Automate: Quando uma nova resposta é enviada ]
                         │
                         ▼
[ Ação: Obter os detalhes da resposta ]
                         │
                         ▼
[ Ação: HTTP (POST) para a Cloud Function ]
  - Headers: x-api-key + Content-Type: application/json
  - Body: JSON com os dados preenchidos
                         │
                         ▼
[ Cloud Function: Valida chave, higieniza CPF e checa duplicidade ]
                         │
                         ▼
[ Firestore: Salvo na fila 'cadastros_pendentes' ]
                         │
                         ▼
[ Painel Admin OER: Notificação em tempo real para revisão e homologação ]
```

---

## 2. Pré-requisitos e URL da Cloud Function

### 2.1 Definir o Segredo de Autenticação no Firebase
Para garantir a segurança contra acessos indevidos, a função valida o cabeçalho `x-api-key`. Crie um token secreto forte (ex: `oer_sec_` seguido de caracteres aleatórios) e registre-o no Firebase Secret Manager:

```bash
firebase functions:secrets:set WEBHOOK_SECRET
```
*(Digite o token secreto escolhido quando solicitado pelo terminal).*

### 2.2 Endpoint da Cloud Function
Após o deploy das Cloud Functions, o endpoint estará disponível no seguinte formato:
```
https://us-central1-oer-agenda.cloudfunctions.net/webhookCadastroBolsista
```
*(Substitua `oer-agenda` e a região se seu projeto Firebase utilizar outra região/id).*

---

## 3. Passo a Passo no Power Automate

### Passo 1: Criar um Novo Fluxo
1. Acesse o portal do **Power Automate** ([make.powerautomate.com](https://make.powerautomate.com)).
2. No menu lateral esquerdo, clique em **Criar** > **Fluxo de nuvem automatizado** (*Automated cloud flow*).
3. Dê um nome ao fluxo, por exemplo: `OER - Enviar Cadastro Bolsista/Monitor para Sistema`.
4. No campo de pesquisa de gatilhos, selecione:
   - **Quando uma nova resposta é enviada** (*When a new response is submitted* - Microsoft Forms).
5. Clique em **Criar**.

---

### Passo 2: Configurar o Gatilho do Formulário
1. No card do gatilho **Quando uma nova resposta é enviada**:
   - No campo **Código do formulário** (*Form Id*), selecione o formulário correspondente na lista (ex: *Ficha Cadastral de Bolsistas e Monitores OER*).

---

### Passo 3: Obter Detalhes da Resposta
1. Clique em **+ Nova etapa** (*+ New step*).
2. Pesquise por **Microsoft Forms** e selecione a ação **Obter detalhes da resposta** (*Get response details*).
3. Configure os campos:
   - **Código do formulário**: Selecione o mesmo formulário do Passo 2.
   - **Identificação da resposta**: Selecione o conteúdo dinâmico `ID da resposta` (*Response Id*) vindo do gatilho anterior.

---

### Passo 4: Adicionar a Ação HTTP (Envio Seguro ao Webhook)
1. Clique em **+ Nova etapa** (*+ New step*).
2. Pesquise por **HTTP** e selecione a ação **HTTP** (ícone do globo).
3. Preencha os parâmetros da seguinte forma:

| Campo | Valor / Configuração |
| :--- | :--- |
| **Método** (*Method*) | `POST` |
| **URI** | `https://us-central1-oer-agenda.cloudfunctions.net/webhookCadastroBolsista` |
| **Cabeçalhos** (*Headers*) | Inserir duas linhas: <br>1. Chave: `Content-Type` \| Valor: `application/json` <br>2. Chave: `x-api-key` \| Valor: `SEU_TOKEN_SECRETO_CONFIGURADO` |

4. No campo **Corpo** (*Body*), monte o JSON utilizando os campos dinâmicos retornados pela etapa *Obter detalhes da resposta*.

#### Modelo de JSON para o Campo Corpo (Body):
Copie o JSON abaixo e, no Power Automate, substitua os valores entre as aspas pelos **conteúdos dinâmicos** correspondentes de cada pergunta do formulário:

```json
{
  "nomeArtistico": "@{outputs('Obter_detalhes_da_resposta')?['body/r8624bc5...']}",
  "nomeRegistro": "@{outputs('Obter_detalhes_da_resposta')?['body/r7319fa1...']}",
  "instrumento": "@{outputs('Obter_detalhes_da_resposta')?['body/r6153ba9...']}",
  "cpf": "@{outputs('Obter_detalhes_da_resposta')?['body/r5819ba2...']}",
  "status": "@{outputs('Obter_detalhes_da_resposta')?['body/r4821cc3...']}",
  "email": "@{outputs('Obter_detalhes_da_resposta')?['body/r3918aa4...']}",
  "telefone": "@{outputs('Obter_detalhes_da_resposta')?['body/r2716bb5...']}",
  "dataNascimento": "@{outputs('Obter_detalhes_da_resposta')?['body/r1904ff6...']}",
  "rg": "@{outputs('Obter_detalhes_da_resposta')?['body/r0823dd7...']}",
  "pis": "@{outputs('Obter_detalhes_da_resposta')?['body/r9876ee8...']}",
  "genero": "@{outputs('Obter_detalhes_da_resposta')?['body/r8765ff9...']}",
  "banco": "@{outputs('Obter_detalhes_da_resposta')?['body/r7654aa0...']}",
  "agencia": "@{outputs('Obter_detalhes_da_resposta')?['body/r6543bb1...']}",
  "conta": "@{outputs('Obter_detalhes_da_resposta')?['body/r5432cc2...']}",
  "endereco": "@{outputs('Obter_detalhes_da_resposta')?['body/r4321dd3...']}",
  "cep": "@{outputs('Obter_detalhes_da_resposta')?['body/r3210ee4...']}",
  "restricaoAlimentar": "@{outputs('Obter_detalhes_da_resposta')?['body/r2109ff5...']}",
  "dadosCarro": "@{outputs('Obter_detalhes_da_resposta')?['body/r1098aa6...']}",
  "tipoContrato": "Bolsista",
  "inicioContrato": "@{outputs('Obter_detalhes_da_resposta')?['body/r0987bb7...']}",
  "terminoContrato": "@{outputs('Obter_detalhes_da_resposta')?['body/r9876cc8...']}",
  "cadernoExcertos": "@{outputs('Obter_detalhes_da_resposta')?['body/r8765dd9...']}",
  "escalado": "Escalado"
}
```

> **Dica**: **Campos Obrigatórios**: Apenas o **CPF** e pelo menos um dos campos de **Nome** (`nomeArtistico` ou `nomeRegistro`) são estritamente obrigatórios para o recebimento. Caso algum campo opcional não exista no seu formulário, você pode omiti-lo do JSON com segurança.

---

### Passo 5: Tratamento de Respostas e Boas Práticas (Opcional)
Para garantir resiliência no envio:
1. No canto superior direito da ação **HTTP**, clique nos três pontinhos (`...`) e selecione **Configurações** (*Settings*).
2. Em **Segurança**:
   - Ative **Entradas Seguras** (*Secure Inputs*) e **Saídas Seguras** (*Secure Outputs*) para ocultar a chave de API dos logs de execução do Power Automate.
3. Em **Política de Repetição** (*Retry Policy*):
   - Mantenha como **Padrão** (o Power Automate tentará reenviar automaticamente caso a Cloud Function sofra alguma oscilação temporária de rede).
4. Clique em **Concluído**.

---

## 4. Dicionário Completo de Campos Aceitos pelo Webhook

A Cloud Function é flexível e aceita tanto as propriedades em camelCase quanto os nomes exatos das colunas da planilha do Excel da OER:

| Propriedade no JSON | Nome da Coluna Equivalente (Excel OER) | Descrição / Formato |
| :--- | :--- | :--- |
| `cpf` ou `CPF` | `CPF` | **Obrigatório**. 11 dígitos numéricos (com ou sem pontuação). |
| `nomeArtistico` | `NOMEARTISTICO` | Nome artístico do músico (ex: Maria Monteiro). |
| `nomeRegistro` | `NOME REGISTRO` | Nome de registro civil completo (ex: Maria Fernanda Monteiro). |
| `instrumento` | `INSTRUMENTOS` | Naipe / Instrumento (ex: Violino, Trompa, Percussão). |
| `status` | `Status` | `Bolsista` ou `Monitor` (padrão se vazio: `Bolsista`). |
| `email` | `EMAIL` | E-mail de contato do músico. |
| `telefone` | `TELEFONE` | Telefone celular (com DDD). |
| `dataNascimento` | `DATA DE NACIMENTO ` | Data de nascimento (`DD/MM/AAAA` ou formato ISO). |
| `rg` | `RG` | Documento de Identidade (RG). |
| `pis` | `PIS/PASEP` | PIS ou PASEP. |
| `genero` | `GENERO` | Gênero informado. |
| `banco` | `Banco ` | Nome ou código da instituição bancária. |
| `agencia` | `Agencia ` | Número da agência bancária. |
| `conta` | `Conta Corrente ` | Número da conta corrente com dígito. |
| `endereco` | `Endereço` | Logradouro, número, complemento e bairro. |
| `cep` | `CEP` | CEP residencial (ex: 01000-000). |
| `restricaoAlimentar`| `Restrição Alimentar` | Restrições alimentares (ex: Vegetariano, Vegano, Celíaco). |
| `dadosCarro` | `Dados Carro` | Modelo e placa do veículo para acesso / estacionamento. |
| `tipoContrato` | `Tipo Contrato...` | Tipo de contrato (ex: Bolsista, Monitor). |
| `inicioContrato` | `INICIO OER Contrato` | Data de início do contrato. |
| `terminoContrato` | `TERMINO OER Contrato` | Data de término do contrato. |
| `cadernoExcertos` | `Data de Envio...` | Data de envio do caderno de excertos. |
| `escalado` | `Escalado` | Situação de escala (`Escalado` / `Não`). |

---

## 5. Como Funciona a Homologação no Painel Admin

1. Assim que a Cloud Function recebe a requisição do Power Automate:
   - Valida o CPF e verifica se ele já existe na coleção `musicos`.
   - Se já existir, marca como `conflito: true` e preserva os dados antigos para comparação.
   - Grava a submissão na coleção `cadastros_pendentes` com status `pendente`.
2. No **Painel Administrativo da OER**:
   - Um novo card de **Novos Cadastros Pendentes** surge em tempo real na tela inicial.
   - O card destaca se é um **Novo Bolsista** (verde) ou uma **Atualização / CPF Existente** (laranja).
   - O administrador clica em **Revisar Cadastro**: abre-se a gaveta com todos os campos preenchidos.
   - O administrador pode ajustar qualquer campo e clicar em **Validar & Adicionar ao Sistema**.
   - O bolsista/monitor é automaticamente inserido como **ativo** na coleção oficial `musicos`, o pendente é concluído e o cache do sistema é atualizado instantaneamente!
