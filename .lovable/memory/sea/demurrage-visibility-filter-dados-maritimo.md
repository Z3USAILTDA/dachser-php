---
name: Demurrage Visibility Filter by MBL Prefix
description: Demurrage screens only show containers/pre-invoices/alerts/disputes whose MBL starts with one of the 13 supported carrier prefixes.
type: feature
---

All demurrage queries in `supabase/functions/mariadb-proxy/index.ts` restrict visibility by MBL prefix (first 4 chars, UPPER+TRIM):

`HLCU, MEDU, ONEY, COSU, ZIMU, MAEU, SUDU, CMAU, EISU, YMLU, HDMU, PCIU, WHLU`

SQL pattern:
```sql
LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU')
```

Applied in actions:
- `demurrage_get_containers`
- `demurrage_get_stats`
- `demurrage_get_unique_clients`
- `demurrage_get_unique_armadores`
- `demurrage_get_pre_invoices` (over `shipment_mbl`)
- `demurrage_get_alerts` (via subquery on container)
- `demurrage_get_disputes` (via subquery on container)
- `demurrage_get_dispute_stats` (via subquery on container)
- `demurrage_get_containers_by_mbl` (JS prefix guard)

Note: previous version filtered by EXISTS on `t_dados_maritimo.bl_number`, but that caused too few rows because the tables don't share MBL universe. Prefix filter is the canonical rule.
