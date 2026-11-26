# LaunchScout

LaunchScout é uma aplicação Node.js unificada: o radar, o endpoint MCP, a geração de tokens e o catálogo persistente vivem no mesmo servidor e no mesmo domínio. O catálogo preserva `source`, `discoveredAt` e `registration` em cada lançamento para manter a proveniência do sinal.

## Executar localmente

Requisito: Node.js 20.19 ou superior. Instale as dependências e inicie a aplicação:

```bash
npm ci
npm start
```

Na primeira execução, `npm start` gera uma `MCP_MASTER_KEY` aleatória em `.env` e carrega o arquivo automaticamente; `npm run setup:local` também pode ser executado separadamente. Para iniciar em modo de desenvolvimento, use `npm run dev`. Se o servidor iniciar sem a variável, ele gera uma chave binária de 32 bytes em `LAUNCHSCOUT_DATA_DIR/mcp-master.key`. O `.env` e o diretório `data/` são excluídos do Git. Preserve a chave e o diretório de dados: sem eles, o servidor não consegue descriptografar credenciais salvas.

Se iniciar diretamente com Node, carregue o arquivo `.env` explicitamente:

```bash
npm run setup:local
node --env-file-if-exists=.env server.js
```

Executar apenas `node server.js` não carrega `.env`; nesse caso, defina `MCP_MASTER_KEY` no ambiente do processo. Se a interface ainda indicar que a chave não está configurada, confirme que iniciou o servidor na pasta correta e que o processo carregou `.env` ou recebeu essa variável, depois reinicie-o. A chave deve representar 32 bytes (base64 ou 64 caracteres hexadecimais).

## Executar no ambiente Node.js da Hostinger

Na Hostinger, configure o projeto como **Outro / aplicação Node.js**, não como site estático Vite. Use `npm ci` para instalar, `npm run build` para compilar e gerar o entrypoint, e `npm run start:prod` para iniciar `dist/main.js`. Configure a raiz na pasta com `package.json` e aponte `LAUNCHSCOUT_DATA_DIR` para armazenamento persistente. `MCP_MASTER_KEY` pode ser fornecida como variável de ambiente; se estiver ausente, o servidor gera uma chave segura dentro do diretório de dados. O build inclui os arquivos Vite e o entrypoint Node; o servidor Node entrega a interface e as APIs no mesmo domínio. `npm start` é conveniente para desenvolvimento local; `npm run start:production` compila e inicia em uma única etapa. Não publique apenas o conteúdo estático de `dist/`.

Este projeto precisa que o processo Node permaneça ativo para atender `/api/*` e `/api/mcp`. `dist/` contém os arquivos Vite e `dist/main.js`, o entrypoint Node criado pelo build; não configure uma publicação estática que sirva somente os arquivos da pasta. Se o painel exigir um arquivo de entrada, use `dist/main.js`. O comando `npm run preview:static` é apenas para inspecionar o frontend localmente e não atende às APIs. Depois do arranque, `https://seu-dominio.com/health` deve responder JSON com `"runtime":"node"`. Se retornar 404 ou HTML, o domínio está servindo o deploy estático/outro site, ou não está associado ao processo Node correto.

O build de produção é gerado com `npm run build` em `dist/`.

## Hospedagem Hostinger

Na Hostinger, execute `npm ci` e `npm run build`; configure o início como `npm run start:prod` ou use `dist/main.js` como entrypoint. O servidor entrega a interface compilada e também o MCP em `/api/mcp`; não é necessário instalar o plugin WordPress para a operação principal. O catálogo é salvo em `LAUNCHSCOUT_DATA_DIR`, que deve apontar para armazenamento persistente e ser incluído no backup.

Requisito: Node.js 20.19 ou superior.

Variáveis opcionais:

```bash
PORT=3000
HOST=0.0.0.0
LAUNCHSCOUT_DATA_DIR=/caminho/privado/data
CORS_ORIGIN=https://seu-dominio.com
```

Use um proxy HTTPS do Hostinger para encaminhar o domínio público para a porta Node configurada.

