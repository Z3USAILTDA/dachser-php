

# Tela de Teste de API Keys (Admin Z3US)

## Objetivo
Criar uma nova pagina em `/admin/api-test` acessivel apenas para admins Z3US, onde e possivel testar se as chaves de API configuradas estao funcionando corretamente.

## O que a tela faz

A pagina exibe uma lista de APIs do sistema (Gemini, Anthropic, Resend, Leadcomex, Firecrawl, FlightRadar24, JSONCargo, Hapag-Lloyd) com um botao "Testar" para cada uma. Ao clicar, uma edge function faz uma chamada minima a cada API e retorna se a chave esta valida ou nao, junto com o tempo de resposta.

### Layout
- Header com titulo "Teste de API Keys"
- Grid de cards, um para cada API, mostrando:
  - Nome da API
  - Status: "Nao testado", "Testando...", "OK" (verde), "Erro" (vermelho)
  - Tempo de resposta (quando testado)
  - Mensagem de erro (quando falhar)
  - Botao "Testar"
- Botao global "Testar Todas" no topo

## Detalhes Tecnicos

### Arquivo 1: `src/pages/admin/ApiKeyTest.tsx` (novo)
- Pagina seguindo o padrao visual do projeto (fundo escuro, cards com borda gold)
- Usa `PageLayout` e `PageCard` existentes
- Lista de APIs hardcoded com nome e descricao
- Cada card chama a edge function `test-api-key` passando o nome da API
- Exibe resultado com badge de status (verde/vermelho/cinza)

### Arquivo 2: `supabase/functions/test-api-key/index.ts` (novo)
- Recebe `{ apiName: string }` no body
- Faz uma chamada minima para cada API:
  - **Gemini**: POST para `generativelanguage.googleapis.com` com prompt simples "ping"
  - **Anthropic**: POST para `api.anthropic.com/v1/messages` com prompt minimo
  - **Resend**: GET para `api.resend.com/api-keys` (lista chaves, nao envia email)
  - **Leadcomex**: GET para endpoint de teste
  - **JSONCargo**: GET para endpoint de status
  - **FlightRadar24**: GET para endpoint de teste
  - **Hapag-Lloyd**: GET para endpoint de autenticacao
  - **Firecrawl**: GET para `api.firecrawl.dev/v1/crawl` (verifica autenticacao)
- Retorna `{ success: boolean, responseTimeMs: number, error?: string, details?: string }`
- CORS headers inclusos

### Arquivo 3: `src/pages/Dashboard.tsx` (modificar)
- Adicionar novo item no menu ADMIN:
  ```
  { label: "Teste de API Keys", href: "/admin/api-test", z3usOnly: true }
  ```

### Arquivo 4: `src/App.tsx` (modificar)
- Adicionar rota: `<Route path="/admin/api-test" element={<ApiKeyTest />} />`

### Arquivo 5: `supabase/config.toml` (modificar)
- Adicionar configuracao para a nova edge function com `verify_jwt = false`
