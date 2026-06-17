# Arquitetura do Sistema Dachser

> Documento gerado a partir de extração direta do código-fonte. Serve como template reutilizável para clonar a arquitetura em novos projetos similares (logística / operacional / multi-módulo / IA-assistido).

---

## Informações Básicas

- **Nome do Sistema:** Dachser (interno: Z3US / DACHSER Platform)
- **Propósito:** Plataforma operacional logística multi-modal (marítimo, aéreo, CCT, CHB, demurrage, esteira financeira de vouchers, draft de exportação, local charges, régua de cobrança, disputas) com integração a múltiplas APIs de carriers e camada de IA para extração de documentos.
- **Status:** Em produção (`https://dachser.z3us.app` e `https://dachser.lovable.app`).
- **Origem:** Migração de sistema Z3US legado para Lovable, mantendo paridade visual e funcional (regra registrada em memória do projeto).

---

## PARTE 1 — Tech Stack

### Frontend
| Item | Valor |
|------|-------|
| Framework | **React 18.3.1** |
| Linguagem | **TypeScript 5.8.3** |
| Build tool | **Vite 5.4.19** + `@vitejs/plugin-react-swc` |
| Styling | **Tailwind CSS 3.4.17** + `tailwindcss-animate` + `@tailwindcss/typography` |
| UI Library | **shadcn/ui** (composição completa de Radix UI: dialog, dropdown, popover, tabs, toast, tooltip, accordion, etc — ~30 primitivos) |
| Roteamento | **react-router-dom 6.30** |
| Estado servidor | **@tanstack/react-query 5.83** |
| Forms | **react-hook-form 7.61** + **zod 3.25** + `@hookform/resolvers` |
| Charts | **Recharts 2.15** |
| Mapas | **Leaflet 1.9 / react-leaflet 4.2** + **mapbox-gl 3.17** |
| Documentos | **react-pdf 9.2**, **jspdf 3.0** + `jspdf-autotable`, **xlsx 0.18** + `xlsx-js-style` |
| Notificações UX | **sonner 1.7** + **sweetalert2 11.26** + Radix Toaster |
| Datas | **date-fns 3.6** + **react-day-picker 8.10** |
| Tipografia | **@fontsource/montserrat** |
| Ícones | **lucide-react 0.462** + **@fortawesome/react-fontawesome 7.1** |
| Tema | **next-themes 0.3** (dark/light com guard por módulo) |

### Backend
- **Supabase Edge Functions (Deno)** — **105 funções** organizadas por domínio.
- **Servidor Node/Express auxiliar** (`server/index.js`) para desenvolvimento local e endpoints específicos (`express ^5.2`, `cors`, `nodemailer`).
- Driver MariaDB nativo: **mysql2 3.22** (usado pelo edge function `mariadb-proxy`).
- **APIs externas integradas:**
  - **Carriers marítimos:** Hapag-Lloyd (OAuth), MSC, ONE, ZIM, JsonCargo
  - **Aéreas:** Azul API, LH Cargo, FlightRadar, Leadcomex
  - **Compliance brasileiro:** RFB webhook (CCT/MANTRA)
  - **LLMs (via Lovable AI Gateway com `LOVABLE_API_KEY`):** Anthropic Claude, OpenAI, Google Gemini
  - **Outras:** Firecrawl (scraping), Mapbox (geocoding), Resend + SMTP (e-mails)

### Database
- **MariaDB externo** (instância proprietária da Dachser) — pools dedicados:
  - `MARIADB_AIR_*` — operação aérea
  - `MARIADB_SEA_*` — operação marítima
  - `MARIADB_FIN_*` — financeiro / vouchers / esteira
  - `MARIADB_OPS_*` — operacional consolidado
  - `MARIADB_CHARGES_*` — local charges
- **Acesso:** 100% via edge function `mariadb-proxy` (`supabase/functions/mariadb-proxy/index.ts`, ~23k linhas) que expõe ~200+ `action` discriminadas.
- **Tabelas-chave** (prefixo `dados_dachser.t_*`):
  - `t_vouchers`, `t_voucher_anexos`, `t_voucher_batch_*`, `t_voucher_logs`, `t_dados_financeiro_voucher`
  - `t_sea_tracking_current`, `t_sea_tracking_history`, `t_sea_processes`
  - `t_cct_dashboard_cache` (fonte única de verdade para CCT)
  - `t_cct_hawb_api_historico` / `t_cct_hawb_api_atual`
  - `t_demurrage_*`, `t_local_charges_*`, `t_chb_*`
  - `t_aereo_*`, `t_aereo_ws`
