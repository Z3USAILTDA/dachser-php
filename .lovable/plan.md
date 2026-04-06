

## Plano: Reativar conexão ao banco em /air/tracking-aereo

### Problema

A função `fetchData` em `TrackingAereo.tsx` (linha 328-355) está com o código de conexão comentado e apenas seta `setAwbsData([])`. O bloco comentado tem `... todo o mapeamento ...` como placeholder — o mapeamento real foi perdido.

### Solução

Reconstruir o `fetchData` baseado na resposta do edge function `fetch-tracking-aereo`, que retorna objetos com campos: `awb_number`, `hawb_number`, `consignee_nome`, `clerk`, `origin`, `destination`, `timeline_json`, `last_event`, `last_event_description`, `last_status_code`, `last_event_date`, `last_event_location`, `penultimate_location`.

**Arquivo: `src/pages/air/TrackingAereo.tsx`** — linhas 328-355

Substituir o `fetchData` comentado por:

```typescript
const fetchData = useCallback(async () => {
  setIsLoadingData(true);
  try {
    const { data, error } = await supabase.functions.invoke("fetch-tracking-aereo");
    if (error) {
      console.error("Error fetching tracking aereo:", error);
      return;
    }
    if (data?.success && data?.data) {
      const converted: AWBData[] = data.data.map((item: any, index: number) => ({
        id: `tracking-${item.awb_number || index}-${index}`,
        awb: item.awb_number || "",
        hawb: item.hawb_number || "-",
        airline_code: (item.awb_number || "").substring(0, 3),
        consignee_name: item.consignee_nome || "-",
        nome_analista: item.clerk || "-",
        origem: item.origin || "N/A",
        destino: item.destination || "N/A",
        last_event: item.last_event || "-",
        status: item.last_event || "-",
        last_event_date: item.last_event_date || null,
        last_event_location: item.last_event_location || "",
        penultimate_location: item.penultimate_location || "",
        timeline_json: item.timeline_json || [],
        tipo_servico: "N/A",
        tipo_processo: null,
        pieces_discrepancy: false,
        baseline_pieces: null,
        has_dis_event: false,
        tracking_failed: !item.last_event,
      }));

      // Dedup by awb|hawb
      const deduped = converted.reduce((acc: AWBData[], cur) => {
        const key = `${cur.awb}|${cur.hawb || "-"}`;
        const existingIdx = acc.findIndex(i => `${i.awb}|${i.hawb || "-"}` === key);
        if (existingIdx === -1) {
          acc.push(cur);
        } else {
          // Keep most recent
          const existing = acc[existingIdx];
          if ((cur.last_event_date || "") > (existing.last_event_date || "")) {
            acc[existingIdx] = cur;
          }
        }
        return acc;
      }, []);

      setAwbsData(deduped);
    }
  } catch (error) {
    console.error("Error in fetchData:", error);
  } finally {
    setIsLoadingData(false);
  }
}, []);
```

Também enriquecer com discrepância de peças usando a função `checkTimelineDiscrepancy` já existente no componente, aplicando-a a cada item após a conversão.

### Arquivo alterado
- `src/pages/air/TrackingAereo.tsx` — função `fetchData` (linhas 328-355)

