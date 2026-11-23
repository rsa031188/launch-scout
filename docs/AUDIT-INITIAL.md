# Relatório de auditoria inicial — LaunchScout

## Existia e funcionava parcialmente
- Frontend Vite com Dashboard, Radar, Minha lista e modal de conexões MCP.
- Identidade Noir Signal e layout responsivo.
- Servidor HTTP Node unificado servindo `dist/` e `/api/mcp`.
- Persistência JSON local do catálogo e hash SHA-256 do token.
- JSON-RPC básico para `initialize`, `ping`, `tools/list` e `tools/call`.
- Deduplicação e normalização de resultados recebidos de conexões MCP externas.

## Apenas visual ou incompleto
- Perfil, login, cadastro, recuperação de senha e administração de conta não existiam.
- O modal de conexões guardava agentes e credenciais no `localStorage`.
- Favoritos e catálogo eram mantidos no navegador, sem API de utilizador.
- Dashboard utilizava inferências e texto de tendência fixo.
- “Pesquisa” consultava somente lançamentos já armazenados; não havia provedor externo real.
- A lista MCP continha apenas quatro ferramentas.

## Riscos críticos encontrados
- `POST /api/auth/generate`, `/recover` e `/revoke` eram acessíveis sem sessão administrativa.
- `GET /api/auth/status` revelava o estado do token sem autenticação.
- O token em claro era mantido no navegador e em inputs do frontend.
- Não havia cookies de sessão, CSRF, rate limiting, política de password ou bootstrap de administrador.
- O armazenamento JSON não tinha versão, lock de concorrência, histórico administrativo ou sessões.
- O servidor não aplicava headers de segurança completos nem validação SSRF para endpoints configurados.
- `CORS_ORIGIN` podia ser configurado de forma permissiva sem política documentada.
- O `TODO.md` marcava como concluído itens que a própria documentação identificava como simulação/localStorage.

## Prioridade desta fase
Corrigir autorização e persistência de identidade/token antes de expandir pesquisa, agentes e interface administrativa. Nenhuma integração externa será declarada ativa sem credencial legítima e teste real.
