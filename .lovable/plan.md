

# Migrar fonte de dados do tracking aéreo: t_aereo_ws → t_aereo_ws_firecrawl

## Resumo

Substituir todas as referências à tabela `t_aereo_ws` por `t_aereo_ws_firecrawl` nos backends que alimentam a tela de rastreio aéreo. A estrutura de colunas é assumida como idêntica (mesmos campos: `awb`, `last_status_code`, `last_status_description`, `origin`, `destination`, `last_flight`, `scraped_at`, `sidebar_days_in_transit`, `timeline_json`, `id`).

---

## Arquivos afetados

### 1. `supabase/functions/fetch-status-aereo/index.ts`
Este é o backend principal da tela de tracking aéreo. Contém 10+ referências a `t_aereo_ws` nas queries SQL e logs:
- **PASSO 1** (linhas ~484-510): Query principal que busca snapshots mais recentes (`SELECT ... FROM t_aereo_ws w INNER JOIN (SELECT awb, MAX(id) ... FROM t_aereo_ws ...`)
- Logs de console (`t_aereo_ws primary`, `from t_aereo_ws`, etc.)

**Ação**: Substituir todas as ocorrências de `t_aereo_ws` por `t_aereo_ws_firecrawl` (find & replace direto — ~10 ocorrências).

### 2. `supabase/functions/mariadb-proxy/index.ts`
Três actions usam `t_aereo_ws`:

- **`get_cct_shipments`** (linhas ~3016-3046): Step 1 busca AWBs de `t_aereo_ws` para o CCT dashboard
- **`get_awb_tracking_events`** (linhas ~6033-6343): Busca timeline_json de `t_aereo_ws` para o modal de eventos
- **`get_cct_pending_hawbs`** (linhas ~11477-11491): Step 1 busca AWBs de `t_aereo_ws` para enriquecimento LeadComex

**Ação**: Substituir todas as ocorrências de `t_aereo_ws` por `t_aereo_ws_firecrawl` nestas 3 actions (~15 ocorrências entre SQL e comentários/logs).

---

## O que NÃO será alterado

- Nenhuma lógica de merge, filtro, classificação ARR, detecção de discrepância
- Nenhuma referência a `t_aereo_api` (continua como fallback autoritativo)
- Nenhuma referência a `t_master_dados`
- Frontend (nenhum arquivo `.tsx` referencia a tabela diretamente)
- A action `get_aging_*` e budget/forecast recém-implementados

## Pré-requisito

A tabela `t_aereo_ws_firecrawl` deve existir no MariaDB com a mesma estrutura de colunas que `t_aereo_ws` (id, awb, last_status_code, last_status_description, origin, destination, last_flight, scraped_at, sidebar_days_in_transit, timeline_json).

