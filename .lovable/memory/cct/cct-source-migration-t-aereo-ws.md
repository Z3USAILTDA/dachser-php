# Memory: cct/cct-source-migration-t-aereo-ws
Updated: 2026-03-06

CCT Dashboard (get_cct_shipments and get_cct_pending_hawbs in mariadb-proxy) and air tracking (fetch-status-aereo) migrated from `t_aereo_ws` to `t_aereo_ws_firecrawl` (same column structure). Sliding **1-day** window (changed from 30-day on 2026-03-06). Flow:

1. **Step 1**: Fetch latest AWB snapshots from `t_aereo_ws_firecrawl` (MAX(id) grouped by AWB) filtering by CCT-relevant statuses (DEP, ARR, ATA, RCF, NFD, AWD, DLV, POD, FRO, DIS) and registered airline codes
2. **Step 2**: Get HAWBs from `t_master_dados` via IN clause on those AWBs, enriched with client/analyst info
3. **Step 2.5**: Enrich with `t_aereo_cct` (RFB data) — RUC, weights, volumes, special handling codes, recinto aduaneiro, consignatario, frete info, numero voo, data emissão, partesEstoque situacao
4. **JS Merge**: Map `t_aereo_ws_firecrawl.last_status_code` to CCT official status in JavaScript. **Canonical status ordering** applied: INFORMADA(1) → MANIFESTADA(2) → EM_AREA_TRANSFERENCIA(3) → RECEPCIONADA(4) → EM_TROCA_RECINTOS(5) → EM_TRANSITO_TERRESTRE(6) → ENTREGUE(7). Most advanced status from all sources (tracking, LeadComex, RFB) wins.

Also: `get_awb_tracking_events` reads `timeline_json` from `t_aereo_ws_firecrawl`.
Also: `get_cct_events` now merges events from `t_cct_eventos_historico` AND `t_aereo_cct.partesEstoque` (as RFB fonte, COMPLEMENTAR confidence).

New CCTShipment fields: ruc, recinto_aduaneiro, numero_voo, data_emissao, indicador_madeira, info_frete, manuseios_especiais_rfb, rfb_situacao.

This means any AWB that reaches DEP (or later) in the tracking system automatically appears in the CCT dashboard. LeadComex sync runs every 1 minute via pg_cron job `leadcomex-sync-every-minute`, calling the `enrich` action with `prioritize_pending=true` and `limit=30`. HAWBs successfully enriched within 4 hours are skipped (cooldown).
