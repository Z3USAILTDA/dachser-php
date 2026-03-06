

# Tratar UNK como status inválido e aplicar fallback + "Sem informação"

## Problema

Quando os eventos da timeline resultam em `codigo_evento === 'UNK'` (código não reconhecido), o sistema mostra o AWB com status UNK em vez de buscar no fallback (`t_aereo_api`) ou marcar como "Sem informação na companhia aérea". Dois cenários:

1. **Após filtragem, todos os eventos ficam com UNK**: O check `allAreErrors` (linha 6162) acontece ANTES da filtragem de datas, então não captura o caso onde após filtrar eventos futuros/null, sobram apenas UNKs.
2. **Após filtragem, lista fica vazia**: O código retorna `data: []` sem `tracking_failed: true`, fazendo o AWB desaparecer.

## Correção — `supabase/functions/mariadb-proxy/index.ts`

### 1. Após o filtro de eventos (depois da linha 6350), adicionar re-check

Depois de computar `filteredEvents` e antes de injetar eventos sintéticos (linha 6354), verificar se:
- `filteredEvents` está vazio, OU
- Todos os eventos restantes têm `codigo_evento === 'UNK'`

Se sim, retornar `{ success: true, data: filteredEvents, tracking_failed: true }`.

```typescript
// After line 6352 (after filteredEvents is computed)
const allUnkOrEmpty = filteredEvents.length === 0 || 
  filteredEvents.every((e: any) => e.codigo_evento === 'UNK');

if (allUnkOrEmpty) {
  console.log(`Tracking failed for AWB ${queryAwb}: all events are UNK or empty after filtering`);
  result = { success: true, data: filteredEvents, tracking_failed: true };
  break;
}
```

### 2. No frontend (Index.tsx), UNK já está em `allowedStatuses` e `tracking_failed` já mostra "Sem informação na companhia aérea"

Nenhuma mudança necessária no frontend — o bypass de `tracking_failed` (já implementado) e o badge "Sem informação na companhia aérea" já cobrem esse caso.

Uma mudança, um arquivo (`mariadb-proxy/index.ts`).

