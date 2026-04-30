## Objetivo

Eliminar todo uso dos secrets genéricos `MARIADB_USER` / `MARIADB_PASSWORD` / `MARIADB_HOST` / `MARIADB_DATABASE` / `MARIADB_PORT` (que historicamente apontavam para `root`) substituindo o fallback por `MARIADB_OPS_*`, que possui acesso pleno a `dados_dachser`, `ai_agente` e `ai_dachser` (e com 500 conexões simultâneas).

## Mudança a aplicar

Em cada arquivo, trocar o segundo operando do `||`:

```diff
- Deno.env.get('MARIADB_AIR_USER')     || Deno.env.get('MARIADB_USER')
+ Deno.env.get('MARIADB_AIR_USER')     || Deno.env.get('MARIADB_OPS_USER')

- Deno.env.get('MARIADB_AIR_PASSWORD') || Deno.env.get('MARIADB_PASSWORD')
+ Deno.env.get('MARIADB_AIR_PASSWORD') || Deno.env.get('MARIADB_OPS_PASSWORD')

- Deno.env.get('MARIADB_AIR_HOST')     || Deno.env.get('MARIADB_HOST')
+ Deno.env.get('MARIADB_AIR_HOST')     || Deno.env.get('MARIADB_OPS_HOST')

- Deno.env.get('MARIADB_AIR_DATABASE') || Deno.env.get('MARIADB_DATABASE')
+ Deno.env.get('MARIADB_AIR_DATABASE') || Deno.env.get('MARIADB_OPS_DATABASE')

- Deno.env.get('MARIADB_AIR_PORT')     || Deno.env.get('MARIADB_PORT')
+ Deno.env.get('MARIADB_AIR_PORT')     || Deno.env.get('MARIADB_OPS_PORT')
```

A mesma regra vale para o prefixo `MARIADB_SEA_*` (e qualquer outro pool nas mesmas linhas).
Mudança puramente cirúrgica — apenas substituição de string nas chamadas `Deno.env.get(...)`. Nenhum refactor, nenhuma nova função, nenhuma alteração de lógica.

## Arquivos afetados (35)

**Pool AIR (17):**
- `add-awb-to-status`
- `air-dep-transition-alert`
- `air-scan-finalized`
- `air-tracking-failed-alert`
- `arr-to-cct-sync`
- `fetch-air-imports`
- `fetch-awbs`
- `fetch-awbs-dep`
- `fetch-awbs-for-retrack`
- `fetch-master-dados-stats`
- `fetch-status-aereo`
- `fetch-tracking-aereo`
- `firecrawl-monitor-alert`
- `firecrawl-monitor-stats`
- `manage-processing-queue`
- `mariadb-dep-sync`
- `mariadb-sync`

**Pool SEA (18):**
- `client-freetime-crud`
- `demurrage-auto-invoice`
- `demurrage-mariadb-sync`
- `demurrage-recalc`
- `demurrage-send-alert`
- `draft-fetch-mariadb`
- `draft-fetch-tracking-status`
- `draft-save-tracking`
- `fetch-sea-master-dados-stats`
- `hapag-batch-discover`
- `sea-analysis-watchdog`
- `sea-carrier-fallback`
- `sea-msc-batch-update`
- `sea-poll-analysis`
- `sea-reextract-metadata`
- `sea-submit-analysis`
- `sea-tracking-transship-backfill`
- `sea-upload-base-file`

## Validação após implementação

1. `rg "Deno\.env\.get\(['\"]MARIADB_(USER|PASSWORD|HOST|DATABASE|PORT)['\"]\)" supabase/functions/` deve retornar **zero** resultados.
2. Build do projeto continua passando (typecheck automático).
3. Após o deploy, você pode (opcionalmente) **deletar os secrets** `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_HOST`, `MARIADB_DATABASE`, `MARIADB_PORT` do Lovable Cloud — não estarão mais sendo lidos por nada.

## Fora de escopo

- Nenhuma mudança de lógica, schema, RLS, ou comportamento.
- `mariadb-proxy`, `mariadb-connect`, `voucher-mariadb-sync`, `db-status-report`, `db-critical-alert` e `olimpo-proxy` já usam exclusivamente secrets nomeados (`MARIADB_OPS_*`, `MARIADB_FIN_*`) — **não serão tocados**.
- Não vou alterar nenhum cron job; eles apenas chamam edge functions via HTTP.

Pode aprovar que aplico as 35 substituições em paralelo.