Para confirmar que o domínio está ligado ao processo Node correto, abra `https://seu-dominio.com/health`. A resposta esperada é JSON contendo `"runtime":"node"`. Se aparecer uma página 404/HTML, o domínio ainda está a apontar para alojamento estático ou para outra aplicação; no painel, confirme que iniciou `dist/main.js`/`npm run start:prod` e aponte o domínio para a aplicação Node.

## Autenticação e MCP

Crie o primeiro administrador através do bootstrap protegido documentado em `docs/SECURITY-AND-HOSTINGER.md` e depois entre na interface. As operações administrativas de token exigem sessão autenticada e CSRF; visitantes não podem gerar, recuperar, consultar ou revogar credenciais. O agente primário usa automaticamente o endpoint relativo `/api/mcp`.

O ecrã de acesso inclui o separador **Criar conta**. O utilizador pode definir nome, e-mail e password com confirmação; depois do registo válido, a sessão é iniciada automaticamente. Contas novas recebem o papel `user`; o papel `admin` continua reservado ao bootstrap/gestão administrativa.

Por conveniência no primeiro arranque, uma instalação vazia cria `LaunchScout` / `Launch_admin` por padrão. Altere esta password imediatamente e defina `LAUNCHSCOUT_DEFAULT_ADMIN=false` na Hostinger; não mantenha esta credencial numa aplicação pública.

### Ciclo de vida do token

- **Primeira geração:** depois do login administrativo, use **Gerar token interno**.
- **Rotação:** use **Gerar novo token e substituir**; o token anterior é invalidado imediatamente.
- **Revogação:** use **Revogar token interno**; chamadas MCP deixam de funcionar na hora.
- **Recuperação:** se o token foi perdido, use a recuperação autenticada; não é necessário apagar o armazenamento.

O endpoint de geração autenticada é:

```text
POST /api/auth/generate
```

O servidor retorna o token de acesso MCP em texto puro somente na geração; use o botão **Copiar token MCP** para colá-lo no agente de IA. Não compartilhe `MCP_MASTER_KEY`: ela é somente para cifrar credenciais no servidor. O arquivo `data/launchscout.json` guarda a cifra AES-256-GCM e o hash SHA-256, nunca o token em texto puro. Publique a aplicação apenas em HTTPS e mantenha a chave mestra fora do repositório.

Se precisar de uma credencial estável definida pelo ambiente, configure `MCP_FIXED_TOKEN` com pelo menos 32 caracteres. Nesse modo, o mesmo token é aceite após reinícios e a rotação/revogação pela interface fica bloqueada; para o trocar, altere a variável e reinicie o servidor. Mantenha `MCP_FIXED_TOKEN` fora do repositório.

O LaunchScout chama `initialize` para testar a conexão e `tools/call` com `search_launches` para pesquisar. O endpoint interno compartilha exatamente o mesmo armazenamento usado pelo radar.

## Pesquisa abrangente

O formulário pesquisa por nome do evento/lançamento e texto livre, além de filtros dinâmicos de plataforma/fonte, tipo de evento, produtor, período e interesse. As opções de plataforma, produtor e tipo são construídas a partir dos dados reais recebidos dos agentes. Os filtros são enviados ao MCP unificado como `event_name`, `source`, `product_type`, `producer_name`, `date_window_days` e `query`.

Se todos os agentes falharem, o sistema exibe o erro de conexão e não injeta resultados de demonstração. Verifique endpoint, token e CORS em **Configurações MCP** no LaunchScout.

As fontes RSS locais e todos os agentes MCP habilitados são consultados na mesma pesquisa; os agentes MCP são chamados em paralelo e seus resultados são combinados com os RSS locais. Uma falha individual não descarta as respostas dos demais agentes.

Se o arquivo `data/launchscout.json` estiver corrompido, o servidor preserva uma cópia com sufixo `.corrupt-*`, recria um armazenamento válido e permite gerar um novo token. Caso já exista um token e ele tenha sido perdido, informe o token atual ou faça a recuperação do arquivo de dados no servidor antes de gerar outro.
