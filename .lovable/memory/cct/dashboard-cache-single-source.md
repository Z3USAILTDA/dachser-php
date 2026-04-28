---
name: CCT Dashboard Cache Single Source
description: t_cct_dashboard_cache.eventos é a única fonte para timeline e status CCT (dashboard, detalhe, header)
type: feature
---

**Fonte única de verdade para CCT:** `dados_dachser.t_cct_dashboard_cache`.

Colunas relevantes: `hawb`, `awb`, `eventos`, `teve_bloqueio`, `motivos_bloqueio`, `data_decolagem`, `peso_recebido_declarado`, `peso_constatado`, `volume_recebido_declarado`, `volume_constatado`, `situacao_portal_atual`, `data_ultima_atualizacao_atual`, `consulted_at_ultima_consulta`, `refreshed_at`.

**Regras:**
- `get_cct_shipments_cached` (dashboard) e `get_cct_events` (timeline do detalhe) leem **ambos** dessa tabela. Nenhum dos dois pode ler de `t_cct_hawb_api_historico`/`t_cct_hawb_api_atual` para esses campos.
- `eventos` pode vir como JSON array ou pipe-format `Descricao | dd/MM/yyyy HH:mm:ss || ...`. O parser deve aceitar os dois e ordenar **cronologicamente DESC**, com tiebreaker estável pelo índice original.
- O **status do header** do detalhe (`ProcessoTimeline.tsx`) é derivado do último evento da timeline via `getLatestTimelineStatus(eventos)`. `status_cct_oficial` só é fallback quando `eventos` estiver vazio.
- `cctStatusResolver` mapeia código + descrição (texto livre como "Em trânsito terrestre") para `StatusCCTOficial`. Cobrir variantes com/sem acento e o typo `EM_TRNSITO_TERRESTRE`.
