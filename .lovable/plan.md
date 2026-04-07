

## Plano: Ocultar ARR no destino após 5 dias + Corrigir bug ARR - DESTINO

### Problema 1: Bug — ARR nunca é classificado como "ARR - DESTINO"

O edge function `fetch-tracking-aereo` resolve descrições como "ARRIVED" para o código genérico `"ARR"`, sem distinguir se a carga chegou no **destino final** ou em uma **conexão**. O campo `destination` e `last_event_location` estão disponíveis na resposta, mas nunca são comparados.

Como resultado, processos que já chegaram no destino final aparecem como "ARR" em vez de "ARR - DESTINO", impedindo qualquer lógica de ocultação baseada nesse status.

### Problema 2: Processos ARR - DESTINO devem sumir após 5 dias

Processos com status "ARR - DESTINO" devem permanecer visíveis por apenas 5 dias após a data do evento. Após isso, devem ser ocultados automaticamente (mas ainda acessíveis via busca, como já funciona com DLV).

### Solução

**1. Edge function `fetch-tracking-aereo` — Enriquecer ARR com sufixo**

Após resolver o `finalCode`, se o código for `"ARR"`, comparar `last_event_location` com `destination`:
- Se `loc0` (normalizado, 3 chars) == `destination` → `finalCode = "ARR - DESTINO"`
- Se diferente e `destination` não é vazio → `finalCode = "ARR - CONEXÃO"`
- Se `destination` está vazio, manter `"ARR"`

Inserir esta lógica após a linha 259 (após determinar o `finalCode`), antes de montar o objeto `normalized`.

**2. Front-end `TrackingAereo.tsx` — Ocultar ARR - DESTINO após 5 dias**

No `filteredAwbs` (useMemo), após o bloco que oculta DLV, adicionar:

```typescript
const isArrDestino = code === "ARR - DESTINO";
if (isArrDestino && !searchTerm && awb.last_event_date) {
  const eventDate = parseDBDate(awb.last_event_date);
  if (eventDate) {
    const diffDays = (Date.now() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 5) return false;
  }
}
```

### Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — lógica de sufixo ARR → ARR - DESTINO / ARR - CONEXÃO
- `src/pages/air/TrackingAereo.tsx` — filtro de ocultação no `filteredAwbs`

