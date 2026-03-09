

# Plan: Bulk Manual Update SEA Tracking — Batch 3

## Overview
Replace the `bulk_manual_update_sea` action body in `olimpo-proxy/index.ts` (lines 8139–8489) with a new batch of 17 MBLs, then deploy and invoke.

## MBLs and Data

| MBL | Container | Origin → Dest | Events | ETA |
|-----|-----------|---------------|--------|-----|
| HLCUSS5260113060 | HLXU1151169 | SANTOS → CALLAO | 7 | — |
| HLCUSS5260113960 | HLBU2612226 | SANTOS → RAUMA | 4 | 2026-04-01 |
| HLCUSS5260121101 | HAMU2779893 | SANTOS → RAUMA | 4 | 2026-04-01 |
| HLCUSS5260122210 | UETU6394599 | SANTOS → LONDON GATEWAY PORT | 2 | 2026-04-03 |
| HLCUSS5260124311 | HAMU4197269 | SANTOS → LONDON GATEWAY PORT | 4 | 2026-03-27 |
| HLCUSS5260145518 | HAMU3080283 | SANTOS → FREDERICIA | 2 | 2026-04-16 |
| HLCUSS5260165163 | FANU3483125 | SANTOS → HAMBURG | 4 | 2026-03-31 |
| HLCUSS5260165196 | HAMU2767892 | SANTOS → HAMBURG | 2 | 2026-04-07 |
| HLCUSS5260165203 | HAMU3816100 | SANTOS → HAMBURG | 1 | 2026-01-14 |
| HLCUSS5260165214 | HAMU4249974 | SANTOS → HAMBURG | 2 | 2026-04-07 |
| HLCUSS5260165225 | HAMU1789095 | SANTOS → HAMBURG | 1 | 2026-04-14 |
| HLCUSS5260200159 | HLBU1179153 | SANTOS → ALTAMIRA | 4 | 2026-03-21 |
| HLCUSS5260210144 | HAMU4376602 | SANTOS → DURBAN | 6 | — |
| HLCUSS5260210188 | HAMU2959540 | SANTOS → HAMBURG | 2 | — |
| HLCUSS5260210663 | HAMU2053344 | SANTOS → HAMBURG | 2 | — |
| HLCUSS5260210674 | FANU3835843 | SANTOS → HAMBURG | 2 | — |
| HLCUSS5260165196 duplicate? No, all unique.

## Changes

### `supabase/functions/olimpo-proxy/index.ts`
Replace lines 8139–8489 (old Batch 2 data) with Batch 3 logic:

For each MBL:
1. `updateMain` — set `container`, `origem`, `destino`, `eta` (where applicable)
2. `DELETE FROM t_tracking_sea_history WHERE mbl_id = ?`
3. `insertEvent` calls for each event with `source='MANUAL'`
4. `updateMain` — set `last_event`, `navio`, `container_status` from latest event

Note: HLCUSS5260210144 has transbordo info (Paranaguá 2026-03-07 07:42) — will be reflected in events (Vessel arrived + Discharged at PARANAGUA).

### Deploy & Invoke
Deploy updated `olimpo-proxy` and invoke `bulk_manual_update_sea` once.

