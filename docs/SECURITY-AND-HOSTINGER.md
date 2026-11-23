# LaunchScout — segurança e Hostinger

A versão atual usa um servidor HTTP unificado, armazenamento persistente configurável e sessões de administrador em cookie HttpOnly. Passwords são armazenadas com bcrypt, não em texto puro. Operações mutáveis de sessão usam CSRF e os endpoints MCP de geração, recuperação, estado e revogação exigem uma sessão com papel `admin`.

## Primeiro arranque

Defina `LAUNCHSCOUT_BOOTSTRAP_SECRET` e `MCP_MASTER_KEY` no ambiente privado da Hostinger. `MCP_MASTER_KEY` deve ter exatamente 32 bytes em base64 ou 64 caracteres hexadecimais. Inicie a aplicação e execute uma única vez `POST /api/auth/bootstrap`, enviando o segredo no header `X-Bootstrap-Secret` e um JSON com `name`, `email` e `password` de pelo menos 12 caracteres. Depois disso o bootstrap fica bloqueado permanentemente enquanto existir um utilizador.

Faça login através de `POST /api/auth/login`. O servidor devolve um `csrfToken` e estabelece o cookie de sessão. A interface usa esse cookie para aceder às operações administrativas. O endpoint `GET /api/auth/me` permite confirmar a sessão atual.

## Token MCP

Após login administrativo, `POST /api/auth/generate` cria um único token. A versão anterior é invalidada imediatamente. O servidor guarda o hash SHA-256 para comparação e a cópia cifrada com AES-256-GCM; o texto puro só aparece na resposta de geração/recuperação. `POST /api/auth/revoke` invalida o token ativo. O endpoint MCP é `/api/mcp` e exige `Authorization: Bearer <token>`.

## Hostinger

Este projeto não deve ser publicado como site estático nem executado com `vite preview`. No painel de aplicações Node.js da Hostinger, selecione Node.js `20.19` ou superior, defina a raiz da aplicação para a pasta que contém `server.js` e configure o ficheiro de arranque como `server.js` — ou o comando equivalente `npm run start:production` quando o painel aceitar scripts npm.

Na instalação, execute `npm ci`. Antes do arranque, execute `npm run build`. Configure `PORT` conforme o painel Node.js e mantenha `HOST=0.0.0.0`; o servidor já lê a porta fornecida pela Hostinger. Aponte `LAUNCHSCOUT_DATA_DIR` para armazenamento persistente incluído nos backups. Publique exclusivamente atrás de HTTPS e restrinja `CORS_ORIGIN` à origem exata quando for necessário acesso cross-origin.

O domínio deve apontar para a aplicação Node.js criada no painel. A validação correta é abrir o domínio e confirmar que `GET /api/auth/bootstrap` devolve JSON; se o domínio devolver apenas `index.html` ou um 404 estático em `/api/auth/generate`, a aplicação está configurada como estática ou com o arranque errado.

Ainda dependem de configuração externa legítima a pesquisa web/API e os agentes remotos. O sistema não os marca como ativos sem provedor, endpoint e teste.