- **Supabase Postgres** (apenas para infraestrutura Lovable):
  - `profiles`, `user_roles` (`app_role` enum), `shipments`, `analise_documental_historico`, `cct_*`, `air_*`, `api_usage_cycles`, `forced_logouts`
  - Função `has_role(_user_id, _role)` SECURITY DEFINER para verificação anti-recursão de RLS

> **Regra crítica:** auth da aplicação é **MariaDB próprio**, NÃO Supabase Auth. Todas as policies RLS no Postgres são permissivas (`TO anon, authenticated USING(true)`) — restringir por `auth.uid()` bloqueia toda a aplicação.

### Deploy
- **Hospedagem:** Lovable Cloud (preview + produção)
- **Domínios:** `dachser.lovable.app` (Lovable), `dachser.z3us.app` (custom)
- **CI/CD:** Deploy automático via Lovable; edge functions deployadas via Supabase CLI gerenciado
- **Storage buckets:** `voucher-anexos`, `hawb-documents`, `maritime-files`, `chb-documents` (todos públicos)
- **Secrets configurados (~50):** MARIADB_* (5 pools × 5 vars), LOVABLE_API_KEY, ANTHROPIC_API_KEY, ANTHROPIC_FINANCEIRO_API_KEY, CHB_ANTHROPIC_API_KEY, OPENAI_API_KEY, CHB_OPENAI_API_KEY, GEMINI_API_KEY, HAPAG_CLIENT_ID, HAPAG_API_KEY, JSONCARGO_API_KEY, FIRECRAWL_API_KEY, LH_CARGO_APIKEY, LEADCOMEX_API_TOKEN, AZUL_API_EMAIL/PASSWORD, FLIGHTRADAR_API_KEY, MAPBOX_PUBLIC_TOKEN, RESEND_API_KEY, SMTP_* (HOST/PORT/USER/PASS/FROM_EMAIL/FROM_NAME)

### Top 15 dependências
1. `@supabase/supabase-js` — cliente backend
2. `@tanstack/react-query` — cache/estado servidor
3. `react-router-dom` — roteamento
4. `react-hook-form` + `zod` — forms validados
5. `tailwindcss` + `tailwindcss-animate` — styling
6. `@radix-ui/*` (~30 pacotes) — primitivos UI
7. `recharts` — gráficos
8. `mapbox-gl` + `leaflet` — mapas (tracking marítimo)
9. `mysql2` — driver MariaDB (edge function)
10. `react-pdf` + `jspdf` + `jspdf-autotable` — geração/visualização de PDFs
11. `xlsx` + `xlsx-js-style` — import/export Excel
12. `sonner` + `sweetalert2` — feedback de UX
13. `date-fns` — manipulação de datas
14. `lucide-react` — ícones
15. `nodemailer` + `express` — servidor auxiliar de e-mail

---

## PARTE 2 — Estrutura do Projeto

