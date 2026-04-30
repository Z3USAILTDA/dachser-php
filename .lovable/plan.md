## Objetivo

Substituir o SQL de detecção de discrepância de peças usado pela página `/air/tracking-aereo` pela nova versão (corrigida) fornecida, que adiciona duas regras de "desconsideração":

1. **`ULTIMO_EVENTO_IGUAL_BASELINE`** — se o último evento com peças bate com o baseline, não é discrepância.
2. **`SOMA_FINAL_IGUAL_BASELINE`** — se a soma dos N últimos eventos (de trás pra frente) bate com o baseline (caso de split em múltiplos eventos), não é discrepância.

## Alvo cirúrgico

**Arquivo único**: `supabase/functions/fetch-tracking-aereo/index.ts`

**Substituir somente** o template literal `discrepancySql` (linhas 316–384). O restante do arquivo permanece intacto:

- Parsing das linhas (linhas 386–395) já lê `AWB`, `HAWB`, `BASELINE_PECAS`, `PIECES_DISCREPANCY`, `HAS_DIS_EVENT` — todos preservados na nova query.
- Os novos campos `ULTIMO_EVENTO_PECAS` e `STATUS_FINAL` retornados pela query serão simplesmente ignorados pelo parsing atual (sem necessidade de propagá-los ao front nesta entrega).
- O `WHERE` final da nova query (`status_final IN ('DIS_ULTIMO_EVENTO', 'DISCREPANCIA_REAL')`) já cumpre o mesmo papel do filtro atual: só retorna registros que devem virar entrada no `discrepancyMap`.

## Cuidado de escape

Dentro de template literal Deno, as barras invertidas dos regex `PIECE\(S\)` precisam ser duplicadas para `PIECE\\(S\\)` — exatamente como já está feito hoje nas linhas 346–347. A nova query será inserida com o mesmo padrão de escape.

## Comportamento resultante no front

Sem mudanças de tipos, props ou UI:

- AWBs onde **o último evento com peças retorna ao baseline** deixam de aparecer como críticos / "Discrepância Peças" no `/air/tracking-aereo` e na home (`Index.tsx`).
- AWBs cujo split de peças nos últimos eventos **soma exatamente o baseline** também deixam de ser marcados (caso clássico de "11 = 7 + 4" em dois eventos finais).
- O badge "DIS - Discrepância" passa a refletir somente o **último** evento da timeline (não mais qualquer evento histórico) — alinhado com o estado atual do AWB.
- AWBs como `045-21167731` (baseline 41, último 99) permanecem `DISCREPANCIA_REAL` — comportamento esperado.

## Itens NÃO alterados

- `fetch-status-aereo/index.ts` (fluxo separado, fora do escopo).
- `MANUAL_OVERRIDES`, `force_discrepancy`, `disable_discrepancy` — preservados.
- Lógica do prefixo 996 (Air Europa) em `Step 3d-bis` — preservada.
- Tipos no front (`pieces_discrepancy`, `has_dis_event`, `baseline_pieces`) — inalterados.
- Componentes React, badges, contagens de Críticos/Alerta — inalterados (recebem o mesmo formato, só com menos falsos positivos).

## Validação após deploy

1. Logs do edge function: `Loaded N discrepancy records` deve aparecer sem erro.
2. `/air/tracking-aereo`: contagem de "Críticos" tende a cair (menos falsos positivos).
3. AWB `045-21167731` (do anexo) deve continuar listado como discrepância de peças.
4. AWBs onde último evento volta ao baseline ou onde soma final bate com baseline devem deixar de aparecer como críticos.
