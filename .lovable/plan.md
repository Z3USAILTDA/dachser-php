

## Plano Completo — Ajustes em `/air/tracking-aereo`

**Arquivo único:** `src/pages/air/TrackingAereo.tsx`

---

### 1. Ordenação padrão — mais recentes primeiro

No `filteredAwbs` (linha ~484), quando **nenhum sort manual** está ativo (`sortAwb`, `sortClient`, `sortAnalyst`, `sortLastCheck` todos `null`), aplicar ordenação default por `last_event_date` DESC. AWBs sem data vão para o final.

```typescript
// Após o bloco de sorting existente (linha ~484), adicionar else final:
} else {
  awbs = [...awbs].sort((a, b) => {
    const dA = a.last_event_date ? new Date(a.last_event_date).getTime() : 0;
    const dB = b.last_event_date ? new Date(b.last_event_date).getTime() : 0;
    return dB - dA; // mais recentes primeiro
  });
}
```

---

### 2. AWB "NI" → Inválido

No `fetchData` (linhas ~339-360), **antes** de montar o objeto retornado:

- Se `awbNumber === "NI"`: forçar `lastEvent = "AWB Invalido"` e adicionar campo `is_invalid: true`

Na interface `AWBData` (declarada inline no arquivo), adicionar campos opcionais `is_invalid?: boolean` e `tracking_failed?: boolean`.

No **render da tabela**:
- Coluna **Último Evento** (linha ~755): se `awb.is_invalid`, mostrar badge vermelho "AWB Inválido"
- Coluna **Situação** (linha ~770): se `awb.is_invalid`, mostrar badge vermelho "Inválido"

No **cardCounts** (linha ~428): pular processos com `is_invalid` (não contar no total).

No **filteredAwbs** (linha ~441): ocultar processos inválidos por padrão (mostrar apenas quando buscados, igual DLV).

---

### 3. last_event null ou mensagens de falha do scraper → "Falha do Rastreio"

**Constante de mensagens de falha** (topo do arquivo):

```typescript
const SCRAPER_FAILURE_DESCRIPTIONS = [
  "O site da operadora está fora do ar, tente novamente mais tarde",
  "Não foi possível detectar a operadora para o seu número de rastreamento",
];
```

**Helper `hasScraperFailure`**:

```typescript
function hasScraperFailure(timeline: any[]): boolean {
  if (!timeline || timeline.length === 0) return false;
  return timeline.some((evt: any) =>
    SCRAPER_FAILURE_DESCRIPTIONS.some(msg => evt.description?.includes(msg))
  );
}
```

No `fetchData` (linhas ~335-360):
- Se `lastEvent` é falsy (null/vazio) **OU** `hasScraperFailure(timeline)` é true:
  - Marcar `tracking_failed: true`
  - Forçar `lastEvent = "Falha do Rastreio"`

No **render da tabela**:
- Coluna **Último Evento**: se `awb.tracking_failed`, mostrar badge laranja/vermelho com `AlertTriangle` e texto "Falha do Rastreio"
- Coluna **Situação**: se `awb.tracking_failed`, mostrar badge vermelho "Falha"
- Barra de progresso: mantém 0% (pois `last_event` original era null)

No **cardCounts**: contar `tracking_failed` como **crítico**.

No **filteredAwbs** card filter `"criticos"`: incluir `awb.tracking_failed`.

---

### 4. Alerta por e-mail para falhas de rastreio

Adicionar um `useEffect` que, quando `awbsData` mudar e contiver AWBs com `tracking_failed: true`, invoca a edge function existente:

```typescript
useEffect(() => {
  const failedAwbs = awbsData.filter(a => a.tracking_failed);
  if (failedAwbs.length === 0) return;
  supabase.functions.invoke("air-tracking-failed-alert").catch(console.error);
}, [awbsData]);
```

A edge function `air-tracking-failed-alert` já existe e faz a deduplicação (só alerta AWBs novos), então não precisa de alteração.

---

### Resumo das mudanças no arquivo

| Mudança | Local aproximado |
|---------|-----------------|
| Constante `SCRAPER_FAILURE_DESCRIPTIONS` | Topo, após helpers existentes |
| Helper `hasScraperFailure()` | Topo, junto dos helpers |
| Campos `is_invalid`, `tracking_failed` no tipo AWBData | Declaração do tipo (~linha 175) |
| AWB "NI" → inválido no `fetchData` | Linhas ~335-340 |
| last_event null / scraper failure → tracking_failed no `fetchData` | Linhas ~335-340 |
| Pular inválidos e contar falhas como crítico no `cardCounts` | Linhas ~428-437 |
| Ocultar inválidos sem busca no `filteredAwbs` | Linha ~443 |
| Incluir `tracking_failed` no filtro de críticos | Linha ~465 |
| Ordenação default DESC por data | Linha ~484 |
| Render: badges de "AWB Inválido" / "Falha do Rastreio" | Linhas ~755-786 |
| `useEffect` para invocar `air-tracking-failed-alert` | Após `useEffect` de fetch |

**Nenhum outro arquivo será alterado.**