```
dachser/
├── src/
│   ├── App.tsx                      # Roteamento de ~120 rotas
│   ├── main.tsx
│   ├── index.css                    # Tokens HSL (dark default + light Maritime)
│   ├── components/
│   │   ├── ui/                      # shadcn primitives
│   │   ├── esteira/                 # ~45 componentes: VoucherTable, BatchDocumentBinderDialog, ProntidaoChecklist, ...
│   │   ├── sea/                     # Componentes marítimos
│   │   ├── air/                     # AwbTimelineModal, EmailClienteRegras, ...
│   │   ├── cct/                     # ProcessosTable, EventTimeline, StatusBadge, ...
│   │   ├── chb/                     # ChbAnalysisPanel, ChbComparisonGrid, ...
│   │   ├── demurrage/               # Painéis de free time, rates, disputas
│   │   ├── draft/                   # Draft exportação multi-carrier
│   │   ├── maritimo/                # Análise documental marítima
│   │   ├── tracking/                # VesselFinderMap, RegisterFreeTimeDialog
│   │   ├── olimpo/                  # Faturamento/cobrança
│   │   ├── voucher/                 # VoucherDetailsView, VoucherTable
│   │   ├── analise-documental/      # ComparisonResults, FileUploadSection
│   │   ├── layout/                  # PageLayout, PageHeader, FilterBar, TablePagination
│   │   ├── charts/                  # ChartDetailPanel, DonutSingleChart
│   │   ├── admin/                   # InviteUserDialog, ActiveConnectionsDialog
│   │   ├── tabs/                    # ReportsTab, RoboTab
│   │   └── fin/                     # ReguaDbStatsPanel
│   ├── pages/                       # ~80 páginas por módulo
│   │   ├── esteira/  cct/  sea/  air/  chb/  demurrage/  fin/  olimpo/  admin/
│   ├── hooks/                       # 27 hooks customizados
│   ├── lib/                         # parseExcel, compareDocuments, shippingLineMapping, utils, dachser-styles
│   ├── utils/                       # SLA, timezone, PDF/Excel export, notificações, parseMariaDBDate
│   ├── types/                       # voucher.ts, sea.ts, air.ts, chb.ts, cct.ts, draft.ts
│   ├── services/                    # maritimoApi.ts
│   ├── integrations/supabase/       # client.ts (auto-gerado), types.ts
│   └── data/                        # Mocks e listas estáticas
├── supabase/
│   ├── config.toml
│   └── functions/                   # 105 edge functions (Deno)
│       ├── mariadb-proxy/           # Hub central ~23k linhas / ~200 actions
│       ├── _shared/
│       └── ...104 outras por módulo (sea-*, air-*, cct-*, voucher-*, demurrage-*, chb-*, regua-*, ...)
├── server/index.js                  # Express auxiliar (dev)
├── docs/ARCHITECTURE.md             # Este arquivo
├── .lovable/memory/                 # Memória persistente do agente Lovable
├── public/.htaccess
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## PARTE 3 — Módulos / Páginas Principais

### 1. Esteira Financeira (Vouchers)
- **Rotas:** `/fin/esteira`, `/fin/esteira/dashboard`, `/fin/esteira/voucher/:id`, `/fin/esteira/robot`, `/fin/esteira/accrual`, `/fin/esteira/rules`, `/fin/esteira/reports`
- **Componentes:** `VoucherTable`, `BatchDocumentBinderDialog`, `BatchImportVoucherDialog`, `BatchVoucherChecklist`, `DadosPagamentoPanel`, `VoucherDetailsView`, `ProntidaoChecklist`, `DesmembrarMasterDialog`, `VoucherFiscalActions`, `VoucherSupervisorActions`, `VoucherFinanceiroActions`, `VoucherOperacaoActions`, `VoucherRoboActions`, `ComprovantesTab`, `HistoricoBaixasTab`, `PagamentosTab`, `FaturasDoDiaTab`, `BacklogTab`
- **Hooks:** `useVoucherSync`, `useVoucherInlineSave`, `useAccrualEntries`
- **Edge functions:** `voucher-mariadb-sync`, `voucher-check-baixas`, `voucher-integrate-rm`, `voucher-sync-rm-pending`, `voucher-othello-webhook`, `voucher-monthly-report`, `send-voucher-notification`, `extract-boleto-barcode`, `parse-comprovante-pdf`, `parse-invoice-pdf`
- **Funcionalidades:** workflow multi-etapa (A_PROCESSAR → OPERACAO → FISCAL → FINANCEIRO → SUPERVISOR → PAGAMENTO), extração automática de boleto/DAI por LLM, master/filhos, lote de importação, robô de comprovantes, régua de aprovações por e-mail externa, dedupe por SPO+fornecedor+valor
- **Exemplo de objeto:** `Voucher` em `src/types/voucher.ts` (~80 campos)

### 2. CCT (Compliance Carga e Trânsito)
- **Rotas:** `/air/cct`, `/air/cct/excecoes`, `/air/cct/analytics`, `/air/cct/notificacoes`, `/air/cct/console`, `/air/cct/processo/:id`, `/air/cct/leadcomex-logs`
- **Componentes:** `ProcessosTable`, `EventTimeline`, `AttemptTimeline`, `StatusBadge`, `LeadComexStatusBadge`, `NovoShipmentDialog`, `AssignAnalistaDialog`
- **Hooks:** `useCCTData`, `useLeadcomexLogs`, `useRegrasNotificacao`, `useSlaConfig`
- **Edge functions:** `cct-ingest`, `cct-notify`, `cct-dep-alert`, `arr-to-cct-sync`, `leadcomex-sync`, `leadcomex-query-mawb`
- **Fonte de verdade:** `t_cct_dashboard_cache.eventos` (regra registrada em memória)
- **Funcionalidades:** timeline de eventos por HAWB, exceções operacionais, SLA de manifestação, integração Leadcomex/RFB

### 3. Marítimo — Tracking
- **Rotas:** `/sea/tracking`, `/sea/tracking/notificacoes`
- **Componentes:** `VesselFinderMap`, `RegisterFreeTimeDialog`, `TrackingStatusBadge`
- **Edge functions:** `sea-tracking-cron`, `sea-tracking-transship-backfill`, `sea-msc-batch-update`, `sea-carrier-fallback`, `hapag-batch-discover`, `draft-track-hapag-multi`, `draft-track-navigator`, `resolve-vessel-imo`
- **Funcionalidades:** multi-carrier (Hapag/MSC/ONE/ZIM), fallback de transhipment cumulativo, timezone UTC-3 forçado, retracking de containers ativos

### 4. Marítimo — Draft Exportação
- **Rotas:** `/sea/draft-exportacao`
- **Componentes:** `DraftDataGrid`, `DraftMultiSearch`, `DraftSyncDashboard`, `HapagTrackerPanel`, `BookingResultCard`, `ContainersTable`, `EventsTable`, `DraftEventTimeline(Vertical)`, `SeaDbStatsPanel`
- **Hooks:** `useDraftData`
- **Edge functions:** `draft-fetch-mariadb`, `draft-fetch-tracking-status`
- **Funcionalidades:** regex detection HAPAG/MSC/ONE, sincronização com MariaDB SEA

### 5. Marítimo — Demurrage
- **Rotas:** `/sea/demurrage/{monitor,free-times,rates,pre-invoicing,carrier-costs,disputes,clients,analytics,settings,manual}`
- **Hooks:** `useDemurrageData`, `useClientFreeTime`, `useClientProfiles`
- **Edge functions:** `demurrage-auto-invoice`, `demurrage-daily-monitor`, `demurrage-fetch-timelines`, `demurrage-health-check`, `demurrage-import-jsoncargo`, `demurrage-recalc`, `demurrage-mariadb-sync`, `demurrage-alert-cron`, `demurrage-send-alert`, `demurrage-invite-user`, `client-freetime-crud`
- **Funcionalidades:** pré-faturamento (requer evento gate-out), cálculo BRL, ciclos import/export, disputas, free time por contrato vs processo

### 6. Marítimo — Local Charges & Alterações Fee
- **Rotas:** `/sea/local-charges`, `/sea/alteracoes-fee`
- **Funcionalidades:** carrier-específico (UI ZIM diferenciada), matching de histórico por chave (não temporal exato)

### 7. Marítimo — Análise Documental
- **Rotas:** `/maritimo`, `/sea/analysis`, `/sea/cadastro-hbl`, `/sea/cadastro-manifest`, `/sea/submeter-hbl-mbl`, `/sea/submeter-manifest-hbl`, `/sea/invoices-draft-hbl`, `/sea/cadastro-bl`
- **Componentes:** `UploadZone`, `FilePreviewDialog`, `AnalysisResultDisplay`, `XlsxDebugPanel`, `RejectedTokensDebug`
- **Hooks:** `useMaritimoItems`, `useMaritimoHistory`
- **Edge functions:** `maritimo-analyze`, `sea-submit-analysis`, `sea-poll-analysis`, `sea-extract-attachments`, `sea-reextract-metadata`, `sea-get-{item,items,history,system-logs}`, `sea-upload-base-file`, `parse-bl-cadastro`, `parse-hawb-cadastro`, `parse-manifest-swap`, `sea-analysis-watchdog`
- **Funcionalidades:** extração híbrida XLSX+LLM de manifest/HBL, regras NCM 4/6/8 dígitos, comparação invoice vs HBL

### 8. Aéreo
- **Rotas:** `/air/tracking`, `/air/check`, `/air/awb-list`, `/air/cadastro-nova`, `/air/tracking-aereo`
- **Componentes:** `AwbTimelineModal`, `AwbTimelineModalScraper`, `EmailClienteRegrasDialog`
- **Hooks:** `useEmailClienteRegras`
- **Edge functions:** `add-awb`, `add-awb-to-status`, `fetch-awbs`, `fetch-awbs-dep`, `fetch-awbs-for-retrack`, `fetch-air-imports`, `fetch-status-aereo`, `fetch-tracking-aereo`, `track-awb`, `parse-awb`, `air-dep-transition-alert`, `air-detect-master-swap`, `air-scan-finalized`, `air-tracking-failed-alert`
- **Funcionalidades:** tracking multi-airline com links externos (`noopener,noreferrer`), SLA monitoring com SQL hours, manual overrides com prioridade absoluta, discrepância forçada

### 9. CHB (Conferência de Habilitação)
- **Rotas:** `/chb/conferences`, `/chb/conferences/:id`
- **Componentes:** `ChbAnalysisPanel`, `ChbComparisonGrid`, `ChbDocumentsPanel`, `ChbHistoryPanel`, `ChbNotesPanel`, `ChbStepper`, `ChbTabs`, `ChbClientConfigDialog`, `ChbErrorDisplay`, `EditableCell`
- **Hooks:** `useChbData`, `useChbClientConfig`, `useChbCorrections`
- **Edge functions:** `analyze-chb-documents`, `extract-chb-file`, `chb-corrections`, `compare-documents-llm`
- **Funcionalidades:** extração em 2 estágios (Flash + Pro), validação incoterm × tipo de frete

### 10. Régua de Cobrança & Disputas
- **Rotas:** `/fin/regua`, `/fin/disputa`
- **Componentes:** `ReguaDbStatsPanel`
- **Edge functions:** `regua-send-aging`, `regua-send-emails`
- **Funcionalidades:** estágios por DATEDIFF, agrupamento por `SUBSTRING_INDEX(razão_social, ' ', N)`, disputas via debit notes canônicas

### 11. Olimpo (Faturamento / Cobrança)
- **Rotas:** `/olimpo`, `/olimpo/mapa`, `/olimpo/cobranca`, `/olimpo/faturamento`
- **Componentes:** `ClientDetailSheet`
- **Edge functions:** `olimpo-proxy`, `olimpo-sync`, `setup-cliente-grupo`

### 12. Análise Documental Financeira
- **Rotas:** `/fin/analise-documental`, `/fin/analise-documental/comparar`, `/fin/analise-documental/detalhes/:id`, `/fin/othello-import`
- **Componentes:** `ComparisonResults`, `FileUploadSection`
- **Edge functions:** `compare-documents-llm`, `fin-othello-import`

### 13. Admin
- **Rotas:** `/admin/users`, `/admin/apis`, `/admin/database`, `/admin/api-test`, `/admin/firecrawl-monitor`, `/admin/cron-manager`, `/admin/system-logs`, `/admin/metrics`, `/admin/z3us/upload-master`
- **Componentes:** `AnthropicCreditsCard`, `InviteUserDialog`, `ActiveConnectionsDialog`, `DatabaseStatsPanel`, `RuleMatrixManager`
- **Edge functions:** `create-user`, `validate-dachser-user`, `cron-manager`, `db-status-report`, `db-critical-alert`, `fetch-database-stats`, `send-welcome-email`, `send-password-reset-code`, `firecrawl-monitor-stats`, `firecrawl-monitor-alert`, `anthropic-balance-alert`, `send-api-usage-alert`, `test-api-key`, `import-rule-matrix`

---

## PARTE 4 — Fluxo de Dados & Estado

### Autenticação
- **Sem Supabase Auth.** Login feito contra MariaDB próprio via edge function `validate-dachser-user`.
- Tokens/sessão armazenados em `localStorage` pelo `useAuth` hook.
- Primeiro login força troca de senha (`/change-password`).
- `InactivityGuard` força logout por inatividade.
- `forced_logouts` table (Postgres) permite invalidar sessões remotamente.
- Roles em `user_roles` (Postgres) com enum `app_role` + função `has_role()` SECURITY DEFINER (anti-recursão).

### Carregar Dados
- Padrão: **TanStack Query** com `staleTime: 60s`, `retry: 1`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`.
- Hooks customizados encapsulam invoke do edge function (ex: `useCCTData`, `useDemurrageData`, `useDraftData`, `useVoucherSync`).
- Chamada típica: `supabase.functions.invoke('mariadb-proxy', { body: { action: 'list_xxx', ...params } })`.
- Polling controlado por `usePolling` + `usePageVisibility` (pausa quando aba inativa).
- Loading via `Skeleton`/`LoadingSpinner` shadcn; erros silenciados em UI (regra: nunca mostrar banner de erro de DB).

