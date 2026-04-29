---
name: CCT Dashboard Cache Single Source
description: t_cct_dashboard_cache.eventos é a única fonte para timeline e status CCT (dashboard, detalhe, header), e o resolver é único
type: feature
---

**Fonte única de verdade para CCT:** `dados_dachser.t_cct_dashboard_cache`.

Colunas relevantes: `hawb`, `awb`, `eventos`, `teve_bloqueio`, `motivos_bloqueio`, `data_decolagem`, `peso_recebido_declarado`, `peso_constatado`, `volume_recebido_declarado`, `volume_constatado`, `situacao_portal_atual`, `data_ultima_atualizacao_atual`, `consulted_at_ultima_consulta`, `refreshed_at`.

**Regras:**
- `get_cct_shipments_cached` (dashboard) e `get_cct_events` (timeline do detalhe) leem **ambos** dessa tabela. Nenhum dos dois pode ler de `t_cct_hawb_api_historico`/`t_cct_hawb_api_atual` para esses campos.
- `eventos` pode vir como JSON array ou pipe-format `Descricao | dd/MM/yyyy HH:mm:ss || ...`. O parser deve aceitar os dois e ordenar **cronologicamente DESC**, com tiebreaker estável pelo índice original.
- O **status do header** do detalhe (`ProcessoTimeline.tsx`) **e** o `status_atual.status_cct_oficial` exibido na **listagem do dashboard** (`useCCTData.ts → mapRowToProcessoCCT`) DEVEM ser derivados **exclusivamente** via `getLatestTimelineStatus` do `cctStatusResolver`. O parser local `mapSituacaoToCCT` NÃO pode ser usado para definir status final — somente como fallback de `situacao_portal_atual` quando `eventos` está vazio.
- Em `parseAndSortEventos`, os eventos devem receber `id` numérico crescente conforme a ordem cronológica ASC, para que o tiebreaker `id desc` do resolver escolha o evento certo quando há timestamps iguais.
- `cctStatusResolver` mapeia código + descrição (texto livre como "Em trânsito terrestre") para `StatusCCTOficial`. Cobrir variantes com/sem acento e o typo `EM_TRNSITO_TERRESTRE`.

**Bloqueio (`teve_bloqueio`):**
- A coluna `teve_bloqueio` é **histórica** (registra que houve bloqueio em algum momento) e NÃO pode sobrepor o status final no dashboard.
- `BLOQUEIO` só deve aparecer como status quando for o último evento real da timeline (já tratado pelo `cctStatusResolver` via mapeamento de código/descrição).
- `teve_bloqueio` alimenta APENAS o array `excecoes[]` (aba "Exceções") para preservar o registro histórico do bloqueio.

**SLA — cumprimento por timeline:**
- `computeSLAInfo` em `useCCTData.ts` deve receber `dataManifestacao` derivada do **primeiro evento da timeline** cujo código/descrição indique manifestação ou estágio posterior: `manifest`, `recepc`, `entreg`, `transfer`, `trans+terre`, `troca+recint`.
- Isso garante SLA `CUMPRIDO` mesmo quando o status corrente regrediu (ex.: bloqueio após manifestação) ou quando o status final é `ENTREGUE` mas o cálculo por status falharia.
