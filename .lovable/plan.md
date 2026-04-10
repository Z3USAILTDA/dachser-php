

## Diagnóstico: Coluna SLA vazia no /air/tracking-aereo

### Causa Raiz

O campo `hours_in_status` **nunca é preenchido**. Ele existe na interface `AWBData` (linha 227), mas:

1. A Edge Function `fetch-tracking-aereo` não calcula nem retorna `hours_in_status`
2. O mapeamento no frontend (linhas 345-368) não o popula — o campo fica `undefined`
3. Na renderização (linha 920), `hours == null` é sempre verdadeiro → exibe "—"

Para processos pós-chegada (ARR, DLV, etc.), o SLA mostra "✓" corretamente porque essa verificação ocorre **antes** do check de `hours_in_status`.

### Solução

Calcular `hours_in_status` no frontend durante o mapeamento dos dados, usando `last_event_date` (que já vem da Edge Function):

**Arquivo: `src/pages/air/TrackingAereo.tsx`** (no bloco de mapeamento, ~linha 356)

Adicionar cálculo:
```typescript
hours_in_status: (() => {
  const eventDate = item.last_event_date;
  if (!eventDate) return null;
  const diff = Date.now() - new Date(eventDate).getTime();
  return diff > 0 ? diff / (1000 * 60 * 60) : null;
})(),
```

Isso calcula as horas decorridas desde o último evento até agora, que é exatamente o que `fetch-status-aereo` faz para a tela `/air/tracking`.

### Resumo
| Local | Alteração |
|-------|-----------|
| `TrackingAereo.tsx` mapeamento | Adicionar cálculo de `hours_in_status` a partir de `last_event_date` |

Uma única linha de lógica. Nenhuma alteração no backend.

