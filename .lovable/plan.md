

## Plano: Filtrar processos HAPAG, MSC e ONE por data_insert >= 04/01

### Problema atual
A query no `draft-fetch-mariadb` filtra apenas `mawb LIKE '%HLC%'` (Hapag-Lloyd) e usa `etd >= '2026-01-01'`. Precisamos expandir para incluir MSC e ONE, e trocar o filtro de data para `data_insert >= '2026-01-04'`.

### Alteração

**Arquivo: `supabase/functions/draft-fetch-mariadb/index.ts`**

Atualizar a query SQL de:
```sql
WHERE tmd.tipo_processo = 'SEA EXPORT'
  AND tmd.mawb LIKE '%HLC%'
  AND tmd.etd >= '2026-01-01'
```

Para:
```sql
WHERE tmd.tipo_processo = 'SEA EXPORT'
  AND (tmd.mawb LIKE '%HLC%' OR tmd.mawb LIKE '%MSC%' OR tmd.mawb LIKE '%MEDU%' OR tmd.mawb LIKE '%ONEY%' OR tmd.mawb LIKE '%ONE%')
  AND tmd.data_insert >= '2026-01-04'
```

Isso garante que:
- Processos Hapag (`HLC`), MSC (`MSC`, `MEDU`) e ONE (`ONEY`, `ONE`) sejam buscados
- Apenas registros com `data_insert` a partir de 04/01/2026 são retornados
- A auto-detecção de armador no tracker continua funcionando normalmente pelos prefixos

### Impacto
Apenas 1 arquivo editado. Nenhuma mudança de UI necessária — o grid e o tracker já suportam multi-armador.

