

## Diagnóstico: Por que o 020-65055432 não atualiza

### Causa raiz

A regra de prevalência cronológica que implementamos tem uma condição de segurança: ela **não se aplica quando `tracking_failed = true`** (linha 2382 do `fetch-status-aereo`).

Para o AWB `020-65055432`:
- O `t_status_aereo` mostra `último_status: "AGUARDANDO"` — ou seja, o scraping automático não conseguiu resolver um status IATA válido
- Quando o status não é resolvido, o sistema marca `tracking_failed = true` (linha 1145: `tracking_failed: !finalStatus`)
- Com `tracking_failed = true`, ambas as condições de skip são ignoradas:
  - Linha 2376: `!row.tracking_failed` → false → não pula por peso
  - Linha 2382: `!row.tracking_failed` → false → não pula por data
- Resultado: o override manual **sempre** prevalece, mesmo que o firecrawl agora tenha dados

A mesma lógica se aplica no `mariadb-proxy` para a FORCED_TIMELINE — se o firecrawl tiver dados, ele deveria retornar os automáticos, mas precisa que exista o registro na tabela.

### Solução

**1. `fetch-status-aereo` — Refinar a condição de skip por data (linha 2382)**

Quando `tracking_failed = true` MAS o `row.last_event_date` existe (ou seja, a timeline tem eventos mesmo que o status não tenha sido resolvido), ainda assim comparar as datas. A condição `!row.tracking_failed` deve ser removida do check de data, pois a existência de `row.last_event_date` já prova que há dados automáticos:

```
// Antes:
if (override.last_event_date && row.last_event_date && !row.tracking_failed) {

// Depois:
if (override.last_event_date && row.last_event_date) {
```

A verificação de `tracking_failed` permanece **apenas** no check de peso IATA (linha 2376), onde faz sentido — se o status automático não foi resolvido, não há peso para comparar.

**2. `fetch-status-aereo` — Adicionar fallback de `last_event_date` para AWBs com tracking_failed**

Se `row.last_event_date` é null (porque o parsing falhou completamente), mas o firecrawl tem timeline_json, extrair a data do último evento antes do loop de overrides. Isso garante que `row.last_event_date` esteja preenchido mesmo quando `tracking_failed = true`.

**3. `mariadb-proxy` — Mesma correção no FORCED_TIMELINES**

A lógica de skip por data no mariadb-proxy (linha 7395) já **não** verifica `tracking_failed` — ela apenas compara datas do firecrawl vs forced timeline. Isso já está correto. Se o firecrawl tiver dados mais recentes, a timeline forçada será ignorada.

Porém, se o firecrawl **não** tiver o AWB (`wsRows.length === 0`), a forced timeline continua sendo usada — o que é o comportamento esperado.

### Arquivos a alterar

- `supabase/functions/fetch-status-aereo/index.ts` — Remover `!row.tracking_failed` da condição de data (linha 2382)
- `.lovable/memory/air/ajustes-manuais-e-exclusoes.md` — Documentar que a comparação de data funciona independentemente de tracking_failed

