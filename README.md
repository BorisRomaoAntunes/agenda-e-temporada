# Visualizador de Agenda Digital - OER 🌟

Este é um site moderno e otimizado para a visualização da agenda de ensaios e temporada da **Orquestra Experimental de Repertório (OER)**. O sistema foi desenvolvido para ser rápido, intuitivo e ajudar os músicos a identificarem atualizações instantaneamente.

🌐 **Acesse em:** [https://borisromaoantunes.github.io/agenda-e-temporada/](https://borisromaoantunes.github.io/agenda-e-temporada/)

🧪 **Site de Teste:** [https://agenda-e-temporada.vercel.app](https://agenda-e-temporada.vercel.app)

---

## ✨ Funcionalidades Principais

-   **Carregamento Dinâmico:** Os arquivos PDF são configurados via JSON, facilitando a troca sem mexer no HTML.
-   **Sistema de Badges Inteligentes (Selo OER):**
    -   Exibe um "selo" de nova versão (v1.2, v2.0, etc) rotacionado em 25º no estilo carimbo.
    -   **Remoção Inteligente (Desktop):** O selo desaparece suavemente ao detectar qualquer movimento do mouse ou clique, limpando a visão para o músico.
    -   **Persistência:** O sistema lembra se o músico já viu aquela versão (usando localStorage), ocultando o badge em acessos futuros.
-   **Design Premium:** Interface limpa, modo escuro elegante e tipografia moderna (Inter).
-   **Responsividade:** Otimizado para visualização em tablets/computadores e acesso rápido via botões no celular.

---

## 🚀 Como Atualizar os PDFs

Para atualizar a temporada ou agenda no site, siga estes passos:

1.  **Prepare o arquivo:** Nomeie o PDF terminando com a versão (ex: `Agenda_v4.2.pdf`).
2.  **Upload:** Coloque o novo arquivo na pasta `assets/files/`.
3.  **Configuração:** Abra `pdf-config.json` e atualize o campo `arquivo` do PDF correspondente:
    ```json
    "agenda": {
        "arquivo": "Agenda_v4.2.pdf",
        "titulo": "Agenda de Ensaios"
    }
    ```
4.  **Publicar:** Faça o **commit** e **push** para o GitHub. O site será atualizado automaticamente!

---

## 🛠 Estrutura Técnica

-   `index.html`: Estrutura base e visualizadores.
-   `pdf-config.json`: "Cérebro" do site, onde se define o que está no ar.
-   `assets/js/version-tracker.js`: Controla a lógica de versões, selos e interações.
-   `assets/css/style.css`: Estilização completa e efeitos visuais.

---
© 2025 Projeto OER. Desenvolvido por Boris Romão Antunes.
