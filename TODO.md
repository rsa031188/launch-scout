# LaunchScout — TODO real

## Fundamentos de segurança e persistência
- [ ] Implementar cadastro/login/logout, sessões persistentes, cookies seguros, CSRF e rate limiting.
- [ ] Implementar bootstrap protegido do primeiro administrador por variáveis de ambiente.
- [ ] Migrar utilizadores, sessões, configurações, histórico e auditoria para o backend persistente.
- [ ] Remover a dependência funcional do `localStorage` para catálogo, favoritos e credenciais.

## Gerenciamento MCP
- [ ] Proteger `generate`, `recover`, `revoke` e `status` com sessão administrativa.
- [ ] Armazenar o único token ativo cifrado com AES-256-GCM e hash para comparação.
- [ ] Garantir rotação atómica, invalidação imediata, revogação e histórico administrativo.
- [ ] Validar transporte e ciclo de vida MCP com cliente externo real.

## MCP e agentes
- [ ] Expandir MCP para as 12 ferramentas requeridas, schemas e respostas estruturadas.
- [ ] Criar CRUD persistente de agentes, estado, desempenho e erros.
- [ ] Implementar orquestração com timeout, falhas parciais e consolidação.

## Pesquisa real
- [ ] Criar adaptadores para provedores reais configuráveis (API/RSS/HTTP público).
- [ ] Validar URLs, datas, proveniência, duplicados e estado de verificação.
- [ ] Não apresentar resultados inventados nem declarar provedor ativo sem teste.

## Interface
- [ ] Adicionar autenticação e perfil/segurança.
- [ ] Completar administração MCP, pesquisa, agentes e estados reais.
- [ ] Sincronizar dashboard, catálogo, favoritos e histórico com API.

## Validação e entrega
- [ ] Testes automatizados de auth, tokens, MCP, pesquisa, persistência e segurança.
- [ ] Build e execução `npm ci`, `npm run build`, `npm run start:production`.
- [ ] Documentação definitiva de Hostinger, variáveis, backups e utilização MCP.
- [ ] Relatório final com itens aprovados e dependências externas.
