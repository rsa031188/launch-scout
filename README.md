# LaunchScout

LaunchScout é um radar pessoal para descobrir, organizar e acompanhar lançamentos independentes, eventos, workshops e outras oportunidades. A aplicação reúne interface web, catálogo persistente, pesquisa RSS e um servidor MCP no mesmo processo Node.js e domínio.

## Funcionalidades

- Dashboard e catálogo com pesquisa, filtros, ordenação e lista de favoritos.
- O radar pode carregar e exibir até 300 resultados simultaneamente.
- Contas com registo e login; a conta administrativa controla configurações e provedores.
- Pesquisa de feeds RSS/Atom públicos, com resultados e histórico guardados no servidor.
- Cadastro individual de feeds RSS ou importação em lote a partir de um arquivo JSON.
- Cards com descrições limitadas a 200 caracteres e imagens de pré-visualização das páginas dos eventos quando disponíveis.
- Modo IA para pesquisa contextual com Exa AI ou uma API de chat compatível com OpenAI.
- Conexões com agentes MCP para pesquisar em serviços externos; os resultados podem ser combinados com os feeds RSS.
- API MCP com ferramentas de descoberta, pesquisa, gestão de lançamentos e consulta do estado da plataforma.
- Interface responsiva em português.

O catálogo não inventa resultados: para encontrar dados reais, configure fontes RSS públicas ou agentes MCP válidos. A pesquisa é iniciada pela interface ou por uma chamada externa ao MCP; **não existe um agendador, worker em segundo plano, envio automático de e-mail ou notificação push integrado**. Para executar buscas em horários definidos, configure uma automação externa para chamar a ferramenta `discover_launches` pelo MCP.

## Tecnologia

- **Frontend:** HTML, CSS e JavaScript ES modules, compilados com Vite.
- **Servidor:** Node.js com `node:http`; o mesmo processo serve a interface compilada, a API e o endpoint MCP.
- **MCP:** JSON-RPC 2.0 sobre HTTP, em `/api/mcp`, com autenticação Bearer.
- **Persistência:** arquivo JSON em `LAUNCHSCOUT_DATA_DIR/launchscout.json`; não requer banco de dados externo.
- **Autenticação:** passwords com bcrypt, sessão em cookie HttpOnly, proteção CSRF e token MCP armazenado cifrado com AES-256-GCM e verificado por hash SHA-256.

## Requisitos

- Node.js **20.19 ou superior** e npm.
- Acesso à internet no servidor para consultar feeds públicos.
- Para hospedagem, um plano que permita executar uma aplicação Node.js persistente, configurar variáveis de ambiente e associar o domínio à aplicação. Hospedagem apenas estática ou apenas PHP não é suficiente.

## Instalação local

Clone o repositório, instale as dependências e inicie o servidor:

```bash
git clone https://github.com/rsa031188/launch-scout.git
cd launch-scout
npm ci
npm start
```

O servidor fica disponível em `http://localhost:3000` por padrão. Na primeira execução, `npm start` cria uma `MCP_MASTER_KEY` em `.env` se ainda não existir. O Node carrega esse arquivo ao iniciar. O arquivo `.env` e o diretório `data/` estão excluídos do Git; não os publique.

