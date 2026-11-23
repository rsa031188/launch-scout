# LaunchScout — Plano de implementação

## Objetivo
Evoluir o repositório existente para uma plataforma operacional, segura e persistente para descoberta de lançamentos e integração com agentes MCP, sem substituir o frontend Noir Signal já construído.

## Estado inicial auditado
A interface e o servidor Node já existem, mas a autenticação de utilizadores não existe, os endpoints de geração/recuperação/revogação de token são públicos, o token é guardado no navegador e o catálogo/favoritos/configurações dependem de `localStorage`. O MCP tem apenas quatro ferramentas e a pesquisa consulta apenas o catálogo local.

## Sequência de implementação
1. Fundamentos de segurança e persistência: store backend versionado, hash de palavras-passe, sessões, cookies protegidos, CSRF, rate limiting, bootstrap seguro do primeiro administrador e autorização administrativa.
2. Gerenciamento MCP: um único token ativo, cifrado com AES-256-GCM, hash para comparação segura, rotação atómica, revogação, estado e histórico.
3. API de catálogo: lançamentos, favoritos, histórico de pesquisa e estatísticas no backend; manter o `localStorage` apenas como cache transitório de interface.
4. MCP compatível: initialize, ping, tools/list e tools/call com validação de parâmetros, respostas estruturadas e as 12 ferramentas previstas.
5. Pesquisa modular: adaptadores para provedores configurados pelo administrador, RSS/HTTP público com validação de URL e SSRF, normalização, proveniência, deduplicação e validação.
6. Frontend: autenticação, área administrativa, estados reais de conexão, catálogo sincronizado com API e remoção de textos/estatísticas fictícios.
7. Validação: testes automatizados de segurança, auth, token, MCP, persistência e build/Hostinger.

## Estrutura alvo
- `server.js`: servidor HTTP unificado, roteamento e headers.
- `src/main.js`: interface Noir Signal e integração com APIs.
- `src/styles.css`: identidade visual existente.
- `data/`: armazenamento persistente fora do Git, configurável por `LAUNCHSCOUT_DATA_DIR`.
- `tests/`: testes de contrato e integração sem depender de browser.
- `docs/`: implantação Hostinger, variáveis, MCP e auditoria.

## Design preservado
**Movimentos considerados:** Noir Signal editorial (0,05); control room de inteligência (0,08); dark SaaS administrativo (0,87). Escolhido: Noir Signal editorial.

- **Movimento:** painel editorial de inteligência, escuro, silencioso e orientado a sinais.
- **Princípios:** contraste alto, densidade controlada, proveniência sempre visível e feedback de estado explícito.
- **Cores:** fundo azul-quase-preto para foco; verde-lima como sinal de ação/saúde; violeta, azul e laranja para diferenciar estados sem competir com o conteúdo.
- **Layout:** navegação lateral persistente e áreas de conteúdo em camadas, com cards e painéis de operação em vez de uma grelha genérica.
- **Assinaturas:** marca-radar, linhas de telemetria e bordas luminosas discretas.
- **Interação:** cada ação crítica informa o estado real; não apresentar conexão, resultado ou credencial sem confirmação do backend.
- **Animação:** transições curtas, radar contínuo apenas como sinal ambiental, sem animação em dados que possa sugerir atividade inexistente.
- **Tipografia:** Space Grotesk para leitura e DM Mono para metadados operacionais.
- **Essência:** radar pessoal que transforma ruído de lançamentos em sinais verificáveis; atento, técnico, editorial.
- **Tom:** direto, calmo e verificável. Ex.: “Nenhum provedor respondeu” e “Token substituído e credencial anterior invalidada”.
- **Wordmark:** nome tipográfico acompanhado por um círculo-radar com ponto de sinal.
- **Cor proprietária:** verde-lima `#8FEA64`.
