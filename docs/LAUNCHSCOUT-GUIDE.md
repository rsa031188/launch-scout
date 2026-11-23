# LaunchScout — Guia de entrega

## 1. O que é

LaunchScout é um radar pessoal para descobrir lançamentos independentes, incluindo workshops, virtual summits, free lives e produtos digitais. A interface organiza os sinais em cards visuais e permite pesquisar, filtrar, ordenar e salvar oportunidades.

O nome **LaunchScout** substitui o nome usado no briefing original.

## 2. Funcionalidades incluídas

- Dashboard com visão geral do radar, próximos sinais e leitura de tendências.
- Catálogo visual com nome, tipo, data, produtor, imagem, resumo, tags, fonte e link de inscrição.
- Busca textual por título, produtor, tipo, resumo e tags.
- Filtros por tipo, período, produtor e interesse.
- Ordenação por relevância, data mais próxima, descoberta recente e lista pessoal.
- Favoritos persistidos no backend por utilizador.
- Descoberta real via endpoint autenticado, MCP e provedores RSS configurados, com estado de carregamento e feedback visual.
- Estado vazio para combinações de filtros sem resultado.
- Configuração de múltiplas conexões MCP com criação, edição, pausa, ativação e remoção.
- Servidor Node unificado com endpoint `/api/mcp`, geração de token, persistência e ferramentas `search_launches`, `save_launch`, `get_launch_details` e `get_platform_statistics`.
- Consulta multiagente via JSON-RPC `initialize` e `tools/call`, usando autorização Bearer e deduplicação de resultados.
- `localStorage` é apenas cache visual; catálogo, favoritos, histórico, provedores e agentes vivem no armazenamento backend.
- Interface responsiva para desktop, tablet e mobile.

## 3. Estrutura do projeto

```text
launchscout/
├── index.html                 Entrada HTML e metadados
├── package.json               Scripts do Vite e servidor Node
├── package-lock.json          Lockfile de instalação
├── app.config.ts              Branding do projeto Webdev
├── README.md                  Instruções rápidas
├── TODO.md                    Critérios e estado da implementação
├── docs/
│   └── LAUNCHSCOUT-GUIDE.md   Este guia
├── public/
│   └── manus-routes.json      Manifesto de rotas Webdev
├── server.js                  MCP, autenticação e persistência em produção
├── src/
│   ├── main.js                Dados, estado, renderização e interações
│   └── styles.css             Direção visual Noir Signal
└── dist/                      Build estático pronto para publicação
```

## 4. Execução local

É necessário ter Node.js instalado.

```bash
npm install
npm run dev
```

O servidor de desenvolvimento escuta na porta 3000. Para gerar o build:

```bash
npm run build
```

A saída fica em `dist/`.

## 5. Publicação no Hostinger

Execute `npm ci && npm run start:production` no ambiente Node do Hostinger. O servidor entrega `dist/` e o MCP no mesmo domínio. Configure `LAUNCHSCOUT_DATA_DIR` para um diretório persistente e faça backup de `data/launchscout.json`.

As credenciais não são gravadas no código-fonte. O token é gerado no servidor, cifrado com AES-256-GCM e comparado através de hash; ele é exibido uma única vez. Geração, recuperação e revogação exigem sessão administrativa e CSRF.

## 6. Configuração MCP

1. Abra **Configurações MCP** na barra lateral.
2. Clique em **Gerar ou renovar token interno** para criar ou substituir o token interno, ou em **Adicionar agente** para uma fonte externa.
3. Confirme o endpoint interno `/api/mcp` e o papel do agente.
4. Salve a conexão.
5. Use **Testar agora** e depois **Buscar novidades**.

Os endpoints `POST /api/auth/generate`, `POST /api/auth/recover` e `POST /api/auth/revoke` exigem sessão administrativa. Cada emissão invalida imediatamente o token anterior; a aplicação deve ser publicada somente com HTTPS.

## 7. Pesquisa externa

Administradores podem criar provedores RSS através de `POST /api/admin/providers`, com nome, URL pública, categoria e idioma. O servidor resolve o hostname e rejeita loopback, redes privadas, link-local, metadados e URLs com credenciais. Cada execução aplica timeout, limite de resposta, deduplicação e preserva a fonte original. Sem provedor configurado, o sistema informa `not_configured` e não inventa resultados.

Os endpoints `GET /api/admin/providers`, `POST /api/admin/providers`, `GET /api/admin/agents` e `POST /api/admin/agents` permitem gerir a base operacional. A interface administrativa dedicada para estes recursos permanece em implementação.

Para uma instalação externa, o endpoint precisa:

- aceitar HTTPS;
- permitir a origem do domínio publicado via CORS;
- permitir o header `Authorization`;
- aceitar requisições do navegador;
- responder em um formato compatível com o transporte configurado.

Quando uma fonte não responde, o LaunchScout exibe a falha e não injeta resultados simulados. Quando a fonte responde sem resultados, a interface informa que não foram encontrados lançamentos.

## 7. Modelo de dados de lançamento

Cada lançamento usa os principais campos abaixo:

```js
{
  id,
  title,
  producer,
  type,
  date,
  discoveredAt,
  source,
  sourceType,
  registration,
  image,
  summary,
  tags,
  saved,
  status
}
```

`source` identifica a origem do sinal, `discoveredAt` registra quando ele foi encontrado e `registration` mantém o link de inscrição. Essa proveniência deve ser preservada quando um agente de IA normalizar novos dados.

## 8. Direção visual

A interface usa a direção **Noir Signal**: fundo azul quase preto, verde-lima como cor de ação e estado, acentos violeta, laranja e azul para categorizar sinais, além de Space Grotesk e DM Mono para reforçar a sensação de painel de inteligência editorial.

## 9. Validação realizada

- `npm run build` executado com sucesso.
- `GET /manus-routes.json` validado com HTTP local.
- Preview verificado em desktop e mobile.
- Arquivos essenciais e diretório `dist/` verificados antes do empacotamento.