Por conveniência, uma instalação vazia cria temporariamente o administrador `LaunchScout` com a password `Launch_admin`. Entre e altere a password imediatamente. Antes de expor a aplicação publicamente, defina `LAUNCHSCOUT_DEFAULT_ADMIN=false` e crie o administrador pelo bootstrap protegido descrito em [Autenticação e segurança](#autenticação-e-segurança).

### Comandos locais

| Comando | Uso |
| --- | --- |
| `npm start` | Prepara a chave local, carrega `.env` e inicia `server.js`. |
| `npm run dev` | Compila a interface, prepara a chave local e inicia o servidor Node. Não é um watcher com hot reload. |
| `npm run build` | Compila a interface para `dist/` e gera `dist/main.js`. |
| `npm run start:prod` | Inicia o entrypoint de produção `dist/main.js`; requer que o build já exista. |
| `npm run start:production` | Compila, prepara a chave local e inicia o entrypoint de produção. |
| `npm test` | Executa os testes de integração e smoke test. |
| `npm run preview:static` | Pré-visualiza apenas a interface estática; não disponibiliza a API nem o MCP. |

Se iniciar o servidor diretamente com Node, carregue `.env` explicitamente:

```bash
npm run setup:local
node --env-file-if-exists=.env server.js
```

## Instalação em hospedagem Node.js (Hostinger)

Os nomes dos campos do painel podem variar; configure uma aplicação **Node.js**, não um site estático ou uma instalação WordPress.

1. Aponte a raiz da aplicação para a pasta que contém `package.json`.
2. Use Node.js 20.19 ou superior.
3. Configure as variáveis de ambiente da seção seguinte no painel. Use o `PORT` fornecido pelo painel e defina `HOST=0.0.0.0`.
4. Configure `LAUNCHSCOUT_DATA_DIR` para uma pasta gravável e persistente, fora da raiz pública do site. Preserve essa pasta entre deploys e inclua-a nos backups.
5. Execute `npm ci` e `npm run build` durante a instalação ou etapa de build.
6. Configure o comando de inicialização como `npm run start:prod` (ou `node --env-file-if-exists=.env dist/main.js`, se o painel exigir o comando diretamente).
7. Associe o domínio à aplicação Node e publique atrás do HTTPS fornecido pelo painel/proxy.
8. Abra `https://seu-dominio/health`; a resposta deve ser JSON e conter `"runtime":"node"`.
9. Crie o administrador com o método de bootstrap seguro abaixo e entre na interface.

**Não publique apenas `dist/` como conteúdo estático.** O entrypoint `dist/main.js` inicia o servidor que fornece `/api/*` e `/api/mcp`, além da interface. `npm run start:production` também pode ser usado como comando único, mas para ambientes geridos é geralmente mais simples separar build (`npm ci` e `npm run build`) do comando de inicialização (`npm run start:prod`).

Se `/health` retornar HTML, 404 ou uma página de outro site, confira se o domínio aponta para a aplicação Node correta e se o painel está executando `dist/main.js`. `GET /api/mcp` também deve apresentar o estado do serviço MCP.

## Configuração

As variáveis podem ser definidas no ambiente do processo ou em `.env` em instalações próprias. Em hospedagem, prefira os campos privados de variáveis do painel.

| Variável | Padrão / formato | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP; na hospedagem, use a porta fornecida pelo painel. |
| `HOST` | `0.0.0.0` | Endereço de escuta do servidor. |
| `LAUNCHSCOUT_DATA_DIR` | `data/` junto ao servidor | Diretório persistente para o catálogo, usuários, feeds, sessões e histórico. |
| `MCP_MASTER_KEY` | Gerada localmente ou em `data/mcp-master.key` | Chave de 32 bytes, em Base64 ou 64 caracteres hexadecimais, usada para cifrar o token MCP. Preserve a chave junto dos dados. |
| `LAUNCHSCOUT_DEFAULT_ADMIN` | Ativado, a menos que seja `false` | Define se a conta temporária padrão é criada numa instalação vazia. Desative em produção. |
| `LAUNCHSCOUT_BOOTSTRAP_SECRET` | Sem padrão | Segredo exigido pelo endpoint de bootstrap para criar o primeiro administrador com segurança. |
| `MCP_FIXED_TOKEN` | Desativado | Token MCP estável fornecido pelo operador; deve ter pelo menos 32 caracteres. |
| `CORS_ORIGIN` | Sem CORS explícito | Origem exata permitida para chamadas cross-origin. Não é necessário para a interface servida no mesmo domínio. |
| `NODE_ENV` | Definido pelo ambiente | Com valor `production`, o cookie de sessão recebe o atributo `Secure`. |
| `COOKIE_SECURE` | Desativado | Defina como `true` para exigir cookie Secure mesmo fora de `NODE_ENV=production`. |

Sem `MCP_MASTER_KEY`, o servidor cria e persiste uma chave aleatória em `LAUNCHSCOUT_DATA_DIR/mcp-master.key`. Se fornecer a chave por variável de ambiente, mantenha-a em segredo e guarde-a em backup seguro. Perder ou substituir a chave impede a leitura das credenciais MCP cifradas existentes.

### Criar o administrador sem credenciais temporárias

Em uma instalação nova, defina `LAUNCHSCOUT_DEFAULT_ADMIN=false` e `LAUNCHSCOUT_BOOTSTRAP_SECRET` antes do primeiro arranque. Depois de confirmar que `GET /api/auth/bootstrap` indica que o bootstrap é necessário, envie uma única requisição:

```bash
curl -X POST "https://seu-dominio/api/auth/bootstrap" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: <LAUNCHSCOUT_BOOTSTRAP_SECRET>" \
  --data '{"name":"Administrador","email":"admin@exemplo.com","password":"substitua-por-uma-password-forte"}'
```

Use uma password com pelo menos 12 caracteres. O bootstrap só funciona enquanto não existir nenhum utilizador; depois, faça login pela interface. Nunca publique o segredo ou a password em código, Git ou logs compartilhados.

## Fontes RSS

Depois de entrar como administrador, abra **Configurações MCP → Pesquisa externa**. É possível adicionar uma fonte individualmente ou importar uma lista JSON. A importação aceita um array no nível superior, com até 100 entradas e arquivo de até 1 MB:

```json
[
  {
    "name": "Meu feed",
    "url": "https://exemplo.org/feed.xml",
    "category": "Tecnologia",
    "language": "pt"
  },
  {
    "name": "Outro feed",
    "url": "https://news.exemplo.org/rss"
  }
]
```

`name` e `url` são obrigatórios. `category`, `language` e `enabled` são opcionais; `enabled` assume `true` por padrão. `type` também pode ser omitido ou definido como `"rss"`. A interface informa quantas fontes foram importadas e detalha cada linha rejeitada; entradas inválidas não impedem a importação das válidas.

O servidor aceita apenas URLs HTTP(S) públicas, sem credenciais, com portas permitidas, e rejeita endereços loopback, privados e link-local depois de verificar o DNS. A busca consulta os feeds habilitados, aplica timeout e limite de resposta, normaliza os lançamentos, deduplica resultados e grava o estado/histórico no armazenamento local. Os feeds são consultados quando uma busca é executada, não continuamente em segundo plano.

Quando um lançamento não inclui imagem própria, o navegador pede ao servidor uma pré-visualização da URL do evento. O servidor procura `og:image` ou `twitter:image`, valida a URL da página e da imagem e devolve a imagem apenas para sessões autenticadas. As imagens são carregadas sob demanda; páginas sem metadados de imagem ficam com o fundo padrão do card.

## MCP, conexões e automações

O endpoint MCP é `https://seu-dominio/api/mcp`. As requisições MCP usam `Authorization: Bearer <token>` e JSON-RPC 2.0. A interface negocia MCP `2025-03-26`, envia `notifications/initialized`, mantém a versão/sessão negociadas e aceita respostas JSON ou SSE; também mantém compatibilidade com servidores `2024-11-05`. A interface permite gerar, copiar, recuperar, rotacionar ou revogar o token interno após login administrativo, além de configurar conexões com agentes MCP externos.

Para cadastrar um cliente MCP, use o endpoint acima e o token interno copiado na interface. O servidor oferece `initialize`, `ping`, `tools/list` e `tools/call`. As ferramentas disponíveis são:

- `search_launches` e `discover_launches` para pesquisar o catálogo ou consultar os feeds habilitados.
- `search_web` para executar a descoberta pelos provedores configurados.
- `save_launch` e `get_launch_details` para guardar ou consultar lançamentos.
- `get_platform_statistics`, `get_search_sources`, `get_connection_status`, `get_search_history`, `get_launch_categories` e `get_platform_configuration` para consultar o estado e os dados da plataforma.
- `validate_launch` para validar campos de um lançamento sem o guardar.

Uma automação externa pode chamar `discover_launches` em uma agenda própria, usando, por exemplo, uma requisição MCP `tools/call`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "discover_launches",
    "arguments": {}
  }
}
```

Envie esse corpo por `POST` ao endpoint MCP, com `Content-Type: application/json` e `Authorization: Bearer <token>`. A chamada consulta os feeds habilitados, atualiza os lançamentos encontrados e registra o histórico. A periodicidade, as notificações e as novas tentativas pertencem ao serviço externo de automação; o LaunchScout não cria nem executa agendas automaticamente. Sem fontes RSS ou agentes externos configurados, não haverá dados novos.

### Modo IA e chave de API

O painel oferece dois tipos independentes de agente: **Agentes MCP**, geridos em Configurações MCP, e o **Modo IA**, configurado pelo administrador com uma chave de API. O botão **Ativar Modo IA / Desativar Modo IA** abre ou fecha o painel de pesquisa contextual; **Buscar com contexto** executa a busca usando o contexto do radar e os filtros selecionados, sem exigir uma pergunta manual. Também é possível fazer uma pergunta própria. A chave é enviada ao servidor por uma sessão autenticada, cifrada com `MCP_MASTER_KEY` e nunca devolvida ao navegador. O Modo IA não usa o token MCP nem as chaves dos feeds RSS.

- **Exa AI Search:** escolha Exa AI Search e informe uma chave criada na conta Exa. A busca web usa a API oficial do Exa e devolve resultados com título, resumo e link.
- **API compatível com OpenAI:** escolha a opção, informe uma chave, o endpoint HTTPS público (por exemplo `https://api.openai.com/v1`) e o identificador do modelo. O endpoint deve aceitar `POST /chat/completions` e retornar JSON com `answer` e `results`, onde cada resultado possui `title` e `url`.

