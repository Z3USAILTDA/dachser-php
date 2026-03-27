

## Remoção do LeadComex do fluxo CCT

### Contexto

O CCT atualmente consulta `t_leadcomex_enrichment_logs` para enriquecer status e exibe badges de "LeadComex status" no frontend. Como os dados agora vêm inteiramente de `t_cct_hawb_api_atual` / `t_cct_hawb_api_historico`, as referências ao LeadComex no fluxo do CCT devem ser removidas.

**Nota**: As actions `get_leadcomex_logs`, `get_leadcomex_log_detail`, `get_leadcomex_logs_stats`, `reset_leadcomex_status`, `update_leadcomex_data` e a página `/air/leadcomex-logs` continuam existindo para consulta independente — não serão removidas.

---

### Arquivo 1: `supabase/functions/mariadb-proxy/index.ts`

**No `get_cct_shipments` (linhas ~3624-3710)**:
- Remover a variável `leadcomexStatusMap` e toda a query a `t_leadcomex_enrichment_logs`
- Remover a função `mapLeadcomexStatusToCCT` e o loop que popula o map

**No merge (linhas ~3769-3811)**:
- Remover referências a `leadcomexInfo`, `leadcomex_status`, `leadcomex_attempts`, `situacao_portal`
- O `status_cct_oficial` já vem do `json_partes_estoque` da `t_cct_hawb_api_atual` — não precisa mais do upgrade via LeadComex
- Manter apenas: RFB (da API atual) + `t_cct_eventos_historico` (override) + `t_cct_shipments` (pesos/volumes)

---

### Arquivo 2: `src/components/cct/ProcessosTable.tsx`

- Remover import e uso do `LeadComexStatusBadge` na coluna de status
- Quando status for "AGUARDANDO", mostrar badge padrão em vez do LeadComex badge

---

### Arquivo 3: `src/hooks/useCCTData.ts`

- Remover campos `leadcomex_status` e `leadcomex_attempts` do `mapRowToProcessoCCT`
- Remover `fonte: 'LEADCOMEX'` dos eventos fallback (usar `'RFB'` ou `'TRACKING'`)

---

### Arquivo 4: `src/types/cct.ts`

- Remover `leadcomex_status` e `leadcomex_attempts` do tipo `CCTShipment`
- Remover `'LEADCOMEX'` do tipo `FonteEvento` (manter `'RFB' | 'TRACKING' | 'HANDLER' | 'MANUAL'`)

---

### Resumo

| O que muda | Ação |
|---|---|
| Query a `t_leadcomex_enrichment_logs` no `get_cct_shipments` | Removida |
| `leadcomexStatusMap` e `mapLeadcomexStatusToCCT` | Removidos |
| Campos `leadcomex_status`/`leadcomex_attempts` no merge | Removidos |
| `LeadComexStatusBadge` no ProcessosTable | Removido |
| Tipo `CCTShipment` (leadcomex fields) | Removidos |
| Página LeadcomexLogsPage e actions de logs | Mantidos (uso independente) |

**4 arquivos alterados.**

