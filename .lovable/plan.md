

## Plano: Override manual deve ceder quando há eventos automáticos mais recentes

### Problema
Quando um override manual é aplicado, ele "congela" os dados mesmo que o rastreio automático traga eventos mais recentes. A lógica atual (linha 2376 do `fetch-status-aereo`) só compara o **peso hierárquico IATA** — se o status automático tem peso igual ou menor que o manual, o override é aplicado incondicionalmente, ignorando a data do evento.

Exemplo: O override manual define `last_event_date: '2026-03-15T08:20:00'`, mas o rastreio automático traz um evento de `2026-03-16T11:33:00`. Mesmo sendo mais recente, o override manual prevalece se o status tiver peso igual ou inferior.

### Solução

**1. `supabase/functions/fetch-status-aereo/index.ts` — loop de overrides (~linha 2376)**

Adicionar uma segunda condição de skip: comparar a data do último evento automático com a `last_event_date` do override manual. Se o evento automático for mais recente, pular o override.

```
Lógica atual:
  if (autoWeight > manualWeight) → skip

Lógica nova:
  if (autoWeight > manualWeight) → skip
  OU
  if (autoWeight == manualWeight E autoDate > manualDate) → skip
  OU  
  if (auto tem last_event_date mais recente que override.last_event_date) → skip
```

Concretamente, após a comparação de pesos IATA, adicionar:
- Extrair `row.last_event_date` (data do último evento automático)
- Comparar com `override.last_event_date`
- Se a data automática for estritamente mais recente e o status automático não for um tracking_failed, pular o override

**2. `supabase/functions/mariadb-proxy/index.ts` — FORCED_TIMELINES (~linha 7372)**

Aplicar a mesma lógica: antes de retornar a timeline forçada, verificar se existem eventos automáticos com data mais recente do que o último evento da timeline forçada. Se sim, retornar os dados automáticos em vez dos forçados.

### Resultado esperado
- Overrides manuais continuam funcionando para AWBs sem dados automáticos ou com dados automáticos mais antigos
- Quando o rastreio automático progride (novos eventos com datas mais recentes), os dados automáticos prevalecem automaticamente
- Não é necessário remover manualmente os overrides quando o rastreio automático se atualiza