### Criar / Editar / Deletar
- **Inline:** `useVoucherInlineSave` salva campo único via `mariadb-proxy` action `update_voucher_field`, com feedback `savingField`/`savedField`.
- **Modal/Dialog:** dialogs shadcn + react-hook-form + zod; submit chama edge function; feedback via toast (`sonner`) ou `sweetalert2` para confirmações destrutivas.
- **Lote (Voucher):** wizard de import com extração de PDF (boleto/DAI) → checklist de prontidão → finalize cria master com linha digitável extraída do BOLETO vinculado ao master (regra: nunca herdar do filho).
- **Validações:** zod no frontend + validações de negócio no edge function (ex: `requires_boleto`, `requires_anexo`, `check_voucher_rm_ready`).

### IA / LLM
- Todas as chamadas LLM passam pelo **Lovable AI Gateway** (`LOVABLE_API_KEY`).
- Edge functions: `extract-boleto-barcode`, `analyze-chb-documents`, `compare-documents-llm`, `extract-chb-file`, `parse-comprovante-pdf`, `parse-invoice-pdf`, `parse-bl-cadastro`, `parse-hawb-cadastro`, `parse-manifest-swap`, `maritimo-analyze`.
- Estratégia híbrida (regex + LLM) para NCMs, manifests, boletos multi-linha (parser defensivo com slicing 47/48 dígitos).

