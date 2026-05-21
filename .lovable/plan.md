## Diagnóstico dos 3 pontos

### 1. Nenhum processo mostra histórico
Bug de parsing no frontend. A edge function `olimpo-proxy` action `get_tracking_history` retorna `{ success, data: history, stats }`, mas `fetchMblEvents` lê `result.history` (que não existe). Resultado: `mblEvents` sempre vazio → botão `+` nunca aparece e nada de `event_datetime` chega na linha agregada.

Arquivo: `src/pages/ContainerTracking.tsx` linha 993.

### 2. Data/Hora mostra a "processada" em vez do evento
Consequência direta do bug #1. A linha agregada faz:
```
event_datetime mais recente  ||  fallback mbl.last_check
```
Como `mblEvents` está sempre vazio, sempre cai no `last_check` (hora em que nosso sync processou). Corrigindo o parse, passa a usar `h.event_datetime` (a hora real do evento).

### 3. Processos em `t_tracking_sea_history` que não aparecem na tela
A query `get_sea_tracking` parte de `t_tracking_sea` e aplica filtros que escondem MBLs que ainda têm histórico:
- `WHERE ts.active = 1` — manter (marcação canônica do sistema).
- `HAVING NOT (… DELIVERED/DLV …)` — esconde entregues imediatamente, contradiz a regra de retenção pós-entrega.
- `HAVING NOT (… GOD/GATE_OUT_FULL/EMPTY_RETURNED/EMPTY_RECEIVED_AT_CY … AND last_check < NOW()-24h)` — **manter** (concluídos somem após 24 h).
- `LIMIT 500` — **remover**.

## Mudanças

Tudo cirúrgico, sem refator.

### A) `src/pages/ContainerTracking.tsx` (linha 993)
Trocar:
```ts
setMblEvents(Array.isArray(result?.history) ? result.history : []);
```
por:
```ts
setMblEvents(Array.isArray(result?.data) ? result.data : []);
```
Resolve os pontos **#1** (histórico chega e o botão `+` abre as linhas) e **#2** (Data/Hora da linha agregada passa a vir de `event_datetime`).

### B) `supabase/functions/olimpo-proxy/index.ts` — action `get_sea_tracking`
1. Remover a cláusula `HAVING NOT (… DELIVERED/DLV …)` (linhas ~2303-2306). DELIVERED continua coberto pela cláusula seguinte (`last_event LIKE '%DELIVERED%'`) com a regra de 24 h.
2. **Manter** intacta a cláusula `HAVING NOT (… GOD/GATE_OUT_FULL/EMPTY_RETURNED/EMPTY_RECEIVED_AT_CY OR last_event LIKE '%DELIVERED%/%GATE OUT%/%EMPTY RETURNED%' … AND last_check < NOW()-24h)`. Esta é a regra "concluídos somem após 24 h".
3. **Remover o `LIMIT 500`** da query (linha ~2321), sem substituir por outro cap.

Nenhuma outra alteração de coluna, CTE, agregação ou ordenação.

### C) Não muda
- Estrutura da sub-tabela expandida (linha agregada + `+` para histórico).
- Coluna `Última Atualização` continua mostrando `last_check`.
- `fetchMblContainers`, `VesselFinderMap`, edge functions de tracking/fallback, paginação, filtros, modais.
- `WHERE ts.active = 1`.

## Critério de aceite

- Ao expandir qualquer MBL com eventos em `t_tracking_sea_history`, o botão `+` aparece e abre as linhas históricas com `event_datetime`.
- A coluna `Data/Hora` da linha agregada mostra o `event_datetime` do evento mais recente (não mais o `last_check`).
- Processos concluídos (DELIVERED / GATE OUT / EMPTY RETURNED / GOD / EMPTY_RECEIVED_AT_CY) **ficam visíveis por 24 h após a conclusão** e **somem após 24 h**.
- A listagem principal não tem mais teto de 500 MBLs.
