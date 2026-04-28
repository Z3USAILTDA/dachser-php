# Unificar status CCT: dashboard ↔ detalhe

## Diagnóstico

A tela de detalhe (`ProcessoTimeline.tsx`) e a tela inicial (`CCTDashboard` / `ProcessosTable`) leem da **mesma tabela** (`t_cct_dashboard_cache.eventos`), porém o **último status** é calculado por **dois caminhos diferentes**, com resultados divergentes em alguns processos:

| Camada | Onde calcula | Função usada | Como escolhe o "último" |
|---|---|---|---|
| **Detalhe (header)** | `ProcessoTimeline.tsx` chama `useCCTEvents` → action `get_cct_events` (proxy parseia e ordena DESC) → `getLatestTimelineStatus` (`cctStatusResolver.ts`) | `mapEventCodeToStatus` + `mapDescriptionToStatus` | Ordena DESC por `data_hora_evento`, depois `created_at`, depois `id` |
| **Dashboard (linha da tabela)** | `useCCTData.ts` → `mapRowToProcessoCCT` parseia `row.eventos` localmente e pega `eventos[length-1]` | `mapSituacaoToCCT` (parser local, mais restrito) | Ordena ASC por data; tiebreaker por **índice original** |

Causas concretas da divergência observada em processos reais:

1. **Mapeadores diferentes.** O resolver do detalhe cobre variantes que o `mapSituacaoToCCT` do dashboard não cobre (ex.: códigos `DESEMBARACO`, `LIBERADO`, `DESBLOQUEIO`, typo `EM_TRNSITO_TERRESTRE`, `EM_TROCA_RECINTOS` por código). Quando o último evento cai num desses, o dashboard volta para `INFORMADA` (fallback) enquanto o detalhe acerta.
2. **Tiebreaker diferente quando há eventos com a mesma data/hora.** O dashboard usa ordem original do array; o detalhe usa `id` desc. Em HAWBs com dois eventos no mesmo timestamp (comum em "Recepcionada" + "Em trânsito terrestre" registrados juntos), cada tela escolhe um evento distinto.
3. **Pipeline de parse separado.** O proxy (`get_cct_events`) e o hook (`parseAndSortEventos`) têm ramos próprios para o formato pipe e JSON; pequenas diferenças de filtro fazem o "último" ser outro item.
4. **`status_cct_oficial` no objeto do dashboard nunca passa pelo `cctStatusResolver`.** Logo, qualquer melhoria feita no resolver (memória `dashboard-cache-single-source`) não chega à listagem.

Resultado: detalhe mostra, p.ex., `EM_TRANSITO_TERRESTRE` (correto), e a linha da tabela ainda mostra `RECEPCIONADA` ou `INFORMADA`.

## Solução

Fazer o dashboard derivar o status pelo **mesmo caminho** do detalhe, sem mexer na fonte de dados nem no proxy.

### 1. `src/hooks/useCCTData.ts` — `mapRowToProcessoCCT`

- Remover o cálculo local de `effectiveStatus` baseado em `mapSituacaoToCCT(ultimoEvento.descricao)`.
- Após `parseAndSortEventos`, chamar `getLatestTimelineStatus(eventos, fallback)` do `cctStatusResolver` para obter o status canônico.
- Manter a regra de bloqueio (`hasBloqueio` → `BLOQUEIO`) como override final, igual hoje.
- Manter `situacao_portal_atual` apenas como fallback quando `eventos` estiver vazio (idêntico ao header do detalhe).

### 2. `src/hooks/useCCTData.ts` — `parseAndSortEventos`

- Garantir que cada evento gerado tem `id` estável e crescente segundo a ordem cronológica, para que o `compareCCTEventsByRecency` do resolver produza o mesmo desempate do detalhe (eventos do mesmo timestamp ficam ordenados pelo índice do array original via `id` numérico desc).
- Preencher `created_at` igual ao `data_hora_evento` (já é o caso) para neutralizar o segundo critério do resolver.

### 3. Sem mudanças no proxy

`get_cct_events` continua igual. Ambos os caminhos lerão `t_cct_dashboard_cache.eventos`, e os mapeadores agora serão os mesmos (`cctStatusResolver`).

### 4. Memória

Atualizar `mem://cct/dashboard-cache-single-source` acrescentando: "tanto o `status_atual.status_cct_oficial` exibido no dashboard quanto o header do detalhe DEVEM ser derivados via `getLatestTimelineStatus` do `cctStatusResolver`. O parser local `mapSituacaoToCCT` em `useCCTData.ts` não pode ser usado para definir status final."

## Arquivos afetados

- `src/hooks/useCCTData.ts` (modificar `mapRowToProcessoCCT` e ajuste leve em `parseAndSortEventos`)
- `.lovable/memory/cct/dashboard-cache-single-source.md` (acréscimo)

## Como validar

- Abrir um HAWB cuja tela de detalhe mostra status diferente da listagem (ex.: o que motivou o report).
- Após o deploy, a coluna **Status CCT** da listagem deve passar a refletir o mesmo status do header do detalhe e do topo da timeline.
- Processos com bloqueio continuam marcados como `BLOQUEIO`.
- Processos sem nenhum evento continuam caindo no fallback `situacao_portal_atual` → `INFORMADA`.
