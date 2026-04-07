

## Plano: Ocultar processos que chegaram ao destino há mais de 5 dias

### Problema real

A lógica atual só oculta processos cujo status final é exatamente `"ARR - DESTINO"`. Porém, muitos processos já passaram do ARR (evoluíram para RCF, NFD, FOH, etc.), então o `finalCode` nunca é `"ARR"` e o enriquecimento nunca dispara. O processo 045-21167786 provavelmente tem status RCF ou NFD, mas na timeline já teve um ARR no destino há mais de 5 dias.

### Solução

Mudar a abordagem: em vez de depender do `finalCode`, **escanear a timeline inteira** procurando um evento de chegada (ARRIVED) no aeroporto de destino. Se encontrado e a data for há mais de 5 dias, marcar o processo para ocultação.

### Alterações

**1. Edge function `fetch-tracking-aereo/index.ts`**

Adicionar um novo campo `arr_destino_date` no objeto `normalized`:
- Percorrer toda a `timeline` procurando eventos com descrição contendo "ARRIVED" cuja localização (3 chars) bata com `DESTINO`
- Se encontrado, extrair a data desse evento e salvar em `arr_destino_date`
- Manter o enriquecimento ARR → ARR - DESTINO existente (não remover)

```typescript
// After timeline parse, scan for ARR at destination
let arrDestinoDate: string | null = null;
const destUpper = (row.DESTINO || "").toUpperCase().trim().substring(0, 3);
if (destUpper && timeline.length > 0) {
  for (const evt of timeline) {
    const desc = (evt.description || "").toUpperCase();
    const evtLoc = (evt.location || "").toUpperCase().trim().substring(0, 3);
    if (desc.includes("ARRIVED") && evtLoc === destUpper) {
      const d = (evt.date || "").trim();
      if (d) { arrDestinoDate = d; break; }
    }
  }
}
// Add to normalized object:
// arr_destino_date: arrDestinoDate,
```

**2. Front-end `TrackingAereo.tsx`**

- Mapear o novo campo `arr_destino_date` no `fetchData`
- No `filteredAwbs`, substituir a lógica atual de ocultação por ARR - DESTINO:

```typescript
// Hide processes where ARR at destination happened > 5 days ago
if (!searchTerm && awb.arr_destino_date) {
  const arrDate = parseDBDate(awb.arr_destino_date);
  if (arrDate) {
    const diffDays = (Date.now() - arrDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 5) return false;
  }
}
```

Isso cobre **todos** os processos que já tiveram ARR no destino, independente do status atual (RCF, NFD, FOH, etc.).

### Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — novo campo `arr_destino_date`
- `src/pages/air/TrackingAereo.tsx` — mapear campo e ajustar filtro de ocultação

