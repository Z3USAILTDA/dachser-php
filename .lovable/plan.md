

## Enriquecer containers de MSC, ONE, EVERGREEN, MAERSK não enriquecidos

### Abordagem

Adicionar um parâmetro `carrier_filter` ao `refresh_sea_tracking` existente, que filtra MBLs pelos prefixos dos armadores solicitados. O frontend (painel admin SEA) invocará em lotes via botão ou chamadas sequenciais.

### Alterações

**1. Backend — `olimpo-proxy/index.ts` → `refresh_sea_tracking`**

Aceitar novo query param `carrier_filter` (ex: `MSC,ONE,EVERGREEN,MAERSK`). Quando presente, adicionar filtro SQL na query de seleção de containers:

```sql
AND (
  UPPER(LEFT(t.mbl_id, 4)) IN ('MSCU','MEDU','MSCM','MSDU','MSCB','MSCR',
    'ONEY','ONEU','NYKU','MOLU','KKFU','MOAU','KKLU',
    'EISU','EITU','EGSU','EGHU','EMCU','EGLV',
    'MAEU','MRKU','MSKU','PONU','SEAU')
  OR UPPER(LEFT(t.mbl_id, 3)) IN ('MSC','ONE')
)
```

Adicionar também filtro para "não enriquecidos":
```sql
AND (container_status IS NULL OR container_status = '' OR container_status = 'PENDING')
```

Este filtro se aplica tanto na query `forceRefresh` quanto na query normal.

**2. Frontend — Painel Admin SEA ou chamada direta**

Criar uma nova action no painel administrativo marítimo (ou executar via `curl_edge_functions`) que chama `refresh_sea_tracking` em lotes sequenciais:

- Batch 1: `?action=refresh_sea_tracking&batch_size=15&carrier_filter=MSC,ONE,EVERGREEN,MAERSK&force=1`
- Repete até retornar 0 containers processados

Alternativa mais simples: adicionar um botão "Enriquecer Armadores Específicos" no painel admin que executa os lotes automaticamente com delay de 3s entre cada.

**3. Divisão em lotes**

O `refresh_sea_tracking` já tem `batch_size` e `max_time_ms`. Basta chamar repetidamente com `carrier_filter` até esgotar. O frontend fará loop:

```typescript
let hasMore = true;
while (hasMore) {
  const res = await fetch(`...?action=refresh_sea_tracking&batch_size=15&carrier_filter=MSC,ONE,EVERGREEN,MAERSK&force=1`);
  const data = await res.json();
  hasMore = (data.processed || 0) > 0;
  if (hasMore) await new Promise(r => setTimeout(r, 3000));
}
```

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/olimpo-proxy/index.ts` | Adicionar filtro `carrier_filter` nas queries de `refresh_sea_tracking` |
| `src/pages/sea/SeaTrackingPage.tsx` (ou componente admin) | Botão para disparar enriquecimento por armador em lotes |

