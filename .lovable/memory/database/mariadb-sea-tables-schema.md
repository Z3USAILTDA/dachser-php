# Memory: database/mariadb-sea-tables-schema
Updated: 2026-03-17

## Schema real das tabelas MariaDB usadas nas queries SEA do olimpo-proxy

### dados_dachser.t_tracking_sea
- id (bigint), mbl_id (varchar 50), tipo_processo (varchar 50), container (varchar 20)
- shipping_line (varchar 20), consignee (varchar 255), origem (varchar 100), destino (varchar 100)
- navio (varchar 100), vessel_imo (varchar 20), eta (datetime), last_event (varchar 500)
- container_status (varchar 100), last_check (datetime), email_analista (varchar 200)
- email_cliente (varchar 200), active (tinyint), created_at (timestamp), updated_at (timestamp)
- last_error (varchar 255), sibling_synced (tinyint), sibling_synced_at (datetime)
- needs_manual_review (tinyint), transshipment_port (varchar 500), tipo_carga (enum FCL/LCL/BCN)
- coloader (varchar 255), loading_port (varchar 200), enrich_timeout_count (int)
- latitude (varchar 200), longitude (varchar 200)

### dados_dachser.t_sea_master
- id (bigint), nome_analista (varchar 100), customer_no (varchar 255), po (varchar 255)
- hawb (varchar 60), master (varchar 60), etd (datetime), pre_alert_sent (datetime)
- oea_cl_doc (tinyint), cargo_departed (datetime), d_term (varchar 50)
- pod_dn_available (varchar 50), remarks (varchar 255), tipo_processo (varchar 200)
- created_at (timestamp), data_insert (datetime), hbl (varchar 100)
- customer_order (varchar 100), accrual (tinyint), dep (tinyint), **eta_ata** (datetime)
- email_title (text), te (varchar 50), at_field (varchar 50), wh_treatment (varchar 100)
- cct_transm (varchar 100), deadline_draft_vgm (datetime), drafts_sent (tinyint)
- deadline_load (datetime), pod_available (tinyint), dn_available (tinyint)
**NOTA**: NÃO existe coluna `eta` — usar `eta_ata` para ETA/ATA.

### dados_dachser.t_master_dados
- id (int), cliente (varchar 100), mawb (varchar 100), hawb (varchar 100)
- emails_cliente (varchar 200), nome_analista (varchar 200), email_analista (varchar 200)
- active (int), tipo_processo (varchar 50), container (varchar 100)
- previsao_faturamento (double), data_finalizacao (datetime), num_voo (varchar 100)
- data_insert (datetime), tipo_servico (varchar 50), tratamento (varchar 100)
- id_olss (int), etd (datetime), eta (datetime), shipper (varchar 200)
- data_inclusao_nova (datetime)
**NOTA**: NÃO existe coluna `data_abertura` — usar `data_insert` para filtro de data.

### dados_dachser.t_olimpo_tracking
- id (int), mode (varchar 10), asset (varchar 100), flight (varchar 100)
- tipo_processo (varchar 100), cliente (varchar 255)
- origem_code (varchar 255), destino_code (varchar 255)
- origem_lat/lon (decimal), destino_lat/lon (decimal)
- status (varchar 50), eta (datetime), ata (datetime), etd (datetime), atd (datetime)
- current_lat/lon (decimal), vessel_name (varchar 100), shipping_line (varchar 100)
- container_status (varchar 100), last_api_update (datetime)
- active (tinyint), created_at (datetime), updated_at (datetime)
