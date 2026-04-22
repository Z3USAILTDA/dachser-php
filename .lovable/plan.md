

## Objetivo
Habilitar a detecção automática de discrepância (peças divergentes / evento DIS) **especificamente para AWBs do prefixo 996 (Air Europa Cargo)**, que hoje não são contemplados pela query SQL atual de discrepância.

## Causa raiz
A detecção atual em `supabase/functions/fetch-tracking-aereo/index.ts` lê apenas `t_fato_aereo.timeline_json` (formato `{description, ...}`). Os eventos do 996 chegam via Firecrawl/uxtracking e são gravados em **`t_aereo_ws_firecrawl.timeline_json`** com outro formato (`{Description, Location, Timestamp, Carrier}`) e descrições próprias do uxtracking (ex.: "Delivery", "Departed", "Manifested", "10/2757" como `pieces/weight`). Consequência: o SQL nunca extrai peças nem detecta DIS para AWBs `996-*`, e o badge de "Discrepância" nunca acende, mesmo quando há divergência real.

Não vamos mexer na lógica atual (que funciona para os demais 32 prefixos). Faremos uma rotina dedicada e isolada para o prefixo `996`.

## Implementação (cirúrgica)

### 1. Edge Function `fetch-tracking-aereo/index.ts` — bloco adicional para prefixo 996
Logo após o bloco atual "Step 3d: Load discrepancy data" (linhas ~303-388), adicionar um **Step 3d-bis** que roda apenas para AWBs cujo `awb_number LIKE '996-%'`:

- Query nova contra `t_aereo_ws_firecrawl` (mesma janela de data já usada — `master_insert >= '2026-03-20'`):
  ```sql
  SELECT tda.awb_number AS awb, tda.hawb_number AS hawb, w.timeline_json
  FROM dados_dachser.t_dados_aereo tda
  INNER JOIN (
    SELECT awb, MAX(id) AS max_id
    FROM dados_dachser.t_aereo_ws_firecrawl
    GROUP BY awb
  ) latest ON latest.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci
  INNER JOIN dados_dachser.t_aereo_ws_firecrawl w ON w.id = latest.max_id
  WHERE tda.awb_number LIKE '996-%'
    AND (tda.master_insert >= '2026-03-20' OR tda.created_at >= '2026-03-20')
    AND JSON_VALID(w.timeline_json)
  ```

- **Parsing em JS** (não em SQL — o formato é mais ruidoso; mais simples e confiável tratar em TypeScript). Para cada timeline:
  - Iterar entradas `{Description, Location, Pieces, Weight, ...}`.
  - Extração de peças com regex tolerante à grafia uxtracking, incluindo:
    - `(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?)` (formato `10/2757`),
    - `(\d+)\s*PIECES?\b`, `PIECES?\s*[:=]\s*(\d+)`, `QTY\s*[:=]\s*(\d+)`,
    - campo nativo `Pieces`/`pieces`/`Quantity` se existir.
  - Excluir zero quando `Description` indicar offload nulo (`OFLD/OFFLOAD` + `0 PIECES`), idêntico à regra atual.
  - Detecção DIS: `Description` ou `Status` matching `/(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)/i`, mais palavras uxtracking equivalentes (`DISCREPANCY`, `IRREGULAR`, `MISSING`, `SHORT SHIPPED`, `OVERAGE`).
  - Agregar `min_pieces`/`max_pieces` por `(awb,hawb)`. Se `min !== max` → `pieces_discrepancy = true` e `baseline_pieces = min`. Se houver match DIS → `has_dis_event = true`.
- Mesclar o resultado no mesmo `discrepancyMap` já existente, com a chave `${awb}|${hawb}`. Os campos `pieces_discrepancy`, `baseline_pieces`, `has_dis_event` serão consumidos pelo front sem nenhuma alteração adicional (badge "Discrepância Peças" / "DIS - Discrepância" já reage a esses flags em `TrackingAereo.tsx` linhas 426-427, 519-520, 572-573, 917-925).

### 2. Edge Function `mariadb-proxy/index.ts` — modal de timeline (consistência)
A detecção em `get_awb_tracking_events` (linhas 8234-8242) já agrega `pecas` extraídas dos próprios eventos da timeline carregada de `t_aereo_ws_firecrawl`. Para o prefixo 996, precisamos garantir que `extractPiecesFromDesc` (linha ~7947) reconheça também o padrão `10/2757` (peças/peso) usado pelo uxtracking. Adicionar um regex extra:
- `/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/i` → grupo 1 = peças.
- Acrescentar reconhecimento de DIS no mesmo loop para já popular `discrepancy.field='dis'` quando aplicável (paridade com lista).

Sem isso, o card abre o modal mas a "barra amarela de discrepância" pode não aparecer.

### 3. Sem mudanças no front
Nenhuma alteração em `src/pages/air/TrackingAereo.tsx` ou `AwbTimelineModal.tsx`. O contrato da API (`pieces_discrepancy`, `baseline_pieces`, `has_dis_event`, `discrepancy`) permanece o mesmo; apenas passa a ser populado para AWBs `996-*`.

### 4. Memória persistente
Atualizar `mem://air/tracking/forced-discrepancy-locking-logic` com nota: "Prefixo 996 (Air Europa via uxtracking) usa rotina paralela em `fetch-tracking-aereo` lendo `t_aereo_ws_firecrawl` (formato Description/Location/Pieces) com regex `\d+/\d+(KGS|LBS|K)` para extração de peças. Mantém compatibilidade total com o restante."

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — + bloco Step 3d-bis (~80 linhas)
- `supabase/functions/mariadb-proxy/index.ts` — ajuste em `extractPiecesFromDesc` e detecção de DIS no agregador (~15 linhas)
- `mem://air/tracking/forced-discrepancy-locking-logic` — atualização de descrição

## Validação pós-deploy
1. `supabase--edge_function_logs fetch-tracking-aereo` → procurar `[996-DISC] Loaded N records`.
2. Abrir `/air/tracking-aereo`, filtrar por AWB `996-14370731` (já tem FORCED_DISCREPANCY) e checar badge.
3. Buscar outros AWBs `996-*` sem override e verificar se o badge acende quando há divergência real na timeline do uxtracking.
4. Abrir o modal de timeline do mesmo AWB e confirmar que o aviso amarelo de discrepância aparece.

## Riscos e mitigações
- **Custo SQL**: query extra rodando na lista — limitada por `LIKE '996-%'` (volume baixo, ~dezenas de AWBs ativos) e usa MAX(id) para um único snapshot por AWB.
- **Falsos positivos**: regex `10/2757` poderia capturar dígitos não-peças. Mitigação: só aceitar quando seguido de `KGS|LBS|K`, e sempre exigir ≥2 valores distintos para acusar discrepância.
- **Não afeta os outros 32 prefixos**: bloco totalmente isolado, mesclado em mapa pré-existente.

