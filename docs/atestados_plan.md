# Plano de Implementação - Sistema de Atestados OER

Este documento descreve as fases de implementação do sistema de processamento inteligente de atestados médicos da Orquestra Experimental de Repertório, utilizando Gemini AI para extração de dados e automação administrativa.

## Fase 1: Infraestrutura e Controle (Admin)
- [ ] Adicionar um novo toggle no modal de "Ajustes do Sistema" do Admin: **"Módulo de Atestados"**.
- [ ] Definir o estado inicial como **Desativado** (Off).
- [ ] Configurar regras de segurança do Firebase Firestore e Storage para a coleção `medicalCertificates` e pastas de atestados.

## Fase 2: O "Cérebro" do Robô (Cloud Functions + IA)
- [ ] Criar Cloud Function `onAtestadoUpload` acionada por arquivos na pasta `atestados_temp/`.
- [ ] Implementar conversão automática de Imagem para PDF (usando `pdf-lib`).
- [ ] Integração com Gemini 1.5 Flash para extração de dados: Nome, CID, Data e Período de Afastamento.
- [ ] Geração de página anexa ao final do PDF com a explicação detalhada do CID.
- [ ] Renomeação automática: `atestado_[NOME]_[DATA]_[DIAS]dias_CID_[CODIGO].pdf`.
- [ ] Salvar metadados no Firestore (`medicalCertificates`) com status `pendente`.

## Fase 3: Gestão Admin (Grid e Visualização)
- [ ] Criar grade de cards quadrados (mesma altura/largura do card de inscritos) no topo da aba "Histórico".
- [ ] Implementar modal com visualizador de PDF integrado e resumo lateral da IA.
- [ ] Botão de edição para ajustes manuais nos dados extraídos.
- [ ] Botão "Baixar e Apagar": Inicia download local e remove arquivo/registro do servidor.

## Fase 4: Interface do Músico (Site Público)
- [ ] Adicionar botão "📄 Enviar Atestado Médico" no `index.html`.
- [ ] Implementar modal de upload com design *glassmorphism*, barra de progresso e animação de sucesso.
- [ ] Vincular visibilidade do botão ao estado do toggle configurado na Fase 1.

## Fase 5: Validação e Lançamento
- [ ] Testes ponta-a-ponta com diversos formatos de arquivos e caligrafias.
- [ ] Refinamentos de UX/UI.
- [ ] Ativação oficial da funcionalidade.