### Cron / Background
- `cron-manager` orquestra ~20 jobs: sync MariaDB↔Supabase, demurrage daily, retrack marítimo, alertas de SLA, monthly reports, send-emails de régua, dedupe de vouchers a cada 10min, status automation a cada 1min.

---

## PARTE 5 — Design & Visual

### Cores (tokens HSL em `src/index.css`)

**Tema dark padrão (Z3US/DACHSER):**
| Token | HSL | Hex aprox |
|-------|-----|-----------|
| `--background` | `220 15% 4%` | `#050608` |
| `--card` | `220 20% 8%` | `#0F1117` |
| `--foreground` | `0 0% 95%` | `#F2F2F2` |
| `--primary` (gold) | `45 100% 50%` | `#F5B843` |
| `--primary-foreground` | `0 0% 5%` | `#0D0D0D` |
| `--secondary` | `220 15% 15%` | `#1F2329` |
| `--accent` | `220 15% 18%` | `#262B33` |
| `--border` | `220 10% 18%` | `#2A2E36` |

**Tema light premium (restrito ao módulo Maritime):**
- `--background: 40 20% 97%` (off-white quente)
- `--card: 40 15% 99%`
- Glassmorphism com blur, ativado por `SeaThemeGuard`

### Tipografia
- **Primária:** Montserrat (via `@fontsource/montserrat`) — usada em headings e body
- **Mono:** stack monoespaçada padrão
- Sizes: h1 36px, h2 24px, h3 18px, body 14px, small 12px (via classes Tailwind)

