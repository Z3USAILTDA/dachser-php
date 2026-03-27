# Memory: cct/cct-source-migration-t-aereo-ws
Updated: 2026-03-27

CCT Dashboard (get_cct_shipments) uses TWO sources only:

1. **Primary**: `t_cct_hawb_api_atual` — all records, no filters, no LIMIT. JSON columns parsed for RFB data (status, weights, volumes, flights, blocks, freight).
2. **Complement**: `t_dados_aereo` — enrichment by HAWB (consignee_nome→cliente, clerk→analista, eta, etd, gross_weight_kg, volume_cbm, pieces, awb_number→MAWB fallback). Uses ROW_NUMBER() to pick latest record per HAWB.

**Removed sources**: `t_master_dados`, `t_cct_shipments`, `t_cct_eventos_historico`, `t_leadcomex_enrichment_logs`.

Status priority (no history override):
1. `json_partes_estoque` → `situacaoAtual` (mapped via `mapRfbSituacaoToCCT`)
2. Fallback: `AGUARDANDO_CONSULTA`

SLA calculation unchanged — uses dep_datetime from `json_viagens_associadas`, eta from `t_dados_aereo`.

Timeline (get_cct_events): Still uses `t_cct_hawb_api_historico` snapshots.
