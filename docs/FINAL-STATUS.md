# LaunchScout — Estado da versão atual

## Implementado e validado

A aplicação existente foi preservada e evoluída sobre o servidor Node.js unificado. O projeto possui bootstrap protegido do primeiro administrador, cadastro, login, sessão persistente em cookie HttpOnly, bcrypt para passwords, CSRF nas operações mutáveis, rate limiting básico e headers de segurança.

O gerenciamento MCP mantém um único token ativo. A geração, recuperação, rotação e revogação estão protegidas por sessão administrativa. A credencial é cifrada com AES-256-GCM e comparada através de hash SHA-256; o texto puro só aparece na resposta da operação que cria ou recupera o token. A rotação invalida imediatamente a credencial anterior.

O MCP responde a `initialize`, `ping`, `tools/list` e `tools/call`, com 12 ferramentas descritas por schema. As chamadas usam Bearer token, respostas JSON-RPC estruturadas e não retornam resultados fictícios quando não há fontes externas configuradas.

Catálogo, favoritos, histórico de pesquisa, provedores e agentes passaram a ter estruturas backend persistentes. O frontend sincroniza o catálogo após o login e envia os favoritos para a API; o `localStorage` permanece apenas como cache de interface. O painel MCP já inclui a configuração de um provedor RSS público.

A descoberta externa RSS executa em paralelo para os provedores habilitados, aplica timeout e limite de resposta, normaliza proveniência, deduplica por título e URL, atualiza o estado de cada fonte e regista o histórico. URLs com credenciais, protocolos não HTTP(S), portas não permitidas, loopback, redes privadas, link-local e endereços de metadados são rejeitados.

## Evidência executada

Foi executado `node --check server.js`, `npm install --package-lock-only`, `npm run build` e `npm ls --depth=0`. Os testes de integração confirmaram bootstrap, login, rejeição de geração sem sessão, geração e rotação de token, rejeição do token anterior, autenticação MCP, persistência de password cifrada/hash, catálogo, favoritos, histórico e exposição das 12 ferramentas.

## Dependências externas ainda necessárias

Para pesquisar dados reais é necessário configurar pelo menos um feed RSS público legítimo ou desenvolver um adaptador para uma API oficial com credenciais fornecidas pelo administrador. O projeto não inclui chaves inventadas. Agentes MCP externos também dependem de endpoints e credenciais válidos.

A administração CRUD completa de agentes, a edição/pausa de provedores na interface e a recuperação de password por e-mail ainda não devem ser consideradas concluídas. A base backend para provedores e agentes já existe, mas esses fluxos continuam pendentes para uma aceitação de produção sem ressalvas.

## Hostinger

Defina `PORT`, `HOST=0.0.0.0`, `LAUNCHSCOUT_DATA_DIR`, `LAUNCHSCOUT_BOOTSTRAP_SECRET` e `MCP_MASTER_KEY`. Execute `npm ci`, `npm run build` e `npm run start:production`. O diretório configurado em `LAUNCHSCOUT_DATA_DIR` deve ser persistente e incluído nos backups. Publique atrás de HTTPS.
