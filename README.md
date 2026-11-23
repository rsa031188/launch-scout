# LaunchScout

LaunchScout é uma aplicação Node.js unificada: o radar, o endpoint MCP, a geração de tokens e o catálogo persistente vivem no mesmo servidor e no mesmo domínio. O catálogo preserva `source`, `discoveredAt` e `registration` em cada lançamento para manter a proveniência do sinal.

## Executar localmente

```bash
npm install
npm run dev
```

`npm run dev` já compila a interface e inicia o servidor unificado. Não use `vite preview` ou um servidor estático isolado para testar a geração de token, porque esses comandos não expõem `/api/auth/generate` nem `/api/mcp`.

O build de produção é gerado com `npm run build` em `dist/`.

## Hospedagem Hostinger

No Hostinger, execute `npm ci && npm run start:production` no ambiente Node. O servidor entrega a interface compilada e também o MCP em `/api/mcp`; não é necessário instalar o plugin WordPress para a operação principal. O catálogo é salvo em `data/launchscout.json`, que deve ficar fora do Git e ser incluído no backup do servidor.

Requisito: Node.js 20.19 ou superior.

Variáveis opcionais:

```bash
PORT=3000
HOST=0.0.0.0
LAUNCHSCOUT_DATA_DIR=/caminho/privado/data
CORS_ORIGIN=https://seu-dominio.com
```

Use um proxy HTTPS do Hostinger para encaminhar o domínio público para a porta Node configurada.

## MCP

Abra **Configurações MCP** para gerar o token diretamente no LaunchScout Core. O token é armazenado no servidor apenas como hash SHA-256 e é exibido uma única vez. O agente primário usa automaticamente o endpoint relativo `/api/mcp`, eliminando conflito de endpoint. Agentes externos adicionais ainda podem ser configurados quando necessário; cada agente possui nome, função, endpoint e token próprios.

### Ciclo de vida do token

- **Primeira geração:** quando não existe token, use **Gerar ou renovar token interno**.
- **Renovação:** informe o token atual e gere outro; o anterior é invalidado imediatamente.
- **Revogação:** use **Revogar token interno**; chamadas MCP deixam de funcionar na hora.
- **Recuperação:** configure `LAUNCHSCOUT_ADMIN_KEY` no Hostinger e informe essa chave no campo administrativo da interface. A recuperação não exige apagar `data/launchscout.json`.

Exemplo de configuração segura no ambiente do servidor:

```bash
LAUNCHSCOUT_ADMIN_KEY=uma-chave-administrativa-forte-e-fora-do-repositorio
```

A chave administrativa nunca deve ser colocada no código, no Git, no ZIP ou em screenshots. Ela só é enviada pelo navegador quando o operador escolhe explicitamente a recuperação/renovação administrativa.

O LaunchScout chama `initialize` para testar a conexão e `tools/call` com `search_launches` para pesquisar. O endpoint interno compartilha exatamente o mesmo armazenamento usado pelo radar.

## Pesquisa abrangente

O formulário pesquisa por nome do evento/lançamento e texto livre, além de filtros dinâmicos de plataforma/fonte, tipo de evento, produtor, período e interesse. As opções de plataforma, produtor e tipo são construídas a partir dos dados reais recebidos dos agentes. Os filtros são enviados ao MCP unificado como `event_name`, `source`, `product_type`, `producer_name`, `date_window_days` e `query`.

Se todos os agentes falharem, o sistema exibe o erro de conexão e não injeta resultados de demonstração. Verifique endpoint, token e CORS em **Configurações MCP** no LaunchScout.

Se o arquivo `data/launchscout.json` estiver corrompido, o servidor preserva uma cópia com sufixo `.corrupt-*`, recria um armazenamento válido e permite gerar um novo token. Caso já exista um token e ele tenha sido perdido, informe o token atual ou faça a recuperação do arquivo de dados no servidor antes de gerar outro.