Defina também o **Contexto do radar** com os temas, público ou tipos de oportunidade relevantes. A busca contextual combina esse texto com os filtros ativos no painel e as categorias das fontes RSS habilitadas. A pesquisa respeita os limites do provedor, retorna no máximo dez resultados e rejeita links que não apontem para URLs HTTPS/HTTP públicas. O Modo IA exige login; sua configuração é administrativa, e as pesquisas autenticadas têm limite de requisições. O uso da API pode gerar cobrança ou consumir a quota da conta do provedor. Sem chave configurada, nenhum pedido é enviado.

## Dados, backups e segurança

O armazenamento padrão fica em `data/launchscout.json`; o diretório pode ser movido com `LAUNCHSCOUT_DATA_DIR`. Faça backup dessa pasta e, se a chave não estiver definida no ambiente, inclua também `mcp-master.key`. Guarde `.env`, chaves, segredos e backups em local privado, nunca no diretório público do site.

O catálogo, os favoritos, as contas, os provedores RSS, os registros de agentes da API e o histórico pertencem ao armazenamento backend. O navegador também mantém um cache do catálogo e configurações locais de conexões; os tokens dessas conexões ficam apenas em `sessionStorage` durante a sessão do navegador. Esses dados locais não são incluídos nos backups do servidor.

As senhas de conta são guardadas com bcrypt. Sessões usam cookie HttpOnly; operações mutáveis autenticadas usam proteção CSRF. O token MCP não é retornado em buscas nem listado no painel: o token puro só é apresentado em fluxos autenticados de criação/recuperação. Publique somente com HTTPS, troque a password temporária de administrador e não compartilhe `MCP_MASTER_KEY`, `MCP_FIXED_TOKEN` ou `LAUNCHSCOUT_BOOTSTRAP_SECRET`.

## Verificação local

```bash
npm ci
npm test
npm run build
node --check server.js
```

Depois de iniciar o servidor, `GET /health` deve responder com JSON e `"runtime":"node"`. `npm run preview:static` é apenas para inspeção visual; não substitui esse teste nem executa a API.