### Tema
- **Dark default**, light apenas no módulo `/sea/*` controlado por `SeaThemeGuard` + `useTheme`.
- Tokens semânticos obrigatórios — nunca usar `text-white`, `bg-black`, `bg-[#...]` (regra registrada em memória).

### Componentes Visuais
- **Buttons:** shadcn `Button` com variantes (`default` gold, `outline`, `ghost`, `destructive`); hover suave; rounded
- **Cards:** `bg-card border border-border rounded-lg` com sombras sutis; gradientes radiais em hero
- **Inputs:** shadcn `Input` com focus ring na cor primária (gold)
- **Modals:** Radix Dialog com overlay blur + animação fade/scale
- **Tables:** shadcn `Table` + `TablePagination` customizado server-side
- **Charts:** Recharts (Donut, Bar, Line) com tokens HSL via CSS vars
- **Maps:** Leaflet (tracking marítimo standalone) + Mapbox GL (rotas complexas, requer `MAPBOX_PUBLIC_TOKEN`)

---

## PARTE 6 — Funcionalidades-Chave

- [x] **Tracking marítimo multi-carrier** com fallback (Hapag/MSC/ONE/ZIM/JsonCargo) + detecção cumulativa de transhipment
- [x] **Tracking aéreo multi-airline** com SLA monitoring (SQL hours) e links externos seguros
- [x] **CCT compliance** com cache único como fonte de verdade e SLA de manifestação
- [x] **Esteira financeira de vouchers** (workflow A_PROCESSAR → SUPERVISOR → PAGAMENTO) com master/filhos, lote, robô de comprovantes
- [x] **Extração de documentos por IA** (boleto/DAI multi-linha, HBL, manifest, NCM 4/6/8 dígitos) via Lovable AI Gateway
- [x] **Demurrage** com pré-faturamento (gate-out obrigatório), free time por contrato/processo, disputas, alertas diários
- [x] **Draft de exportação** multi-carrier com regex detection e booking sync
- [x] **Régua de cobrança** com staging DATEDIFF e agrupamento por nome de empresa
- [x] **Disputas financeiras** com chaves canônicas para debit notes
- [x] **Análise documental CHB** em 2 estágios (Flash + Pro)
- [x] **Aprovação de vouchers urgentes** via e-mail externo (endpoints `/supervisor-approve`, `/supervisor-reject`)
- [x] **Othello import** (importação financeira multi-tab Excel)
- [x] **Admin completo** (users, API keys, cron, DB monitor, Firecrawl monitor, métricas Anthropic)
- [x] **Mapa interativo Olimpo** com clientes geolocalizados

---

## PARTE 7 — Responsive & Performance

- **Mobile:** Tailwind breakpoints padrão (`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`)
- **Hook:** `use-mobile.tsx` para lógica condicional
- **Lazy loading:** rotas importadas via `import` direto (sem `React.lazy` sistemático — oportunidade de melhoria)
- **Paginação:** server-side em tabelas grandes (vouchers, AWBs) via `TablePagination`
- **Polling inteligente:** `usePolling` + `usePageVisibility` pausa em aba inativa
- **Query cache:** `staleTime 60s` evita refetch desnecessário
- **Skip de fetch concorrente:** flags `[loadVouchers] Skipped — already in flight`
- **Code splitting:** automático por Vite/SWC

