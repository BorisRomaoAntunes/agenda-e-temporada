# Configuração CORS do Firebase Storage

## O que é o `cors.json`?
Este arquivo define quais domínios podem acessar os arquivos do Firebase Storage via browser (CORS - Cross-Origin Resource Sharing).

## Domínios Atualmente Permitidos
- `https://oer-agenda.web.app` — Domínio principal de produção
- `https://oer-agenda.firebaseapp.com` — Domínio alternativo do Firebase

## Como Adicionar um Novo Domínio
1. Edite o arquivo `cors.json`
2. Adicione o novo domínio na lista `"origin"`:
   ```json
   "origin": [
     "https://oer-agenda.web.app",
     "https://oer-agenda.firebaseapp.com",
     "https://seu-novo-dominio.com"
   ]
   ```
3. Aplique as alterações com o comando:
   ```bash
   gsutil cors set firebase/cors.json gs://oer-agenda.firebasestorage.app
   ```

## Métodos HTTP Permitidos
Apenas `GET` — suficiente para leitura de arquivos. Uploads são feitos via Firebase SDK (que não depende de CORS).

## Como Verificar a Configuração Atual
```bash
gsutil cors get gs://oer-agenda.firebasestorage.app
```
