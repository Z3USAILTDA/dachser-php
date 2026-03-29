

## Corrigir divergência de status e remover badges de fonte

### Arquivos alterados

**2 arquivos:**
1. `src/pages/cct/ProcessoTimeline.tsx`
2. `src/components/cct/EventTimeline.tsx`

---

### Alteração 1 — `ProcessoTimeline.tsx` (linhas 69-74)

**O que muda:** O `effectiveStatus` deixa de usar `getLatestTimelineStatus` e passa a usar diretamente o status oficial do processo.

**Código atual:**
```typescript
// Derive effective status: always follow the most recent mapped event from timeline
const effectiveStatus = useMemo(() => {
  if (isLoadingEvents) return null;
  const baseStatus = processo?.status_atual?.status_cct_oficial || 'AGUARDANDO_MANIFESTACAO';
  return getLatestTimelineStatus(allEventos, baseStatus);
}, [allEventos, processo, isLoadingEvents]);
```

**Código novo:**
```typescript
// Use o status oficial do processo diretamente, igual ao dashboard
const effectiveStatus = useMemo(() => {
  return processo?.status_atual?.status_cct_oficial || 'AGUARDANDO_MANIFESTACAO';
}, [processo]);
```

Também remover o import de `getLatestTimelineStatus` (linha 33).

---

### Alteração 2 — `EventTimeline.tsx` (linhas 230-232)

**O que muda:** Remover o badge de fonte (`LeadComex`, `RFB`, etc.) de cada evento na timeline.

**Código atual:**
```tsx
<Badge variant="outline" className={cn("text-xs", fonte.color)}>
  {fonte.label}
</Badge>
```

**Código novo:** Remover essas 3 linhas. Nada mais muda no card do evento.

---

### O que NÃO muda

- Nenhum arquivo backend / edge function / SQL
- Nenhum dashboard, filtro, card, analytics
- Nenhum layout, cor, ordenação ou paginação
- Nenhuma variável, tipo ou interface renomeada
- O objeto `fonteConfig` permanece no arquivo (pode ser usado internamente)
- Texto, descrição, data/hora, aeroporto dos eventos permanecem intactos

