

## Migração da fonte de dados CCT: `t_aereo_ws_firecrawl` → `t_cct_hawb_api_atual` / `t_cct_hawb_api_historico`

### Contexto

Atualmente, o `get_cct_shipments` usa `t_aereo_ws_firecrawl` (rastreio por MAWB) como fonte primária, depois faz JOIN com `t_master_dados` para obter HAWBs. As novas tabelas `t_cct_hawb_api_atual` e `t_cct_hawb_api_historico` já armazenam dados por HAWB diretamente, com colunas JSON decompostas (identificação, partes de estoque, bloqueios, frete, etc.).

---

### Arquivo único: `supabase/functions/mariadb-proxy/index.ts`

### Alteração 1 — `get_cct_shipments` (linhas ~3352-4386)

**Substituir Step 1** (query a `t_aereo_ws_firecrawl` por MAWB) por query a `t_cct_hawb_api_atual` por HAWB:

```sql
SELECT 
  h.id, h.hawb, h.hawb_normalizado, h.data_emissao,
  h.data_consulta_sucesso, h.attempts_used, h.consulted_at,
  h.response_http_status,
  h.json_identificacao, h.json_partes_estoque,
  h.json_bloqueios_ativos, h.json_bloqueios_baixados,
  h.json_frete, h.json_manuseios_especiais,
  h.json_viagens_associadas, h.json_divergencias,
  h.json_conhecimento_carga_detalhada,
  h.json_mawb_awb_associados, h.json_itens_carga,
  h.json_contatos_consignatario, h.json_documentos_saida
FROM t_cct_hawb_api_atual h
WHERE h.data_consulta_sucesso IS NOT NULL
  AND h.response_http_status = 200
```

**Substituir Step 2** (JOIN com `t_master_dados` por MAWB): agora o HAWB já vem direto da `t_cct_hawb_api_atual`. Ainda precisamos do `t_master_dados` para obter cliente, analista e MAWB associado, mas o JOIN será por HAWB:

```sql
SELECT m.mawb as master, m.cliente, m.nome_analista, m.email_analista, m.emails_cliente
FROM t_master_dados m
WHERE TRIM(m.hawb) IN (... hawbs da t_cct_hawb_api_atual ...)
AND m.tipo_processo = 'AIR IMPORT'
```

**Substituir Steps 2.1 e 2.5** (enriquecimento com `t_aereo_cct`): os dados de RFB (partes_estoque, situação, bloqueios, frete, manuseios especiais) agora vêm diretamente das colunas JSON da `t_cct_hawb_api_atual` — não é mais necessário consultar `t_aereo_cct` separadamente.

**Remover Step 2.6** (processos "RFB-only" de `t_aereo_cct`): desnecessário pois `t_cct_hawb_api_atual` já é a fonte unificada.

**Manter** a lógica de:
- `t_cct_shipments` (pesos, volumes, ETD/ETA)
- `t_leadcomex_enrichment_logs` (status LeadComex)
- `t_cct_eventos_historico` (override de status final)
- Cálculo de SLA, tipo_voo, divergências
- Mapeamento de status hierárquico (CCT_STATUS_ORDER)

**Extração de dados das colunas JSON** (lógica JS no merge):
- `json_identificacao` → MAWB associado, aeroporto origem/destino, RUC
- `json_partes_estoque` → situação oficial (MANIFESTADA, RECEPCIONADA, etc.), CNPJ consignatário
- `json_bloqueios_ativos` → status BLOQUEIO/FRO
- `json_frete` → info de frete (moeda, forma pgto, total)
- `json_manuseios_especiais` → códigos de manuseio
- `json_viagens_associadas` → número do voo, data de decolagem (dep_datetime)
- `json_divergencias` → divergências de peso/volume
- `json_conhecimento_carga_detalhada` → peso bruto, volumes, indicador madeira

---

### Alteração 2 — `get_cct_events` (linhas ~7033-7150)

**Substituir** a fonte de timeline RFB (atualmente de `t_aereo_cct.partesEstoque`) por `t_cct_hawb_api_historico`:

```sql
SELECT id, hawb, hawb_normalizado, consulted_at,
  json_partes_estoque, json_bloqueios_ativos, json_bloqueios_baixados,
  json_identificacao
FROM t_cct_hawb_api_historico
WHERE hawb_normalizado = ?
ORDER BY consulted_at DESC
LIMIT 50
```

Para cada snapshot histórico, comparar o `json_partes_estoque` (situação) com o anterior para detectar transições de status e gerar eventos na timeline. Manter a fusão com `t_cct_eventos_historico` existente.

---

### Alteração 3 — `get_cct_pending_hawbs` (linhas ~13876+)

**Substituir** a query a `t_aereo_ws_firecrawl` por:

```sql
SELECT hawb, hawb_normalizado, data_consulta_sucesso, consulted_at
FROM t_cct_hawb_api_atual
WHERE data_consulta_sucesso IS NOT NULL
  AND response_http_status = 200
```

---

### Resumo

| O que muda | De | Para |
|---|---|---|
| Fonte primária do dashboard | `t_aereo_ws_firecrawl` (MAWB) | `t_cct_hawb_api_atual` (HAWB) |
| Dados RFB (situação, frete, bloqueios) | `t_aereo_cct` (query separada) | `json_partes_estoque`, `json_frete`, `json_bloqueios_ativos` da mesma tabela |
| Timeline do modal de eventos | `t_aereo_cct.partesEstoque` | `t_cct_hawb_api_historico` (snapshots) |
| Enriquecimento de pending HAWBs | `t_aereo_ws_firecrawl` | `t_cct_hawb_api_atual` |

**Arquivos alterados:** 1 (`supabase/functions/mariadb-proxy/index.ts`)
**Nenhuma alteração no frontend** — a estrutura de saída (response JSON) permanece a mesma.

