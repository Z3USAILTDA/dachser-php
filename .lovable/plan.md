

## Correção: Filtro tipo_processo — fallback por destino

### Problema
Linha 1908: `COALESCE(MAX(mdn.tipo_processo), MAX(ts.tipo_processo), 'SEA IMPORT')` ainda usa dados incorretos da `t_tracking_sea` e o CTE `master_dados_new` filtra `data_insert >= '2026-02-04'`, excluindo registros antigos.

### Correção em `supabase/functions/olimpo-proxy/index.ts`

**1. Remover filtro de data do CTE `master_dados_new` (linha 1755)**
Apagar a linha `AND data_insert >= '2026-02-04 09:55:11'` para que todos os MBLs SEA do `t_master_dados` sejam considerados.

**2. Alterar COALESCE na linha 1908 — usar lógica de destino como fallback**
Substituir:
```sql
COALESCE(MAX(mdn.tipo_processo), MAX(ts.tipo_processo), 'SEA IMPORT') as tipo_processo
```
Por:
```sql
COALESCE(
  MAX(mdn.tipo_processo),
  CASE 
    WHEN UPPER(COALESCE(MAX(ts.destino), '')) LIKE 'BR%' 
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%BRAZIL%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%BRASIL%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%, BR'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%SANTOS%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%PARANAGU%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%NAVEGANTES%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%ITAJA%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%ITAPO%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%RIO GRANDE%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%SUAPE%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%PECEM%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%MANAUS%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%SALVADOR%'
      OR UPPER(COALESCE(MAX(ts.destino), '')) LIKE '%VITORIA%'
    THEN 'SEA IMPORT'
    WHEN MAX(ts.destino) IS NOT NULL AND TRIM(MAX(ts.destino)) != ''
    THEN 'SEA EXPORT'
    ELSE 'SEA IMPORT'
  END
) as tipo_processo
```

Lógica: Se `t_master_dados` tem o tipo, usa. Senão, analisa o destino — se é Brasil, é IMPORT; se é outro país, é EXPORT. Fallback final: IMPORT.

**3. Mesma lógica no sync de candidatos (linha 2241)**
Substituir:
```sql
COALESCE(MAX(md.tipo_processo), 'SEA IMPORT') AS tipo_processo
```
Por:
```sql
COALESCE(MAX(md.tipo_processo), 'SEA IMPORT') AS tipo_processo
```
(Este já está correto pois faz JOIN com `t_master_dados`; o problema principal era a query de listagem.)

**4. Atualizar registros existentes na sync**
Adicionar um UPDATE na ação `sync_sea_tracking` para corrigir registros existentes cujo `tipo_processo` está errado, usando a mesma lógica de destino como fallback.

