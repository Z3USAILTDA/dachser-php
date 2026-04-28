# Relatório Reorganizado por Módulo e Tela

## Objetivo

Reestruturar o relatório de conexões ao banco de dados, agrupando as informações por **Módulo → Tela → Edge Functions → Tabelas**, ao invés de agrupar por banco. Itens que não pertencem a nenhuma tela específica vão para uma seção **"Sistema / Background / Não-mapeado"**.

## Nova estrutura do relatório

### 1. Sumário Executivo
- Total de módulos, telas, edge functions e tabelas envolvidas
- Top 5 telas com maior dependência de banco
- Telas com risco alto (funções sem `close()`, polling agressivo, múltiplos bancos)

### 2. Mapa por Módulo

Cada módulo terá seu próprio capítulo. Identificados a partir de `src/pages/`:

- **AIR** — `src/pages/air/*`, `AWBList`, `ManualTracking`, `CadastroNova`, `ManualAwbList`, `ManualCheckAwb`, `ManualStatusAereo`
- **SEA / Maritime** — `src/pages/sea/*`, `SeaAnalysis`, `CadastroHbl`, `CadastroManifest`, `LocalCharges`, `InvoicesDraftHbl`, `SubmeterHblMbl`, `SubmeterManifestHbl`, `DraftExportacao`
- **Demurrage** — `src/pages/demurrage/*` (Monitor, FreeTimes, Rates, PreInvoicing, CarrierCosts, Disputes, Clients, Analytics, Settings)
- **CCT** — `src/pages/cct/*` (Dashboard, Analytics, ConsoleTecnico, Excecoes, LeadcomexLogs, ProcessoTimeline, RegrasNotificacao)
- **CHB** — `src/pages/ChbAnalises`, `ConferenciaChb`, `chb/ManualChb`
- **Análise Documental** — `AnaliseDocumental`, `AnaliseDocumentalComparar`, `AnaliseDocumentalDetalhes`
- **Esteira / Vouchers** — `src/pages/esteira/*` (Dashboard, Manual, Reports, UserManagement, VoucherDetails, VoucherRules, ComprovanteRobot, EmailPreview, AccrualManagement)
- **Financeiro / Régua** — `ReguaCobranca`, `AlteracoesFee`, `fin/OthelloImport`, `fin/ManualFinanceiro`
- **Olimpo** — `olimpo/OlimpoIndex`, `OlimpoFaturamento`
- **Admin** — `admin/*` (UserManagement, CronManager, DatabaseMonitor, FirecrawlMonitor, UploadMaster, ApiKeyTest, ManualAdmin)
- **Auth / Conta** — `Login`, `Register`, `ForgotPassword`, `ResetPassword`, `VerifyResetCode`, `ChangePassword`, `SupervisorConfirmacao`
- **Geral** — `Dashboard`, `Logs`, `SystemLogs`, `MetricsUsage`, `NotFound`

### 3. Para cada Tela
Bloco padronizado:

```text
Tela: src/pages/sea/DraftExportacao.tsx
Rota: /sea/draft-exportacao
Hooks usados: useDraftData, useSeaRegrasNotificacao
Edge functions invocadas:
  - draft-sync           → MariaDB dados_dachser  → t_draft_export, t_tracking_sea
  - hapag-tracking       → MariaDB dados_dachser  → t_tracking_sea, t_sea_master
  - mariadb-proxy        → Charges               → fee_history, vendor_rates
Tabelas Postgres (via supabase client): (nenhuma)
Storage buckets: (nenhum)
Risco: MÉDIO — polling 60s + 3 funções concorrentes
```

### 4. Seção "Sistema / Background / Não-mapeado"
Para itens sem tela direta:
- **Cron jobs** (sync periódicos, retracks, accruals, voucher-cron)
- **Webhooks** (auth-handler, email handlers, supervisor approvals externos)
- **Edge functions internas** chamadas só por outras funções (mariadb-proxy, ai-helpers)
- **Triggers Postgres** e funções `security definer`
- **Buckets de storage** (`voucher-anexos`, `hawb-documents`)
- **Edge functions órfãs** (sem invocação detectada no frontend)

### 5. Matriz de Cobertura (anexo XLSX)
Aba dedicada `Modulo-Tela-Function-Tabela` para filtragem livre, colunas:
`modulo | tela_path | rota | hook | edge_function | banco | tabelas | proxy? | risco`

### 6. Riscos por Módulo
Resumo de risco agregado por módulo (quantas funções high-risk, polling, conexões diretas vs proxy).

## Como será gerado (técnico)

1. **Reaproveitar o scan já feito** das ~144 edge functions (resultado em memória do passo anterior).
2. **Novo scanner frontend** (`/tmp/scan-pages.mjs`):
   - Para cada arquivo em `src/pages/**/*.tsx`:
     - Extrair imports de hooks (`from "@/hooks/..."`)
     - Extrair `supabase.functions.invoke('xxx')` diretos
     - Extrair `supabase.from('xxx')` diretos
     - Extrair `supabase.storage.from('xxx')`
   - Para cada hook em `src/hooks/*.ts`:
     - Mesma extração — para resolver indiretamente quais funções a tela chama
3. **Resolver rotas** lendo `src/App.tsx` (mapeamento path → componente).
4. **Inferir módulo** pelo prefixo do path (`pages/sea/` → SEA, `pages/cct/` → CCT, etc.).
5. **Cruzar** tela → hook → edge function → banco/tabelas (do scan anterior).
6. **Identificar não-mapeados**: edge functions que não aparecem em nenhuma tela/hook → vão para Seção 4.
7. **Gerar artefatos**:
   - `/mnt/documents/dachser-db-by-module-v2.md`
   - `/mnt/documents/dachser-db-by-module-v2.pdf` (reportlab, com TOC por módulo)
   - `/mnt/documents/dachser-db-by-module-v2.xlsx` (abas: `Resumo`, `Por-Modulo`, `Por-Tela`, `Matriz`, `Sistema-Background`, `Riscos`)
8. **QA**: converter PDF para imagens e revisar todas as páginas; validar XLSX com `recalculate_formulas.py`.

Sem alterações no código da aplicação ou no banco — apenas leitura e geração de artefatos em `/mnt/documents/`.
