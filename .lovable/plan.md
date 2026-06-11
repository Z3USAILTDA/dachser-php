# Ajustes na tela /air/tracking-aereo

Quatro correções pontuais para os AWBs reportados, mantendo o padrão de "manual override" já usado no módulo.

## 1. Filtrar eventos com data no futuro (DEP futuro)

**Sintoma:** `724-20906826` e `724-88485423` exibindo DEP como último evento, com data no futuro. A `pickTopByIATA` elege "o mais recente por data", e datas futuras vencem qualquer evento operacional real.

**Correção (genérica):** em `supabase/functions/fetch-tracking-aereo/index.ts`, dentro de `pickTopByIATA`, depois do filtro de BKD, adicionar um filtro para descartar slots cuja `parseSlotDateMs(date)` seja maior que `Date.now()` (com tolerância de algumas horas para fuso). Só descarta se existirem slots não-futuros; se TODOS forem futuros, mantém a lógica atual (não quebra casos onde a carga é nova e só tem BKD/FOH futuro).

Isso resolve `724-20906826` e `724-88485423` sem precisar override manual e protege qualquer outro AWB com carrier publicando DEP planejado.

## 2. Suprimir discrepância inexistente em 724-88485423

Adicionar `'724-88485423'` ao set `SUPPRESSED_DISCREPANCY_AWBS` em `supabase/functions/fetch-tracking-aereo/index.ts` (linha ~1382) — mesmo padrão já usado para `047-32916380` e `047-33946636`.

Não é necessário mexer em `mariadb-proxy` (timeline modal) porque o backend já calcula discrepância via `air_master_discrepancy_list`, que é uma fonte separada; basta o filtro do fato.

## 3. Forçar ARR - DESTINO para 016-65420832 e 016-56147991

Adicionar os dois AWBs ao set `FORCED_ARR_DESTINO_AWBS` em `supabase/functions/fetch-tracking-aereo/index.ts` (linha 1385), junto a `016-83237055` e `369-92002945`. O override já força `finalCode = "ARR - DESTINO"` para todos os HAWBs do master, então cobre o pedido "todos os hawb" do `016-65420832`.

## Detalhes técnicos

Arquivos editados:
- `supabase/functions/fetch-tracking-aereo/index.ts`
  - `pickTopByIATA`: adicionar filtro `nonFuture = slots.filter(s => parseSlotDateMs(s.date) <= Date.now() + 6*3600*1000)` e usar quando `nonFuture.length > 0`.
  - `SUPPRESSED_DISCREPANCY_AWBS`: incluir `'724-88485423'`.
  - `FORCED_ARR_DESTINO_AWBS`: incluir `'016-65420832'` e `'016-56147991'`.

Deploy do edge function ao final.

## Fora de escopo

- Mudanças no frontend `TrackingAereo.tsx` (a lógica problemática é toda backend).
- Alteração no modal de timeline (`get_awb_tracking_events`) — a timeline em si continua mostrando eventos como vieram do carrier; o que muda é a eleição do "último evento" do header.
- Reprocessamento/limpeza histórica de `t_aereo_ws_firecrawl`.
