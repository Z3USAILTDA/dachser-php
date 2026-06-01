## Diagnóstico

A query de discrepância está escrita corretamente, mas **nunca é executada**. Em `supabase/functions/fetch-tracking-aereo/index.ts`:

- Linha 368: `const allowBackgroundRefresh = false;` — flag hardcoded em `false`.
- Linhas 369 e 737: tanto o refresh em background da **discrepância** quanto do **routeMap** estão gated por essa flag, então o bloco `EdgeRuntime.waitUntil(discBgTask)` **nunca roda**.
- O cache em memória (`discrepancyCache`, `routeCache`) por isso nunca é populado, e os logs confirmam em todo poll:
  ```
  [DISC] Cold start — empty discrepancy this poll, will populate in background
  [ROUTE] Cold start — routeMap empty this poll, will populate in background
  ```
- `discrepancyMap` sempre fica `{}`, então `pieces_discrepancy`, `has_dis_event` e `baseline_pieces` saem sempre `false/null` para todos os AWBs.

Foi desativado em algum ponto para evitar `CPU Time exceeded` (visto também no log atual), mas isso quebrou o cálculo de discrepância na tela.

## Correção

Arquivo único: `supabase/functions/fetch-tracking-aereo/index.ts`

1. **Religar o refresh em background** (linha 368): trocar
   ```ts
   const allowBackgroundRefresh = false;
   ```
   por
   ```ts
   const allowBackgroundRefresh = true;
   ```
   O refresh roda via `EdgeRuntime.waitUntil(...)` **após** a resposta ser enviada, então não bloqueia o request e o usuário recebe os dados rápido; o cache em memória é preenchido para os polls seguintes.

2. **Aumentar o TTL dos caches** (linhas 11 e 14) de 60s para 5 minutos, para limitar a frequência da query pesada e evitar o `CPU Time exceeded` que motivou a desativação original:
   ```ts
   const DISCREPANCY_CACHE_TTL_MS = 5 * 60_000;
   const ROUTE_CACHE_TTL_MS = 5 * 60_000;
   ```
   - O front segue chamando a cada 30s, mas o refresh pesado só dispara uma vez a cada 5 min (ou quando o isolate é reciclado e o cache zera). Nos demais polls usa cache stale, o que mantém os dados frescos o bastante para discrepância (que muda em escala de horas/dias, não segundos).

3. **Sem mudanças** na query SQL nem no front — a query já está correta; ela só precisa voltar a rodar.

## Verificação após deploy

- Conferir nos logs de `fetch-tracking-aereo` a presença de `[DISC-BG] Cache refreshed: N records` e desaparecimento do `Cold start — empty discrepancy` em polls subsequentes.
- Na tela `tracking-aereo`, processos com divergência de peças voltam a aparecer com badge de discrepância / card "Críticos" populado.
