# Publicação manual no GitHub

Este pacote contém o projeto LaunchScout corrigido no commit `9563cc1`.

## Opção recomendada

1. Extraia o ZIP.
2. No GitHub, abra o repositório `rsa031188/launch-scout`.
3. Crie uma branch nova, por exemplo `fix/mcp-token-persistence`.
4. Faça upload dos ficheiros extraídos, preservando a estrutura de diretórios.
5. Crie um Pull Request dessa branch para `main`.
6. Revise em **Files changed** e selecione **Review changes → Approve**.

## Validação local

```bash
npm ci
npm test
npm run build
node --check server.js
```

O pacote não inclui `.git`, `node_modules`, credenciais ou dados locais.
