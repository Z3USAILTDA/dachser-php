

## Plano: Filtrar CCT para mostrar apenas AWBs com status específicos do tracking

### Problema

O CCT mostra todos os processos de `t_cct_hawb_api_atual`. O usuário quer que só apareçam processos cujo status no tracking aéreo (`t_fato_aereo.last_status_code`) seja um dos seguintes: DEP, TFD, TRF, TRM, OFS, RCT, RDP, ARR, RCF, NFD, AWD, PDD, CUS, CCD, DDL.

### Abordagem

Adicionar uma CTE `tracking_status` na query unificada do `get_cct_shipments` que busca `last_status_code` de `t_fato_aereo`, vinculando via HAWB (usando `json_contains` no `hawbs_json`, mesma lógica do `fetch-tracking-aereo`). Depois, fazer INNER JOIN (em vez de LEFT JOIN) para que apenas processos com status permitido sejam retornados.

### Alterações

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`** — seção `get_cct_shipments`

1. Adicionar CTE `tracking_status`:
```sql
tracking_status AS (
  SELECT
    tdaf.awb,
    tdaf.last_status_code,
    tdaf.hawbs_json
  FROM dados_dachser.t_fato_aereo tdaf
  WHERE tdaf.last_status_code IN ('DEP','TFD','TRF','TRM','OFS','RCT','RDP','ARR','RCF','NFD','AWD','PDD','CUS','CCD','DDL')
    AND json_valid(tdaf.hawbs_json)
)
```

2. No SELECT final, adicionar JOIN com `tracking_status`:
```sql
INNER JOIN tracking_status ts
  ON json_contains(ts.hawbs_json, JSON_ARRAY(c.hawb))
```

3. Incluir `ts.last_status_code AS tracking_status` no SELECT para referência.

4. O `get_cct_shipment` (detalhe individual) **não** será filtrado — se o usuário buscar por AWB específico, deve ver o processo independente do status.

### Resultado

- O dashboard CCT mostra apenas processos com status de tracking ativo (pré-entrega).
- Processos DLV, sem status, ou com status fora da lista ficam ocultos.
- A busca individual continua funcionando sem filtro.

### Nenhum outro arquivo alterado

