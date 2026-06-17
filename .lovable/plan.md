## Entregável

Criar **`docs/ARCHITECTURE.md`** preenchendo o template "Prompt Coringa" com a arquitetura real do Dachser, extraída do código. Documento serve como template reutilizável para futuros projetos similares.

## Estrutura do documento

Cada seção do template será preenchida com dados reais coletados do repositório:

1. **Informações Básicas** — Nome, propósito (plataforma logística Z3US/DACHSER multi-modal: marítimo, aéreo, CCT, CHB, demurrage, esteira financeira, vouchers, draft, local charges), status (em uso).

2. **Tech Stack** — extraído do `package.json`:
   - Frontend: React 18.3, TypeScript 5.8, Vite 5.4, Tailwind 3.4, shadcn/ui (Radix), React Router 6.30, TanStack Query 5.83, React Hook Form + Zod, Recharts, Leaflet/Mapbox, react-pdf, jspdf, xlsx, sonner, sweetalert2.
   - Backend: Supabase Edge Functions (Deno) — **105 funções** catalogadas por módulo + servidor Node/Express opcional (`server/index.js`).
   - Database: MariaDB externo (pools AIR/SEA/FIN/CHARGES/OPS) acessado via `mariadb-proxy` edge function + Supabase Postgres para auth/profiles/roles/storage.
   - Deploy: Lovable Cloud / `dachser.lovable.app` e domínio `dachser.z3us.app`.
   - Secrets: ~50 secrets (MARIADB_*, LOVABLE_API_KEY, ANTHROPIC, OPENAI, GEMINI, HAPAG, FIRECRAWL, MAPBOX, SMTP, etc).

3. **Estrutura do projeto** — árvore real de `src/` (pages por módulo, components/{esteira,sea,air,cct,chb,demurrage,...}, hooks, utils, lib, types) e `supabase/functions/`.

4. **Módulos/Páginas principais** — 13 módulos catalogados com rota, hooks-chave, edge functions associadas:
   - Esteira Financeira (vouchers), CCT, Marítimo (tracking/draft/demurrage/local charges/análise), Aéreo (AWB tracking, AWB list), CHB (análise documental), Régua de Cobrança, Disputas, Olimpo (faturamento), Admin (users, cron, monitors), Auth, Dashboard, System Logs.

5. **Fluxo de dados & estado**:
   - Auth: MariaDB próprio (NÃO Supabase Auth) — regra registrada em memory.
   - Carregamento: TanStack Query + hooks (`useVoucherSync`, `useCCTData`, `useDemurrageData`, etc) → `supabase.functions.invoke('mariadb-proxy', {action})`.
   - CRUD: dialogs/modais shadcn + react-hook-form + zod → edge function → MariaDB → toast (sonner/sweetalert).
   - Fluxo IA: `LOVABLE_API_KEY` gateway para Claude/Gemini/OpenAI (extract-boleto-barcode, analyze-chb-documents, compare-documents-llm, etc).

6. **Design & Visual** — extraído de `src/index.css` e `tailwind.config.ts`:
   - Tema Z3US/DACHSER dark (bg `#050608`, gold `#F5B843`), tema light premium restrito ao módulo Maritime.
   - Tipografia Montserrat (`@fontsource/montserrat`).
   - Tokens HSL semânticos (sem cores hardcoded).
   - Componentes shadcn customizados.

7. **Funcionalidades-chave** — top 10: tracking marítimo multi-carrier (Hapag/MSC/ONE/ZIM), tracking aéreo, CCT compliance, extração de documentos por IA (boleto/DAI/HBL/NCM), workflow de vouchers com aprovação por supervisor, demurrage com pré-faturamento, draft exportação multi-carrier, régua de cobrança, disputas financeiras, monitoramento de SLAs operacionais.

8. **Responsive & Performance** — Tailwind breakpoints padrão, lazy routes via React.lazy onde aplicável, paginação server-side em tabelas grandes (vouchers, AWBs), polling controlado via `usePolling`/`usePageVisibility`.

9. **Integrações & APIs** — Hapag-Lloyd, JsonCargo, Leadcomex, Firecrawl, Mapbox/Leaflet, FlightRadar, LH Cargo, Azul, Anthropic/OpenAI/Gemini (via Lovable AI Gateway), SMTP (Resend + nodemailer), MariaDB pools externos.

10. **Código importante** — snippets de:
    - `src/App.tsx` (roteamento + providers)
    - `src/integrations/supabase/client.ts` (cliente)
    - Padrão de hook (`useVoucherInlineSave`)
    - Tipo principal (`Voucher` em `src/types/voucher.ts`)
    - `tailwind.config.ts` resumido
    - Edge function pattern (CORS + invoke MariaDB)

11. **Observações** — limitações conhecidas (sem Supabase Auth → RLS permissivo; staleness MariaDB; complexidade do `mariadb-proxy` de 23k linhas), pontos de melhoria (split do proxy, testes), desafios técnicos (concorrência de cron jobs, dedupe de vouchers, regras CCT/SLA).

12. **Resumo rápido** — 4 perguntas finais respondidas em 2-3 linhas cada.

## Operações

- **Criar:** `docs/ARCHITECTURE.md` (~600-900 linhas).
- **Ler para citações precisas:** `src/App.tsx`, `src/index.css`, `tailwind.config.ts`, `src/integrations/supabase/client.ts`, `src/types/voucher.ts`, `vite.config.ts`, lista completa de `supabase/functions/`.
- Sem alteração de código de aplicação. Apenas documentação.

## Fora de escopo

- Screenshots (Parte 9) — apenas indicar onde colocar; geração de imagens opcional via skill product-shot se o usuário pedir depois.
- Refatoração de código.
- Tradução para inglês (manter em PT-BR conforme template do usuário).
