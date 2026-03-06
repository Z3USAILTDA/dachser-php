

# Fix: Timeline vazia para AWBs 724-86856405 e 724-13475593

## Diagnóstico

Testei a edge function diretamente e confirmei: retorna `{ data: [], success: true }`.

Os logs mostram:
```
Tracking: 3 valid events, 0 after ETD filter (cutoff=2026-03-06T00:00:00.000Z)
```

O problema está na linha 6270 do `mariadb-proxy/index.ts`. Quando o ETD é passado (ou hoje), o cutoff é definido como o próprio ETD sem nenhuma margem. Eventos pré-partida (BKD, RCS, FOH) naturalmente ocorrem **antes** do ETD, então `eventDate >= etdCutoff` filtra todos.

## Correção

### `supabase/functions/mariadb-proxy/index.ts` -- linha 6270

Subtrair 30 dias do ETD quando ele for passado, preservando eventos do ciclo atual:

```typescript
// Linha 6270 - Antes:
etdCutoff = etdDate;

// Depois:
etdCutoff = new Date(etdDate.getTime() - 30 * 24 * 60 * 60 * 1000);
```

Uma única linha. Isso mantém a filtragem de ciclos antigos mas preserva BKD, RCS, DEP, ARR e todos os eventos relevantes do embarque atual.