---

## PARTE 8 — Integrações & APIs

| Categoria | Provedor | Edge function |
|-----------|----------|---------------|
| Carrier marítimo | Hapag-Lloyd (OAuth) | `draft-track-hapag-multi`, `hapag-batch-discover` |
| Carrier marítimo | MSC | `sea-msc-batch-update`, `sea-carrier-fallback` |
| Carrier marítimo | JsonCargo (agregador) | `demurrage-import-jsoncargo`, `draft-fetch-tracking-status` |
| Carrier marítimo | ZIM, ONE | `sea-carrier-fallback` |
| Aéreo | Azul, LH Cargo, FlightRadar | `fetch-tracking-aereo`, `track-awb` |
| Aéreo | Leadcomex | `leadcomex-sync`, `leadcomex-query-mawb`, `leadcomex-test-reverse` |
| Compliance | RFB / MANTRA | `rfb-webhook` |
| LLM | Lovable AI Gateway (Claude/OpenAI/Gemini) | `analyze-chb-documents`, `compare-documents-llm`, `extract-*`, `parse-*`, `maritimo-analyze` |
| Scraping | Firecrawl | `firecrawl-monitor-stats`, `firecrawl-monitor-alert` |
| Maps | Mapbox + Leaflet | `get-mapbox-token` |
| E-mail | Resend + SMTP (nodemailer) | `send-welcome-email`, `send-password-reset-code`, `send-voucher-notification`, `send-status-change-email`, `send-container-status-email`, `send-api-usage-alert`, `supervisor-email-action` |
| DB legado | MariaDB (5 pools) | `mariadb-proxy`, `mariadb-connect`, `mariadb-sync`, `mariadb-contacts-sync`, `mariadb-dep-sync` |
| Webhook | Othello (financeiro) | `voucher-othello-webhook`, `fin-othello-import` |

- Cliente HTTP: `fetch` nativo (Deno) nos edge functions; `supabase.functions.invoke()` no frontend

---

## PARTE 9 — Screenshots

> Adicionar imagens em `docs/screenshots/`:

1. **Dashboard geral** — `docs/screenshots/01-dashboard.png`
2. **Esteira Financeira (módulo principal)** — `docs/screenshots/02-esteira.png`
3. **BatchDocumentBinderDialog (formulário/modal)** — `docs/screenshots/03-batch-binder.png`
4. **Tracking marítimo com mapa** — `docs/screenshots/04-sea-tracking.png`
5. **Mobile view (Esteira)** — `docs/screenshots/05-mobile.png`

> Para gerar product shots polidos use a skill `product-shot` (frame macOS + gradiente).

---

## PARTE 10 — Código Importante

### 1. `src/App.tsx` (resumo de providers + roteamento)
```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60_000,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SeaThemeGuard />
        <InactivityGuard />
        <Routes>
          {/* ~120 rotas distribuídas por módulo */}
          <Route path="/fin/esteira" element={<EsteiraIndex />} />
          <Route path="/sea/tracking" element={<ContainerTracking />} />
          <Route path="/air/cct" element={<CCTDashboard />} />
          {/* ... */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
```

### 2. Padrão de invocação a edge function
```ts
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
  body: { action: "list_vouchers", filtros, page, pageSize },
});
if (error) throw error;
return data;
```

### 3. Hook customizado (`useVoucherInlineSave`)
```ts
export function useVoucherInlineSave(voucherId: string, onSaved?: () => void) {
  const [savingField, setSavingField] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null);

  const save = async (field: string, value: any) => {
    setSavingField(field);
    const { error } = await supabase.functions.invoke("mariadb-proxy", {
      body: { action: "update_voucher_field", voucher_id: voucherId, field, value },
    });
    if (error) toast({ variant: "destructive", title: "Erro ao salvar" });
    else { setSavedField(field); onSaved?.(); }
    setSavingField(null);
  };

  return { save, savingField, savedField };
}
```

### 4. Tipo principal — `Voucher` (excerto de `src/types/voucher.ts`)
```ts
export interface Voucher {
  id: string;
  numeroSpo: string;
  fornecedor: string;
  cnpjFornecedor: string;
  valor: number;
  moeda: string;
  vencimento: string;
  dataEmissaoDocumento: string;
  tipoDocumento: TipoDocumento;
  formaPagamento: FormaPagamento;
  etapaAtual: EtapaAtual;        // 'A_PROCESSAR'|'OPERACAO'|'FISCAL'|'FINANCEIRO'|'SUPERVISOR'|'PAGAMENTO'|...
  statusBaixa: StatusBaixa;
  statusFinanceiro: StatusFinanceiro;
  linhaDigitavel?: string;
  codigoBarras?: string;
  dadosBancarios?: DadosBancarios;
  anexos: Anexo[];
  logs: LogEntry[];
  isMaster: boolean;
  voucherMasterId?: string;
  filhos?: VoucherFilho[];
  // ... ~80 campos
}

export function validarProntoParaRobo(voucher: Voucher): ValidacaoProntoParaRobo { /* ... */ }
```

