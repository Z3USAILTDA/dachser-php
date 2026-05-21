## Reativar health-check da jsoncargo

**Arquivo:** `supabase/functions/demurrage-health-check/index.ts`

Trocar a flag local na seção "2. Check JSONCARGO API":

```ts
// antes
const JSONCARGO_DISABLED = true;
// depois
const JSONCARGO_DISABLED = false;
```

Resultado: o health-check passará a executar `GET https://api.jsoncargo.com/api/tracking/line/msc/container/MSCU1234567` com `x-api-key` a cada execução, retornando `healthy` para HTTP 200/404 (auth OK), `unhealthy` para outros códigos e `degraded` em timeout (10s).

**Fora de escopo:** demurrage-fetch-timelines continua desativada; nenhuma alteração em sea-tracking-cron, secrets, schema ou UI.