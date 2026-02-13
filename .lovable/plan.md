

## Corrigir data de busca do LeadComex (dep_datetime -> scraped_at)

### Problema
A funcao `get_cct_pending_hawbs` no `mariadb-proxy` nao retorna nenhuma data para o campo `dep_datetime`. A query SQL so seleciona `house`, `master`, `peso_declarado` e `cnpj_consignatario` da `t_master_dados`, entao `row.dep_datetime` e sempre `undefined`. Isso faz com que o reverse ladder do `leadcomex-sync` use a data atual como fallback, reduzindo drasticamente as chances de match.

### Solucao
Incluir o `scraped_at` da `t_aereo_ws` na query de `get_cct_pending_hawbs`, seguindo o mesmo padrao ja usado em `get_cct_shipments` (onde `dep_datetime = awbInfo.scraped_at`).

### Alteracoes

**1. `supabase/functions/mariadb-proxy/index.ts` - case `get_cct_pending_hawbs`**

- Na Step 1 (busca de AWBs na `t_aereo_ws`), incluir `ws.scraped_at` no SELECT alem de `ws.awb`
- Construir um mapa `awb -> scraped_at` (similar ao que `get_cct_shipments` ja faz)
- Na Step 2, apos buscar HAWBs da `t_master_dados`, fazer merge com o `scraped_at` do mapa
- No mapeamento de resultado (linha ~11183), usar o `scraped_at` correspondente ao master/AWB do HAWB

**2. `supabase/functions/leadcomex-sync/index.ts`**

- Nenhuma alteracao necessaria neste arquivo. Ele ja usa `shipment.dep_datetime` corretamente; o problema e que o valor chega como `null` do proxy.

### Detalhes tecnicos

Mudanca principal no `get_cct_pending_hawbs`:

```sql
-- Step 1: adicionar scraped_at ao SELECT
SELECT ws.awb, ws.scraped_at
FROM t_aereo_ws ws
INNER JOIN (
  SELECT awb, MAX(id) as max_id
  FROM t_aereo_ws
  WHERE scraped_at >= NOW() - INTERVAL 30 DAY
  ...
) latest ON ws.awb = latest.awb AND ws.id = latest.max_id
```

```javascript
// Construir mapa AWB -> scraped_at
const awbDateMap = {};
for (const r of awbsResult) {
  awbDateMap[r.awb] = r.scraped_at;
}

// No mapeamento final, buscar scraped_at pelo master
result = {
  shipments: rows.map(row => ({
    house: row.house,
    master: row.master,
    dep_datetime: awbDateMap[row.master] || null, // scraped_at real
    ...
  }))
};
```

### Impacto esperado
- HAWBs que antes buscavam com a data de hoje (fallback) passarao a buscar com a data real do ultimo scrape, que e proxima a data de embarque
- Isso deve aumentar significativamente a taxa de match no LeadComex, pois a `dataEmissao` estara mais proxima da data correta

