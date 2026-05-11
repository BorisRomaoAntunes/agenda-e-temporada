# Agenda Digital OER 🎵

> Um ecossistema moderno e robusto desenvolvido para a **Orquestra Experimental de Repertório (OER)**, permitindo que músicos acompanhem atualizações de cronogramas e avisos em tempo real, com gestão simplificada via painel administrativo.

---

## 🌐 Endereços Oficiais

*   **Público (Músicos):** [oer-agenda.web.app](https://oer-agenda.web.app/)
*   **Gestão (Painel Admin):** [oer-agenda.web.app/admin.html](https://oer-agenda.web.app/admin.html)

---

## ✨ Funcionalidades Principais

### 📱 Para os Músicos (Site Público)
*   **Visualização Instantânea:** Acesso direto à Agenda de Ensaios e Temporada 2026 com carregamento otimizado.
*   **Performance & UX:** Uso de *Skeleton Screens* para carregamento visual suave e pré-carregamento preditivo em desktops.
*   **PWA (Progressive Web App):** Instale o site como um aplicativo no celular para acesso rápido e offline básico.
*   **Gestão de Cache Inteligente:** O sistema gerencia automaticamente o armazenamento do celular, removendo versões antigas de PDFs para economizar memória.
*   **Notificações Push:** Sistema de alertas para novos arquivos ou comunicados urgentes (suporta iOS e Android).
*   **Letreiro Dinâmico (Ticker):** Exibição de mensagens rápidas e avisos importantes no topo do site.
*   **Histórico de Avisos:** Central de comunicados passados com suporte a imagens e carregamento sob demanda (*lazy loading*).
*   **Links Dinâmicos:** Botões configuráveis para formulários, editais e recursos externos com ícones personalizados.

### 🔐 Para a Administração (Painel Admin)
*   **Dashboard em Tempo Real:** Monitoramento do número de músicos inscritos para notificações.
*   **Gestão de Arquivos:** Upload de novos PDFs com validação automática de tamanho e otimização estrutural no servidor.
*   **Otimização de Servidor:** Cloud Functions processam PDFs recém-carregados para reduzir o peso e melhorar a velocidade de download.
*   **Disparo de Comunicados:** Envio de notificações push com títulos, mensagens e imagens opcionais.
*   **Robô OER (IA):** Integração com inteligência artificial para sugerir textos criativos e profissionais para os avisos.
*   **Histórico de Atividade:** Log detalhado de todas as alterações feitas no sistema (Uploads, Avisos, Mudanças de Links, Otimizações).
*   **Controle de Links:** Adição, edição e remoção de botões extras no site público com seletor de ícones intuitivo.
*   **Ambiente de Testes:** Alternância rápida entre modo Produção e Emuladores para desenvolvimento seguro.

---

## 🛠️ Tecnologia e Arquitetura

O projeto utiliza o estado da arte em serviços de nuvem:

*   **Frontend:** HTML5, Vanilla CSS3 (Design System Premium), JavaScript (ES6+ Modular).
*   **Banco de Dados:** **Firebase Firestore** para sincronização em tempo real.
*   **Hospedagem:** **Firebase Hosting** com certificação SSL automática.
*   **Backend:** **Cloud Functions (Node.js 22)** para tarefas automatizadas e integração com IA.
*   **Notificações:** **Firebase Cloud Messaging (FCM)**.
*   **Armazenamento:** **Firebase Storage** para os arquivos PDF e imagens.
*   **IA:** **Google Gemini API** alimentando as sugestões do Robô OER.
*   **Ícones:** **Lucide Icons** para uma interface limpa e moderna.

---

## 🚀 Guia de Manutenção (Admin)

A gestão do site não exige mais edição de códigos ou commits manuais para conteúdo:

1.  **Login:** Acesse o `/admin.html` com suas credenciais.
2.  **Arquivos:** Arraste o novo PDF para a área de upload na aba "Temporada & Agenda" e clique em enviar.
3.  **Notificações:** Use a aba "Avisos" para disparar alertas. Experimente o **Robô OER** para ajuda com o texto.
4.  **Links:** Na aba "Links Temporários", você pode criar botões para pesquisas ou formulários externos que aparecem no topo do site dos músicos.

---

<p align="center">
  <img src="assets/img/logo_oer.png" alt="OER Logo" width="100">
  <br>
  <small>© 2026 Projeto OER. Desenvolvido por Boris Romão Antunes.</small>
</p>

