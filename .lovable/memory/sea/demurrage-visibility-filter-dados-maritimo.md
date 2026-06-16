---
name: Demurrage Visibility Filter by t_dados_maritimo
description: Demurrage screens only show containers/PIs/alerts/disputes whose MBL exists in t_dados_maritimo.bl_number
type: feature
---
Após a limpa de dados em `dados_dachser.t_dados_maritimo`, toda listagem do módulo Demurrage filtra por:

```sql
EXISTS (
  SELECT 1 FROM dados_dachser.t_dados_maritimo dm
  WHERE TRIM(UPPER(dm.bl_number)) COLLATE utf8mb4_unicode_ci
      = TRIM(UPPER(dc.mbl)) COLLATE utf8mb4_unicode_ci
)
```

Actions afetadas em `supabase/functions/mariadb-proxy/index.ts`:
- `demurrage_get_containers`
- `demurrage_get_containers_by_mbl` (guard inicial)
- `demurrage_get_stats`
- `demurrage_get_unique_clients`
- `demurrage_get_unique_armadores`
- `demurrage_get_pre_invoices` (via `shipment_mbl`)
- `demurrage_get_alerts` (via `container_id → dc.mbl`)
- `demurrage_get_disputes` (via `container_id → dc.mbl`)
- `demurrage_get_dispute_stats`

A tabela `t_dachser_demurrage_containers` **não é alterada** — containers órfãos continuam armazenados e o `demurrage-recalc`/cron seguem normalmente; apenas a visibilidade na tela é restringida.
