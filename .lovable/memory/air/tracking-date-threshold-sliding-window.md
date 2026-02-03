# Memory: air/tracking-date-threshold-sliding-window
Updated: 2026-02-03

Air Tracking dashboard (/air/tracking) now uses a **sliding 10-day window** instead of a hardcoded date filter. The fetch-status-aereo Edge Function retrieves records where `m.data_insert >= DATE_SUB(NOW(), INTERVAL 10 DAY)` from t_master_dados. This ensures:

1. **New records appear automatically** without requiring date filter updates
2. **ARR retention rule still applies**: Records with status 'ARR' or 'ARR - Destino' remain visible for 5 days using `COALESCE(arr_datetime, última atualização) >= DATE_SUB(NOW(), INTERVAL 5 DAY)`

This replaces the previous hardcoded '2026-01-26' filter that was excluding newer records.
