

# Monitor Firecrawl — Visível apenas para admins Z3US

## Resumo

Criar a tela de monitoramento da `t_aereo_ws_firecrawl` e a edge function de alerta por e-mail, com acesso restrito exclusivamente a administradores Z3US (não DACHSER).

## Arquivos a criar

### 1. `supabase/functions/firecrawl-monitor-stats/index.ts`
Edge function que conecta ao MariaDB (`dados_dachser`) e retorna:
- `MAX(scraped_at)` como `lastUpdate`
- `COUNT(*)` como `totalRecords`
- Contagem de registros nas últimas 24h
- AWBs distintas nas últimas 24h
- `TIMESTAMPDIFF(MINUTE, MAX(scraped_at), NOW())` como `minutesSinceUpdate`
- Status derivado (Saudável ≤5min, Atenção 5-60min, Crítico >60min)

Padrão: `connectWithRetry` igual ao `fetch-database-stats`.

### 2. `supabase/functions/firecrawl-monitor-alert/index.ts`
Edge function de alerta por e-mail:
- Threshold: **120 minutos** sem atualização em `scraped_at`
- Destinatários: `devs@z3us.ai`, `rodrigo@z3us.ai`, `larissa@z3us.ai`
- Deduplicação via `ai_agente.t_firecrawl_monitor_alerts` (padrão `recovered_at` do `db-critical-alert`)
- E-mail via Resend com template HTML dark (padrão Z3US)
- Suporte a `test` e `force` flags

### 3. `src/pages/admin/FirecrawlMonitor.tsx`
Página simplificada inspirada no `DatabaseMonitor.tsx` para uma única tabela:
- Card com indicador de saúde, último `scraped_at`, total de registros, inserções 24h, AWBs únicas
- KPI summary no topo
- Botão "Atualizar"
- **Controle de acesso**: verifica `is_admin === 1` **e** que o username NÃO está na lista `DACHSER_ADMIN_USERS` (mesma lógica do `z3usOnly` no Dashboard). Se não for Z3US admin, redireciona para `/dashboard`.

## Arquivos a modificar

### 4. `src/App.tsx`
- Importar `FirecrawlMonitor`
- Adicionar rota: `/admin/firecrawl-monitor`

### 5. `src/pages/Dashboard.tsx`
- Adicionar item no menu ADMIN com `z3usOnly: true`:
```
{ label: "Monitor Firecrawl", href: "/admin/firecrawl-monitor", z3usOnly: true }
```
Isso garante que só aparece para admins Z3US (excluindo `ana.tozzo`, `danilo.pedroso`, `teste.test3`).

## Controle de acesso

- **Dashboard menu**: flag `z3usOnly: true` filtra via `getAdminUserType()` — só `Z3US` vê o item
- **Página**: validação dupla no `useEffect` — `is_admin === 1` + username não está em `DACHSER_ADMIN_USERS`
- **Edge functions**: sem restrição de acesso (dados internos, não sensíveis a usuários finais)

