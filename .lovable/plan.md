

## Plano: Corrigir processos MSC que ainda mostram "Aguardando"

### Problema
Processos atualizados pelo batch MSC ainda aparecem como "Aguardando" (AGD) por duas falhas de mapeamento:

1. **Backend (`sea-msc-batch-update`)** — O `resolveContainerStatus` não mapeia `GIO`, `GOE`, `BKG` corretamente, caindo no `default: 'AGD'`.
2. **Frontend (`ContainerTracking.tsx`)** — O `getReportStatus` não reconhece descrições MSC no campo `last_event` (ex: "Export Loaded on Rail", "Full Transshipment Discharged"), resultando em fallback para AGD.

### Correções

#### 1. Backend — `supabase/functions/sea-msc-batch-update/index.ts`
Atualizar o `switch` em `resolveContainerStatus` para mapear corretamente:
- `GIO` → `'GIO'`
- `GOE` → `'CLT'`
- `BKG` → `'BKG'`
- `STATUS_UPDATE` → manter `'AGD'` apenas como último recurso

#### 2. Frontend — `src/pages/ContainerTracking.tsx`
Adicionar reconhecimento de descrições MSC no `getReportStatus` via `lastEvent.toLowerCase().includes(...)`:
- "loaded on vessel" → CRG
- "received at cy/origin" → GIO
- "transshipment" → TSP
- "discharged from vessel" → DCH
- "available for delivery" / "carrier release" → INS
- "import to consignee" → GOD
- "empty received" → DLV
- "empty to shipper" → CLT
- "loaded on rail/barge" → CRG
- "start export cycle" → BKG

#### 3. Re-processar todos os MBLs MSC
Após deploy das correções, re-executar o batch para os ~130 MBLs (offsets 0–130, limit 15) para atualizar o `container_status` no banco.

### Arquivos alterados
- `supabase/functions/sea-msc-batch-update/index.ts`
- `src/pages/ContainerTracking.tsx`

