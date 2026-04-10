

## Plano: Mover cálculo de SLA para o backend (MariaDB)

### Problema
O cálculo de SLA no frontend falha porque `parseDBDate` não consegue parsear todos os formatos de data. A solução é usar `STR_TO_DATE` do MariaDB (como na query fornecida), que faz o parsing nativamente.

### Alterações

**1. Edge Function `fetch-tracking-aereo/index.ts`** — adicionar colunas SLA ao SQL

A query existente já extrai `date0`, `time0` e `last_status_code`. Basta adicionar o cálculo de SLA diretamente no SQL usando subconsultas ou expressões inline:

- Adicionar ao SELECT da query principal (linha 126-151):
  - `data_evento_base` via `STR_TO_DATE(CONCAT(date0, time0), '%d %b %Y %H:%i')`
  - `hours_in_status` via `TIMESTAMPDIFF(SECOND, data_evento_base, NOW()) / 3600`
  - `sla_limite_horas` via CASE no `last_status_code` (mesmos thresholds da query do usuário)
  - `sla_ratio` = `hours_in_status / sla_limite_horas`
  - `sla_cor` (VERDE/AMARELO/VERMELHO)
  - `sla_tempo_formatado`
  - `sla_tooltip`

- Usar CTE ou subquery wrapping a query existente para não complicar o SQL principal

- No objeto `normalized` (linha 328-344), incluir os novos campos: `hours_in_status`, `sla_limite_horas`, `sla_ratio`, `sla_cor`, `sla_tempo_formatado`, `sla_tooltip`

**2. Frontend `TrackingAereo.tsx`** — usar campos pré-calculados

- No mapeamento (linha 365-377): substituir o cálculo local por `item.hours_in_status` direto do backend
- Na renderização SLA (linha 928-951): usar `sla_cor`, `sla_tempo_formatado` e `sla_tooltip` retornados pelo backend em vez de recalcular thresholds/ratio/display no frontend
- Adicionar campos à interface `AWBData`: `sla_limite_horas`, `sla_ratio`, `sla_cor`, `sla_tempo_formatado`, `sla_tooltip`

### Resumo
| Local | Alteração |
|-------|-----------|
| `fetch-tracking-aereo/index.ts` SQL | Wrapping com CTE para calcular SLA no MariaDB usando `STR_TO_DATE` |
| `fetch-tracking-aereo/index.ts` normalized | Adicionar campos SLA ao objeto retornado |
| `TrackingAereo.tsx` mapeamento | Usar `item.hours_in_status` do backend |
| `TrackingAereo.tsx` renderização SLA | Usar `sla_cor`, `sla_tempo_formatado`, `sla_tooltip` do backend |

