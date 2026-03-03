# Memory: cct/cct-source-migration-t-aereo-ws
Updated: 2026-03-03

CCT Dashboard (get_cct_shipments and get_cct_pending_hawbs in mariadb-proxy) and air tracking (fetch-status-aereo) migrated from `t_aereo_ws` to `t_aereo_ws_firecrawl` (same column structure). Sliding 30-day window. Flow:

1. **Step 1**: Fetch latest AWB snapshots from `t_aereo_ws_firecrawl` (MAX(id) grouped by AWB) filtering by CCT-relevant statuses (DEP, ARR, ATA, RCF, NFD, AWD, DLV, POD, FRO, DIS) and registered airline codes
2. **Step 2**: Get HAWBs from `t_master_dados` via IN clause on those AWBs, enriched with client/analyst info
3. **JS Merge**: Map `t_aereo_ws_firecrawl.last_status_code` to CCT official status in JavaScript

Also: `get_awb_tracking_events` reads `timeline_json` from `t_aereo_ws_firecrawl`.

This means any AWB that reaches DEP (or later) in the tracking system automatically appears in the CCT dashboard. LeadComex sync runs every 1 minute via pg_cron job `leadcomex-sync-every-minute`, calling the `enrich` action with `prioritize_pending=true` and `limit=30`. HAWBs successfully enriched within 4 hours are skipped (cooldown).
