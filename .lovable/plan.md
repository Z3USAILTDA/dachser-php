## Diagnóstico (confirmado nos logs)

O deploy funcionou e a query está rodando — os logs mostram:
```
[DISC-BG] Cache refreshed: 185 records (+35 enriched from prefix 996)
```

**Mas em todo poll seguinte ainda aparece `[DISC] Cold start — empty discrepancy this poll`**.

Motivo: o cache (`discrepancyCache` e `routeCache`) é uma variável **em memória do isolate Deno**. O Supabase Edge Runtime distribui requisições entre múltiplos isolates e os recicla com frequência. Cada poll (de 30 em 30s) cai num isolate diferente e/ou frio, então o cache populado nunca é reaproveitado. A query roda em background, popula um isolate que ninguém mais consulta, e o ciclo recomeça.

Resultado prático: `pieces_discrepancy` chega sempre `false` no front, mesmo havendo 185 AWBs com discrepância no DB.

## Correção

Persistir o cache de discrepância (e o de rota) numa tabela do Supabase, compartilhada entre todos os isolates.

### 1. Migration

Criar tabela `public.air_tracking_cache`:
```sql
CREATE TABLE public.air_tracking_cache (
  cache_key text PRIMARY KEY,             -- 'discrepancy' | 'route'
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_tracking_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_tracking_cache TO anon;
GRANT ALL ON public.air_tracking_cache TO service_role;

ALTER TABLE public.air_tracking_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can manage air_tracking_cache"
  ON public.air_tracking_cache FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);
```

### 2. `supabase/functions/fetch-tracking-aereo/index.ts`

- No topo, criar um client Supabase com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Substituir a lógica de cache em memória dos blocos `[DISC]` e `[ROUTE]` por:
  - **Leitura**: no início, fazer um único `SELECT data, updated_at FROM air_tracking_cache WHERE cache_key IN ('discrepancy','route')` para popular `discrepancyMap` / `routeMap`. Calcular `stale = age > TTL`.
  - **Escrita**: no final do bg task, em vez de `discrepancyCache = { … }`, fazer `upsert` em `air_tracking_cache` (`cache_key='discrepancy'`, `data=fresh`, `updated_at=now()`).
  - Manter a flag `allowBackgroundRefresh = true` e o disparo via `EdgeRuntime.waitUntil`.
- Manter `DISCREPANCY_CACHE_TTL_MS = 5 * 60_000` (mesmo TTL) — agora compartilhado entre isolates, ele realmente vai durar 5 min.
- Manter o cache em memória como fast path secundário (opcional): se o módulo já tem em memória e é fresh, usa direto; senão lê da tabela.

### 3. Sem mudança no front

O contrato da resposta (`pieces_discrepancy`, `has_dis_event`, `baseline_pieces`) permanece igual; só o backend passa a ter dados reais.

## Verificação

- Após o primeiro poll que rodar a query (≈10s depois), todos os polls subsequentes (em qualquer isolate) devem ler a linha `discrepancy` da tabela e popular `discrepancyMap` com 185 registros.
- Na tela `tracking-aereo`, o card "Críticos" e os badges de discrepância voltam a aparecer.
- Nos logs, esperar ver `[DISC] Loaded N records from persistent cache` ao invés do `Cold start` repetido.
