

# Plan: Add "Sem informação no armador" Badge to Sea Tracking

## Overview
Add a styled warning badge (matching the air tracking pattern) for MBLs with `container_status = 'NAO_ENCONTRADO'` or `last_event` containing "Sem informação" in the sea tracking table.

## Changes

### `src/pages/ContainerTracking.tsx`

1. **Add a new report status** for `NAO_ENCONTRADO` in `REPORT_STATUSES`:
   - Code: `'SIA'` (Sem Informação no Armador)
   - Label: `'Sem informação no armador'`
   - Color: `'#ef4444'` (red)
   - etapaIndex: 0

2. **Map the event** in `EVENT_TO_REPORT_STATUS`:
   - `'SEM_INFORMAÇÃO_NO_ARMADOR'` → `'SIA'`

3. **Render a styled badge** in the status column (where `statusCode` is rendered, around line 2341):
   - When `statusCode === 'SIA'` or `mbl.container_status === 'NAO_ENCONTRADO'`, render a badge similar to the air tracking:
     ```tsx
     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 cursor-help">
       <AlertTriangle className="h-3 w-3" />
       Sem informação no armador
     </span>
     ```
   - Wrap in a Tooltip with message: "Não foi possível obter dados de rastreio no armador. Nova consulta programada automaticamente."

4. **Replace the timeline progress bar** for these MBLs — instead of showing the ship progress bar, show the badge directly or a flat gray bar.

