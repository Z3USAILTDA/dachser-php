

## Problema

O processo `045-14377845` não tem `dep_datetime` porque a lógica atual (linha 3127) usa `scraped_at` como proxy para `dep_datetime`. Porém `scraped_at` é apenas o timestamp de quando o registro foi coletado — não a data real de decolagem. Se o AWB já avançou para outro status (ARR, RCF, etc.), o `scraped_at` reflete esse status posterior, e para AWBs cujo snapshot DEP não foi capturado, o campo fica nulo.

A tabela `t_aereo_ws_firecrawl` tem a coluna `timeline_json` com todos os eventos incluindo DEP com data/hora real. Essa informação já existe mas não está sendo utilizada no Step 1 do `get_cct_shipments`.

## Solução

### Backend: `supabase/functions/mariadb-proxy/index.ts`

**1. Step 1 (linhas 3029-3041):** Incluir `timeline_json` no SELECT da query de AWBs válidos:

```sql
SELECT ws.awb, ws.last_status_code, ws.origin, ws.destination, ws.scraped_at, ws.timeline_json
FROM ...
```

**2. Após o Step 1 (linhas 3044-3049):** Criar helper para extrair data do DEP da timeline e guardar no `awbStatusMap`:

```typescript
function extractDepDateFromTimeline(timelineJson: any): string | null {
  try {
    const timeline = typeof timelineJson === 'string' ? JSON.parse(timelineJson) : timelineJson;
    if (!Array.isArray(timeline)) return null;
    // Procurar evento DEP na timeline
    const depEvent = timeline.find((evt: any) => {
      const code = (evt.status || evt.code || evt.milestone || '').toUpperCase();
      return code === 'DEP' || code === 'DEPARTED';
    });
    if (depEvent) {
      return depEvent.date || depEvent.datetime || depEvent.timestamp || depEvent.time || null;
    }
    return null;
  } catch { return null; }
}
```

Ao popular `awbStatusMap`, extrair e guardar `dep_date_from_timeline`:

```typescript
for (const snap of (validAwbs || [])) {
  const depDate = extractDepDateFromTimeline(snap.timeline_json);
  awbStatusMap.set((snap.awb || '').trim(), { ...snap, dep_date_from_timeline: depDate });
}
```

**3. Step 2 merge (linha 3127):** Usar a data do DEP extraída da timeline como fonte primária, com `scraped_at` como fallback:

```typescript
dep_datetime: awbInfo?.dep_date_from_timeline || awbInfo?.scraped_at || null,
```

### Resultado

- AWBs com DEP na timeline terão `dep_datetime` correto (data real de decolagem)
- AWBs sem DEP na timeline continuam usando `scraped_at` como fallback
- SLA será calculado com a data correta de decolagem
- Impacto mínimo: apenas uma coluna extra no SELECT e parsing leve do JSON