### 5. Edge function pattern (CORS + MariaDB)
```ts
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import mysql from "npm:mysql2/promise";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { action, ...body } = await req.json();
  const client = await mysql.createConnection({
    host: Deno.env.get("MARIADB_FIN_HOST")!,
    port: Number(Deno.env.get("MARIADB_FIN_PORT") ?? 3306),
    user: Deno.env.get("MARIADB_FIN_USER"),
    password: Deno.env.get("MARIADB_FIN_PASSWORD"),
    database: Deno.env.get("MARIADB_FIN_DATABASE"),
  });

  let result;
  switch (action) {
    case "list_vouchers": result = await listVouchers(client, body); break;
    // ... ~200 actions
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

### 6. `tailwind.config.ts` (resumo)
```ts
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // ... todos os tokens via CSS vars HSL
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)" },
      fontFamily: { sans: ["Montserrat", "system-ui", "sans-serif"] },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
```

---

## PARTE 11 — Observações

### Problemas encontrados durante o desenvolvimento
- **`mariadb-proxy` monolítico (~23k linhas, ~200 actions)** — dificulta manutenção; ideal seria split por domínio
- **Sem Supabase Auth** força RLS permissivo, contornado por validação de role no backend
- **Concorrência de cron jobs** (dedupe a cada 10min, status a cada 1min) exige idempotência rigorosa
- **DAI multi-linha** quebrou extração inicial (Claude concatenava 113 dígitos) — resolvido com prompt mais estrito + parser defensivo com slicing
- **Linha digitável de master** precisou ser extraída do boleto vinculado ao master, não herdada dos filhos
- **Timezone**: forçar UTC-3 (São Paulo) em tracking marítimo evitou displays incorretos
- **Conexão MariaDB** instável é o ponto de falha principal — UI nunca mostra banner de erro de DB (decisão de produto)

### Funcionalidades que gostaria de ter adicionado
- **Realtime nativo** (atualmente é polling via MariaDB; Supabase Realtime não se aplica)
- **Testes E2E** com Playwright para fluxos críticos de vouchers
- **Split do `mariadb-proxy`** em edge functions por domínio (`fin-proxy`, `sea-proxy`, etc)
- **Lazy loading sistemático** de rotas pesadas

### Pontos de melhoria
- Caching mais agressivo no edge (Redis/Upstash) para consultas marítimas frequentes
- Métricas operacionais centralizadas (Prometheus/Grafana)
- Documentação OpenAPI gerada automaticamente das actions do proxy

### Difícil de implementar
- **Lógica de transhipment cumulativo** (precisou acumular portos de eventos sucessivos sem perder histórico)
- **Identificação do robô EXCLUSIVAMENTE por nome de arquivo** (jamais conteúdo do PDF nem linha digitável)
- **Voucher master**: numeração SPO via `SUBSTRING_INDEX`, deduplicação por SPO+fornecedor+valor, gate de etapa requer anexo, hierarquia preservada após exclusão via `is_master` + `filhos_spos`
- **Regras CCT/SLA** com janelas de tempo excluindo finais de semana

---

## RESUMO RÁPIDO

**O que é Dachser?**
> Plataforma operacional logística multi-modal que centraliza tracking marítimo/aéreo, compliance CCT, esteira financeira de vouchers, demurrage, draft de exportação e análise documental com IA, integrada a múltiplos carriers e ao ERP legado da Dachser via MariaDB.

**Principal diferencial?**
> Camada de IA (Lovable AI Gateway) que extrai dados estruturados de boletos/DAIs/HBLs/manifests multi-formato, combinada com um único hub backend (`mariadb-proxy`) que orquestra ~200 actions sobre 5 pools MariaDB sem dependência de Supabase Auth.

**Maior desafio técnico?**
> Garantir consistência transacional do workflow de vouchers (master/filhos, lote, deduplicação, gates de etapa, extração de linha digitável) mantendo o MariaDB legado como fonte de verdade e tolerando indisponibilidades pontuais sem expor erros ao usuário final.

**O que mais gosta nele?**
> O modelo de memória persistente do agente (`mem://`) que documenta cada regra de negócio descoberta, evitando regressões; e a estratégia híbrida regex+LLM que mantém custo de IA baixo sem sacrificar acurácia em documentos brasileiros complexos (NCM, DAI, boleto de arrecadação).
