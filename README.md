# LaunchScout

LaunchScout é uma aplicação Node.js unificada: o radar, o endpoint MCP, a geração de tokens e o catálogo persistente vivem no mesmo servidor e no mesmo domínio. O catálogo preserva `source`, `discoveredAt` e `registration` em cada lançamento para manter a proveniência do sinal.

## Executar no ambiente Node.js da Hostinger

```bash
npm install
npm run dev
```

Na Hostinger, instale com `npm ci`, compile com `npm run build` e defina `server.js` como ficheiro de arranque da aplicação Node.js. Alternativamente, use `npm run start:production` se o painel aceitar comandos npm. Não use `vite preview` nem um servidor estático isolado: esses processos não expõem `/api/auth/generate` nem `/api/mcp`.

O build de produção é gerado com `npm run build` em `dist/`.

## Hospedagem Hostinger

Na Hostinger, execute `npm ci`, `npm run build` e depois `node server.js` através da aplicação Node.js do painel. O servidor entrega a interface compilada e também o MCP em `/api/mcp`; não é necessário instalar o plugin WordPress para a operação principal. O catálogo é salvo em `LAUNCHSCOUT_DATA_DIR`, que deve apontar para armazenamento persistente e ser incluído no backup.

Requisito: Node.js 20.19 ou superior.

Variáveis opcionais:

```bash
PORT=3000
HOST=0.0.0.0
LAUNCHSCOUT_DATA_DIR=/caminho/privado/data
CORS_ORIGIN=https://seu-dominio.com
```

Use um proxy HTTPS do Hostinger para encaminhar o domínio público para a porta Node configurada.

## Autenticação e MCP

Crie o primeiro administrador através do bootstrap protegido documentado em `docs/SECURITY-AND-HOSTINGER.md` e depois entre na interface. As operações administrativas de token exigem sessão autenticada e CSRF; visitantes não podem gerar, recuperar, consultar ou revogar credenciais. O agente primário usa automaticamente o endpoint relativo `/api/mcp`.

Por conveniência no primeiro arranque, uma instalação vazia cria `admin` / `admin` por padrão. Altere esta password imediatamente e defina `LAUNCHSCOUT_DEFAULT_ADMIN=false` na Hostinger; não mantenha esta credencial numa aplicação pública.

### Ciclo de vida do token

- **Primeira geração:** depois do login administrativo, use **Gerar token interno**.
- **Rotação:** use **Gerar novo token e substituir**; o token anterior é invalidado imediatamente.
- **Revogação:** use **Revogar token interno**; chamadas MCP deixam de funcionar na hora.
- **Recuperação:** se o token foi perdido, use a recuperação autenticada; não é necessário apagar o armazenamento.

O endpoint de geração autenticada é:

```text
POST /api/auth/generate
```

O servidor retorna o token em texto puro somente nessa resposta. O arquivo `data/launchscout.json` não contém o token em texto puro: guarda a cifra AES-256-GCM e o hash SHA-256. Publique a aplicação apenas em HTTPS e mantenha `MCP_MASTER_KEY` fora do repositório.

O LaunchScout chama `initialize` para testar a conexão e `tools/call` com `search_launches` para pesquisar. O endpoint interno compartilha exatamente o mesmo armazenamento usado pelo radar.

## Pesquisa abrangente

O formulário pesquisa por nome do evento/lançamento e texto livre, além de filtros dinâmicos de plataforma/fonte, tipo de evento, produtor, período e interesse. As opções de plataforma, produtor e tipo são construídas a partir dos dados reais recebidos dos agentes. Os filtros são enviados ao MCP unificado como `event_name`, `source`, `product_type`, `producer_name`, `date_window_days` e `query`.

Se todos os agentes falharem, o sistema exibe o erro de conexão e não injeta resultados de demonstração. Verifique endpoint, token e CORS em **Configurações MCP** no LaunchScout.

Se o arquivo `data/launchscout.json` estiver corrompido, o servidor preserva uma cópia com sufixo `.corrupt-*`, recria um armazenamento válido e permite gerar um novo token. Caso já exista um token e ele tenha sido perdido, informe o token atual ou faça a recuperação do arquivo de dados no servidor antes de gerar outro.
