
# Filtrar Timeline por ETD: Eventos a partir de 5 dias antes do ETD

## Resumo

A timeline do modal (`AwbTimelineModal`) exibe todos os eventos históricos do AWB, incluindo eventos muito antigos de voos anteriores. A solução usa o `etd` da `t_master_dados` como âncora temporal: apenas eventos a partir de `ETD - 5 dias` serão retornados e processados.

Sem badge informativo no modal — o filtro é silencioso, apenas nos dados.

---

## Alterações necessárias

### 1. `supabase/functions/fetch-status-aereo/index.ts`

**Query do `t_master_dados`** (linha 366): adicionar `etd` na seleção:
```sql
SELECT DISTINCT TRIM(mawb) as mawb, TRIM(hawb) as hawb,
       cliente, nome_analista, email_analista, emails_cliente,
       tipo_processo, tipo_servico,
       etd   -- NOVO
FROM t_master_dados ...
```

**`detectPiecesDiscrepancy`** (linha 149): aceitar `etdStr: string | null` como segundo parâmetro. Antes de processar os eventos cronologicamente, calcular `cutoff = etd - 5 dias` e filtrar eventos anteriores:
```typescript
function detectPiecesDiscrepancy(timelineJson: string | null, etdStr?: string | null) {
  ...
  const cutoff = etdStr ? new Date(new Date(etdStr).getTime() - 5 * 24 * 60 * 60 * 1000) : null;
  const chronological = [...events]
    .reverse()
    .filter(ev => {
      if (!cutoff) return true;
      const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || null;
      if (!ts) return true;
      return new Date(ts) >= cutoff;
    });
  ...
}
```

**`processedRows`** (linha 418): incluir `etd` no objeto de cada AWB processado:
```typescript
const etdRaw = masters && masters.length > 0 ? (masters[0].etd || null) : null;
const baseRow = {
  ...
  etd: etdRaw,  // NOVO
};
```

Chamada do `detectPiecesDiscrepancy` (linha 412): passar o `etd` do master:
```typescript
const etdForDiscrepancy = masters && masters.length > 0 ? (masters[0].etd || null) : null;
const { pieces_discrepancy, baseline_pieces, has_dis_event } = detectPiecesDiscrepancy(timelineStr, etdForDiscrepancy);
```

---

### 2. `supabase/functions/mariadb-proxy/index.ts` — action `get_awb_tracking_events` (linha 5770)

Após buscar o registro de `t_aereo_ws`, fazer uma query adicional ao `t_master_dados` para obter o `etd`:
```sql
SELECT etd FROM t_master_dados
WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
  AND etd IS NOT NULL
ORDER BY data_insert DESC LIMIT 1
```

Após construir `validEvents` e antes de retornar, aplicar o filtro temporal:
```typescript
// Buscar ETD do t_master_dados
let etdCutoff: Date | null = null;
try {
  const etdRows = await client.query(`
    SELECT etd FROM ${database}.t_master_dados
    WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
      AND etd IS NOT NULL
    ORDER BY data_insert DESC LIMIT 1
  `, [queryAwb]);
  
  if (etdRows && etdRows.length > 0 && etdRows[0].etd) {
    const etdDate = new Date(etdRows[0].etd);
    etdCutoff = new Date(etdDate.getTime() - 5 * 24 * 60 * 60 * 1000); // ETD - 5 dias
    console.log(`ETD cutoff for AWB ${queryAwb}: ${etdCutoff.toISOString()}`);
  }
} catch (etdErr) {
  console.log(`Could not fetch ETD for AWB ${queryAwb}:`, etdErr);
}

// Aplicar filtro temporal
const filteredEvents = etdCutoff
  ? validEvents.filter((e: any) => {
      if (!e.data_hora_evento) return true; // sem data, manter por segurança
      return new Date(e.data_hora_evento) >= etdCutoff!;
    })
  : validEvents;
```

Retornar `filteredEvents` em vez de `validEvents`.

---

### 3. `src/pages/Index.tsx`

**Interface `AWBData`** (linha 373): adicionar campo `etd`:
```typescript
etd?: string | null;
```

**Conversão dos dados** (linha 517): mapear `etd` do item retornado:
```typescript
etd: item.etd || null,
```

**`timelineModal` state** (linha 434): adicionar `etd`:
```typescript
const [timelineModal, setTimelineModal] = useState<{
  open: boolean; awb: string; consigneeName: string; etd?: string | null;
}>({ open: false, awb: "", consigneeName: "", etd: null });
```

**Botão Ver Timeline** (linha 2868): passar `etd`:
```typescript
setTimelineModal({
  open: true,
  awb: awb.awb,
  consigneeName: awb.consignee_name,
  etd: awb.etd || null,  // NOVO
})
```

Nenhuma mudança no `<AwbTimelineModal>` renderizado — `etd` não é necessário no modal pois o filtro já vem pronto do backend.

---

## Comportamento do fallback

| Situação | Resultado |
|---|---|
| ETD presente na `t_master_dados` | Filtro aplicado: apenas eventos >= ETD - 5 dias |
| ETD ausente ou nulo | Sem filtro — todos os eventos exibidos normalmente |
| Evento sem data (`data_hora_evento` nulo) | Evento mantido (seguro) |
| AWB não encontrado no `t_master_dados` | Sem filtro |

## Impacto

- Sem alteração visual no modal
- Timeline exibe apenas eventos relevantes ao embarque atual
- Discrepâncias de peças só consideram eventos do período correto, eliminando falsos positivos de embarques antigos
- Dois arquivos de edge function + um arquivo frontend
