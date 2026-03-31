# Visualizador de Agenda Digital - OER 🎵

> Um portal moderno e otimizado para que os músicos da **Orquestra Experimental de Repertório (OER)** acompanhem, de maneira instantânea e clara, as atualizações da Temporada e da Agenda de Ensaios.

🌐 **Produção:** [https://borisromaoantunes.github.io/agenda-e-temporada/](https://borisromaoantunes.github.io/agenda-e-temporada/)  
🧪 **Homologação/Testes:** [https://agenda-e-temporada.vercel.app](https://agenda-e-temporada.vercel.app)

---

## ✨ Principais Funcionalidades

- **Gerenciamento Descentralizado:** A troca de arquivos PDF ocorre alterando apenas um arquivo de texto comum (JSON), sem necessidade de editar o código-fonte HTML da plataforma.
- **Sistema Inteligente de Controle de Versões (Selo OER):**
  - Rastreador visual de "Selo de Arquivo Novo" estilo carimbo (ex: `v2.0`).
  - Ocultamento inteligente para não prejudicar a leitura: o selo desaparece em computadores assim que o músico interage (move o mouse ou clica).
  - Controle de visualização única (`localStorage`): Se o usuário já checou ou fez download de uma versão da agenda, não verá o alerta de notificação até que uma nova versão seja lançada.
- **Feedback com Contexto do Dispositivo:** Um botão inteligente de reporte de problemas que coleta com precisão a data, o aparelho, o sistema operacional e a resolução do usuário no momento do clique.
- **Compatibilidade Multiplataforma:** 
  - Interface desktop em modo leitura imersiva (via iframe).
  - Experiência fluida garantida com botões de acesso direto e download rápido em dispositivos móveis.
  - Correção de exibição específica para navegadores nativos restritos, como o Samsung Browser.
- **Links Úteis Embutidos:** Atalhos rápidos para o Edital do Concurso de Jovens Solistas e o Formulário de Dispensa de Bolsistas.

---

## 🚀 Como Atualizar as Informações e PDFs

A manutenção da página foi projetada para não exigir conhecimentos em programação:

1. **Upload:** Salve e envie o novo arquivo PDF (ex: `Temporada_2026_v3.pdf`) para dentro da pasta `assets/files/`.
2. **Atualização do Controle:** Dê um duplo clique para abrir o arquivo central `pdf-config.json` na raiz do projeto e ajuste apenas o nome do arquivo que foi substituído:
   ```json
   "pdfs": {
     "temporada": {
       "arquivo": "Temporada_2026_v3.pdf", // <- Altere isso
       "titulo": "Temporada 2026"
     }
   }
   ```
3. **Publicar!** Crie o *commit* desse ajuste e envie o *push* para a branch `main`. A integração contínua (GitHub Actions) varrerá e publicará a nova versão automaticamente no ar.

---

## 🛠 Arquitetura do Projeto

Abaixo a disposição do *core* tecnológico da aplicação:

- `index.html`: Fundação estrutural da página e dos grids do projeto.
- `pdf-config.json`: Ponto focal de configuração das versões na nuvem.
- `assets/js/version-tracker.js`: Coração lógico do sistema. Renderiza os PDFs, mapeia a indexação de versões via *regex* e controla comportamentos da UI (como layouts do Samsung Browser).
- `assets/js/feedback.js`: Lógica de injeção dos metadados de acesso (diagnóstico de sistema/resolução/hora/navegador) no botão de feedback por e-mail.
- `assets/css/style.css`: *Design System* de interface (Tipografia Inter, cores oficiais OER e design responsivo premium).
- `.github/workflows/static.yml`: Script YAML de automação de *deploy* instantâneo executado via GitHub Actions.

---

<p align="center">
  <small>© 2026 Projeto OER. Desenvolvido por Boris Romão Antunes.</small>
</p>
