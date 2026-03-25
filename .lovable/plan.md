

## Plano: Tela de Gerenciamento de Crons

### Contexto
Existem 9 cron jobs ativos no `cron.job` do pg_cron:
- `air-dep-transition-alert` (*/30 * * * *)
- `air-tracking-failed-alert` (*/10 * * * *)
- `anthropic-balance-check-daily` (0 12 * * *)
- `db-critical-alert-hourly` (0 9-23,0-1 * * *)
- `db-status-report-hourly` (0 9-23,0-1 * * *)
- `firecrawl-monitor-alert-every-30min` (*/30 * * * *)
- `leadcomex-sync-every-minute` (* * * * *)
- `sea-analysis-watchdog-check` (*/5 * * * *)
- `sea-tracking-weekly` (0 2 * * 1,3)

### Arquitetura

**1. Edge Function `cron-manager/index.ts`** — Backend seguro para operações no pg_cron
- `GET ?action=list` → Lista todos os jobs de `cron.job` (jobid, jobname, schedule, active, command)
- `POST ?action=update_schedule` → Executa `cron.alter_job(jobid, schedule := '...')` via `SUPABASE_DB_URL` (conexão direta ao Postgres)
- `POST ?action=toggle_active` → Ativa/desativa job via `cron.alter_job(jobid, active := true/false)`
- `POST ?action=run_now` → Executa o edge function alvo manualmente (extrai URL do command)
- Validação: aceita apenas schedules no formato cron válido
- Usa `SUPABASE_DB_URL` para conexão direta ao Postgres (já existe como secret)

**2. Página `src/pages/admin/CronManager.tsx`** — UI de gerenciamento
- Tabela com colunas: Nome, Schedule (cron expression), Status (ativo/inativo), Função Alvo, Ações
- Para cada job:
  - Badge verde/vermelho indicando ativo/inativo
  - Botão toggle para ativar/desativar
  - Botão editar schedule (abre dialog com input de cron expression + preview legível)
  - Botão "Executar Agora" para trigger manual
- Descrição legível do cron (ex: "A cada 10 minutos", "Diariamente às 09:00 BRT")
- Acesso restrito: verificação `isZ3usAdmin()` no carregamento

**3. Integração no menu Dashboard**
- Adicionar "Gerenciamento de Crons" dentro de ADMIN → Z3US → Monitoramento (linha 258-262)
- Rota: `/admin/cron-manager`

**4. Rota no `App.tsx`**
- Adicionar `<Route path="/admin/cron-manager" element={<CronManager />} />`

### Detalhes técnicos

A edge function usará a lib `postgres` do Deno para conectar diretamente ao banco via `SUPABASE_DB_URL` e executar:
```sql
-- Listar
SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobname;

-- Alterar schedule
SELECT cron.alter_job($jobid, schedule := '$new_schedule');

-- Toggle ativo
SELECT cron.alter_job($jobid, active := $active);
```

O dialog de edição terá presets comuns (a cada 1min, 5min, 10min, 30min, 1h, diário, semanal) além do input livre.

### Arquivos criados/editados
- **Criar**: `supabase/functions/cron-manager/index.ts`
- **Criar**: `src/pages/admin/CronManager.tsx`
- **Editar**: `src/pages/Dashboard.tsx` (adicionar item no menu Z3US → Monitoramento)
- **Editar**: `src/App.tsx` (adicionar rota)

