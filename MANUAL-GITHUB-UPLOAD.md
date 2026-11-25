# Publicação manual no GitHub

Este pacote contém o projeto LaunchScout corrigido, incluindo suporte a token MCP fixo.

## Publicação

1. Extraia o ZIP.
2. No GitHub, abra `rsa031188/launch-scout`.
3. Crie uma branch, por exemplo `fix/mcp-fixed-token`.
4. Faça upload dos ficheiros extraídos, preservando a estrutura.
5. Crie um Pull Request dessa branch para `main`.
6. Reveja em **Files changed** e selecione **Review changes → Approve**.

## Configurar o token fixo

Defina no ambiente da aplicação Node.js:

```bash
export MCP_FIXED_TOKEN='cole-aqui-um-token-com-pelo-menos-32-caracteres'
```

O token não é gerado pelo aplicativo. Ele é sempre aceite pelo endpoint MCP e pode ser mostrado/copiado após o login administrativo em **Configurações MCP → Gerar token interno**. Nesse modo, a interface devolve o token configurado, sem o substituir.

Para alterar o token, altere `MCP_FIXED_TOKEN` e reinicie o servidor. Não coloque o valor no GitHub ou no código-fonte.

## Validação local

```bash
npm ci
npm test
npm run build
node --check server.js
```

O pacote não inclui `.git`, `node_modules`, credenciais ou dados locais.
