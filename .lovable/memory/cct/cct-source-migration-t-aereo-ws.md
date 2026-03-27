# Memory: cct/cct-source-migration-t-aereo-ws
Updated: 2026-03-27

CCT Dashboard (get_cct_shipments, get_cct_pending_hawbs) and CCT events timeline (get_cct_events) migrated from `t_aereo_ws_firecrawl` + `t_aereo_cct` to `t_cct_hawb_api_atual` / `t_cct_hawb_api_historico`. These tables store data per HAWB (not MAWB) with decomposed JSON columns.

Flow:

1. **Step 1**: Fetch HAWBs from `t_cct_hawb_api_atual` (WHERE data_consulta_sucesso IS NOT NULL AND response_http_status = 200)
2. **Step 2**: Get client/analyst info from `t_master_dados` via JOIN on HAWB (not MAWB)
3. **RFB data extraction**: From JSON columns of `t_cct_hawb_api_atual`:
   - `json_identificacao` → MAWB, aeroporto origem/destino, RUC
   - `json_partes_estoque` → situação oficial (MANIFESTADA, RECEPCIONADA, etc.), CNPJ consignatário
   - `json_bloqueios_ativos` → bloqueios
   - `json_frete` → info de frete
   - `json_manuseios_especiais` → códigos de manuseio
   - `json_viagens_associadas` → número do voo, dep_datetime
   - `json_conhecimento_carga_detalhada` → peso bruto, volumes, indicador madeira
4. **JS Merge**: Canonical status ordering applied: INFORMADA(1) → MANIFESTADA(2) → EM_AREA_TRANSFERENCIA(3) → RECEPCIONADA(4) → EM_TROCA_RECINTOS(5) → EM_TRANSITO_TERRESTRE(6) → ENTREGUE(7). Most advanced status from all sources (RFB JSON, LeadComex, t_cct_eventos_historico) wins.

**Timeline (get_cct_events)**: Uses `t_cct_hawb_api_historico` snapshots (up to 50, ordered by consulted_at DESC). Compares `json_partes_estoque` across snapshots to detect status transitions. Merged with `t_cct_eventos_historico`.

**Pending HAWBs (get_cct_pending_hawbs)**: Uses `t_cct_hawb_api_atual` as source, JOINs with `t_master_dados` by HAWB.

Enrichment still uses: `t_cct_shipments` (pesos, volumes, ETD/ETA), `t_leadcomex_enrichment_logs` (status LeadComex), `t_cct_eventos_historico` (status override).
