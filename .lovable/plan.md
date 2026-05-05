## Objetivo

Trocar a forma de construir a coluna **Rota** em `/air/tracking-aereo`. Em vez da lógica JS atual (extrai origem/destino/conexões de `t_fato_aereo.origin/destination` + regex sobre `description` da timeline), passar a usar a query autoritativa fornecida (resolve códigos via `t_iata_airports` e cai para a timeline quando ORIGIN/DESTINATION não resolvem).

Regra solicitada:
- `STATUS_ROTA = 'OK'` → mostrar `ROTA` (origem / conexões / destino) calculada pela query.
- Caso contrário → consultar a timeline para preencher origem, conexões (se houver) e destino.

A própria query já faz esse fallback na CTE `rota_base_final` (usa `first_timeline_code` / `last_timeline_code` quando `origin_code`/`destination_code` da `t_fato_aereo` não resolvem) e em `conexoes_intermediarias`. Portanto basta executar a query e usar `ORIGEM_FINAL`, `DESTINO_FINAL`, `CONEXOES`, `ROTA` para todos os casos exceto quando `STATUS_ROTA` indicar que a rota é totalmente inconfiável.

## Mudanças

### 1. `supabase/functions/fetch-tracking-aereo/index.ts`

Adicionar um novo bloco de enrichment (espelhando o padrão do `discrepancyMap`) que:

a. Restringe a query aos AWBs em tela (mesma técnica `awbInClause`).
b. Executa a CTE fornecida pelo usuário (preservando exatamente as regras de resolução IATA / `t_iata_airports` / dedupe consecutivo / `JSON_TABLE` da timeline).
c. Adiciona um pequeno cache TTL (60s) tipo `routeCache` para evitar reprocessar a cada poll.
d. Monta um mapa `routeMap[awb|hawb] = { origin_final, destination_final, conexoes, rota, status_rota }`.

Na montagem do objeto `normalized` (linhas ~1095–1120):

- Substituir `origin: row.ORIGEM`, `destination: row.DESTINO` e o `conexao` calculado por JS pelos valores do `routeMap`:
  - Se `routeMap` tem entrada e `status_rota === 'OK'`: usar `origin_final`, `destination_final`, `conexoes` (split por ` / ` para virar lista comparável com a UI atual, que usa `,` — manteremos `,` no payload).
  - Se `routeMap` tem entrada com `status_rota !== 'OK'`: usar `origin_final` / `destination_final` / `conexoes` mesmo assim, pois a CTE já tentou o fallback de timeline. Apenas quando ambos forem `NULL`, cair para `row.ORIGEM` / `row.DESTINO` brutos como último recurso (preserva comportamento atual de "N/A").
  - Adicionar campo extra opcional `route_status` no payload para depuração futura (sem impacto na UI).

Remover a extração de conexões via regex de `description` (linhas ~973–1008) — passa a vir 100% da query.

### 2. `src/pages/air/TrackingAereo.tsx`

- Em `fetchData` (linhas ~400–437): a leitura permanece igual (`item.origin`, `item.destination`, `item.conexao`); apenas garantir que `conexao` continue como string separada por `,` (manteremos o split na edge function).
- A lógica de highlight da rota (linhas ~810–870) **não muda** — continua operando sobre `awb.origem`, `awb.destino`, `awb.conexao` agora alimentados pela query nova.
- Nenhuma mudança em outras colunas, dedupe, SLA, status, hide rules, etc.

### 3. Memória

Atualizar `mem://air/tracking/route-logic-and-highlighting` indicando que a fonte de origem/conexão/destino passou a ser a CTE com `t_iata_airports`, com fallback de timeline via `first/last_timeline_code`.

## Não muda

- Schema, migrations, RLS — nenhuma alteração.
- Demais regras (manual overrides, discrepâncias, SLA, retenção, ground transport) — preservadas.
- Tela: layout idêntico, só os valores de Rota ficam mais corretos.

## Resultado esperado

A coluna **Rota** passa a refletir exatamente o que a query autoritativa retorna: códigos IATA validados em `t_iata_airports`, com fallback para a timeline quando o `t_fato_aereo` não tiver origem/destino confiáveis, sem inventar conexões a partir de regex frágil sobre descrições.
