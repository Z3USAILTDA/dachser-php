## Causa raiz

A função `sea-tracking-cron` — que orquestra `olimpo-sync` + enriquecimento via JSONCargo (`sea_seed_smart`) + `enrich_missing_coords` — **não tem mais agendamento no `pg_cron`**. Listei `cron.job` e não há nenhum job SEA/tracking/olimpo. `cron.job_run_details` e os logs da edge function também estão vazios. Por isso o monitoramento marítimo está ~1 mês desatualizado, mesmo com a flag interna `JSONCARGO_DISABLED = false` e o secret `JSONCARGO_API_KEY` presentes.

## Escopo do que vou alterar

Apenas 3 ações, todas cirúrgicas. Nada na UI do `/sea/tracking`, nada nos demais módulos.

### 1. Recriar o cron no schedule original
Via `supabase--insert` (não migration, pois carrega URL + anon key específicos do projeto):

```sql
select cron.schedule(
  'sea-tracking-cron-mon-wed-02utc',
  '0 2 * * 1,3',
  $$
  select net.http_post(
    url := 'https://finktakbjcfmurqeiubz.supabase.co/functions/v1/sea-tracking-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Confirmo extensões `pg_cron` e `pg_net` ativas antes (se faltar alguma, habilito).

### 2. Catch-up imediato
Após criar o cron, invoco `sea-tracking-cron` uma vez via `supabase--curl_edge_functions` (POST `/sea-tracking-cron`) e confirmo no retorno:
- `olimpo_sync` ok
- `sea_seed_batches[]` com `api_calls > 0` (JSONCargo respondendo)
- `errors: []`

Se a primeira execução estourar limite/erro, registro o motivo e seguimos sem reexecutar — o próximo ciclo agendado resolve o restante.

### 3. Reativar `demurrage-import-jsoncargo`
Editar `supabase/functions/demurrage-import-jsoncargo/index.ts`:

```ts
// antes
const JSONCARGO_DISABLED = true;
// depois
const JSONCARGO_DISABLED = false;
```

Sem outras mudanças no arquivo. Redeploy só dessa função.

## Validações finais

- `cron.job` mostra `sea-tracking-cron-mon-wed-02utc` `active = true`.
- Resposta da invocação manual com `duration_ms`, batches e zero erros graves.
- Em `/sea/tracking`, processos ativos voltam a ter `last_check` recente.
- `demurrage-import-jsoncargo` aceita import de MBL novamente (teste só se você pedir; senão fica disponível).

## Rollback

- Cron: `select cron.unschedule('sea-tracking-cron-mon-wed-02utc');`
- Flag demurrage: voltar para `const JSONCARGO_DISABLED = true;` e redeploy.

## Fora de escopo (não toco)

Régua de Cobrança, Disputas, Olimpo, view `v_fin_regua_contas_receber`, qualquer função `*_cr`, UI do tracking marítimo, lógica de status/timeline, retention rules, secrets.
