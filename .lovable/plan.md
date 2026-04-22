

## Diagnóstico
A tabela `dados_dachser.t_aereo_ws_firecrawl` referenciada no Step 3d-bis **não existe**. Logs confirmam o erro recorrente: `Table 'dados_dachser.t_aereo_ws_firecrawl' doesn't exist`. A fonte correta é `t_fato_aereo` — a mesma já usada pelo Step 3d original.

## Causa raiz
O bloco original (Step 3d) já lê `t_fato_aereo.timeline_json`, mas seus regex de extração de peças não reconhecem o **formato uxtracking** usado pelos eventos do prefixo 996 (ex.: `"10/2757 KGS"` em vez de `"10 PIECES"`), nem palavras-chave de DIS específicas (`DISCREPANCY`, `IRREGULAR`, `MISSING`, `SHORT SHIPPED`, `OVERAGE`). Resultado: para AWBs `996-*`, a query nunca acha peças nem DIS, mesmo lendo a tabela certa.

## Correção (cirúrgica)

### 1. `supabase/functions/fetch-tracking-aereo/index.ts`
- **Remover completamente** o Step 3d-bis (~80 linhas) que aponta para `t_aereo_ws_firecrawl`. Isso elimina o warning recorrente nos logs.
- **Estender o Step 3d existente** (que já lê `t_fato_aereo`) para reconhecer também o formato uxtracking, **apenas** quando `awb_number LIKE '996-%'`:
  - Adicionar branch JS no parsing da `timeline_json` que, para AWBs 996, aplica regex extra:
    - `/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/i` → grupo 1 = peças (formato `10/2757 KGS`).
    - Aceita também campos nativos `Pieces`/`Quantity` se existirem no JSON do uxtracking.
  - Detecção DIS expandida para 996: `/(DISCREPANCY|IRREGULAR|MISSING|SHORT\s+SHIPPED|OVERAGE)/i` em `Description`/`description`/`Status`.
  - Mantém a regra de excluir `0 PIECES` em eventos OFLD/OFFLOAD.
- A agregação `min/max pieces` e o flag `pieces_discrepancy`/`baseline_pieces`/`has_dis_event` continuam idênticos — apenas passam a ser populados também para 996.

### 2. `supabase/functions/mariadb-proxy/index.ts`
- A função `extractPiecesFromDesc` (que já tem o regex `/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/i` adicionado no commit anterior) **não muda**. Ela já lê de `t_fato_aereo` no `get_awb_tracking_events`, então o modal de timeline continua funcionando.
- **Verificar** que `isDiscrepancyDesc` e a flag `discrepancy.field='dis'` (commit anterior) já estão em produção — sem mudanças adicionais.

### 3. Memória persistente
Atualizar `mem://air/tracking/forced-discrepancy-locking-logic`:
> "Prefixo 996 (Air Europa via uxtracking) usa a mesma fonte `t_fato_aereo.timeline_json` dos demais 32 prefixos, mas com **branch específico** no parser JS do Step 3d para reconhecer o formato uxtracking: regex `\d+/\d+(KGS|LBS|K)` para peças e palavras-chave estendidas (DISCREPANCY/IRREGULAR/MISSING/SHORT SHIPPED/OVERAGE) para DIS. **A tabela `t_aereo_ws_firecrawl` não existe** — qualquer referência a ela deve ser removida."

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — remoção do Step 3d-bis (~80 linhas) + branch 996 no Step 3d (~20 linhas).
- `mem://air/tracking/forced-discrepancy-locking-logic` — atualização de descrição.

## Validação pós-deploy
1. `supabase--edge_function_logs fetch-tracking-aereo` → confirmar que o warning `Table 'dados_dachser.t_aereo_ws_firecrawl' doesn't exist` desapareceu.
2. Confirmar log `Loaded N discrepancy records` com N maior que antes (incluindo 996).
3. Abrir `/air/tracking-aereo`, filtrar por AWB `996-*` com divergência real de peças → badge "Discrepância Peças" deve acender.
4. Abrir o modal de timeline de um AWB `996-*` e confirmar a barra amarela de discrepância quando aplicável.

## Riscos e mitigações
- **Falsos positivos com regex `10/2757`**: mitigado exigindo sufixo `KGS|LBS|K` e ≥2 valores distintos para acusar discrepância.
- **Regressão nos outros 32 prefixos**: branch 996 é condicionado por `awb.startsWith('996-')`. Os regex existentes para os demais prefixos permanecem intocados.

