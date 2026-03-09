

# Plan: Bulk Manual Update SEA Tracking — Batch 2 (with inferred origins/destinations)

## Overview
Replace the `bulk_manual_update_sea` action in `olimpo-proxy/index.ts` with a new batch of 27 MBL updates. For MBLs without explicit origin/destination, values are inferred from the event chain (origin = port where vessel was loaded, destination = port of discharge/delivery).

## Inferred Origins and Destinations

| MBL | Origin (Loaded port) | Destination (Discharged port) |
|-----|---------------------|-------------------------------|
| HLCUBSC2512BQWF4 | NEW YORK, NY | SANTOS |
| HLCUBSC2512BXZT6 | NEW YORK, NY | SANTOS |
| HLCUBSC2601BKLC4 | NEW YORK, NY | SANTOS |
| HLCUGDY251224616 | GDYNIA | SANTOS |
| HLCUHAM251140437 | ROTTERDAM | PARANAGUA |
| HLCUHAM2511ATSA8 | HAMBURG | RIO GRANDE |
| HLCUHAM2511ATSF3 | HAMBURG | RIO GRANDE |
| HLCUHAM2511ATSK8 | HAMBURG | RIO GRANDE |
| HLCUHAM2511ATSS6 | HAMBURG | RIO GRANDE |
| HLCUHAM2511ATSX1 | HAMBURG | RIO GRANDE |
| HLCUHAM2511ATUC1 | HAMBURG | RIO GRANDE |
| HLCUHAM2511AUCB0 | HAMBURG | RIO GRANDE |
| HLCUHAM2511BFSV1 | ROTTERDAM | PARANAGUA |
| HLCUHAM2511BJAG8 | ROTTERDAM | PARANAGUA |
| HLCUHAM2511BKFF2 | ROTTERDAM | SANTOS |
| HLCUHAM251285730 | ROTTERDAM | SALVADOR |
| HLCUHAM251297195 | ANTWERP | RIO GRANDE |
| HLCUHAM260110572 | HAMBURG | RIO GRANDE |

## Changes

### `supabase/functions/olimpo-proxy/index.ts`
Replace the `bulk_manual_update_sea` case body with new batch data covering all 27 MBLs:

**Per MBL logic:**
1. `updateMain` — set `container`, `origem`, `destino`, `eta` (where applicable)
2. `DELETE FROM t_tracking_sea_history WHERE mbl_id = ?` — clear old events
3. `insertEvent` calls for each event with `source='MANUAL'`
4. `updateMain` — set `last_event`, `navio`, `container_status` from latest event

**All 27 MBLs with their full data:**

| MBL | Container | Origin → Dest | # Events | ETA |
|-----|-----------|---------------|----------|-----|
| HLCUBI1260201172 | — | VALENCIA → SANTOS | origin/dest only | — |
| HLCUBI1260201194 | — | VALENCIA → SANTOS | origin/dest only | — |
| HLCUBI1260201201 | — | VALENCIA → SANTOS | origin/dest only | — |
| HLCUBSC2512BQWF4 | BSIU8284765 | NEW YORK → SANTOS | 12 | — |
| HLCUBSC2512BXZT6 | FDCU0076808 | NEW YORK → SANTOS | 12 | — |
| HLCUBSC260151114 | HLBU3885740 | CHARLESTON → SANTOS | 4 | — |
| HLCUBSC2601BKLC4 | HLXU1113512 | NEW YORK → SANTOS | 12 | — |
| HLCUGDY251224616 | — | GDYNIA → SANTOS | 12 | — |
| HLCUHAM251140437 | BEAU4991522 | ROTTERDAM → PARANAGUA | 8 | — |
| HLCUHAM2511ATSA8 | HLBU2813832 | HAMBURG → RIO GRANDE | 10 | — |
| HLCUHAM2511ATSF3 | HLBU2813832 | HAMBURG → RIO GRANDE | 10 | — |
| HLCUHAM2511ATSK8 | HAMU1807075 | HAMBURG → RIO GRANDE | 10 | — |
| HLCUHAM2511ATSS6 | BEAU4707339 | HAMBURG → RIO GRANDE | 8 | — |
| HLCUHAM2511ATSX1 | FANU3587367 | HAMBURG → RIO GRANDE | 9 | — |
| HLCUHAM2511ATUC1 | HAMU3590250 | HAMBURG → RIO GRANDE | 10 | — |
| HLCUHAM2511AUCB0 | HAMU3590250 | HAMBURG → RIO GRANDE | 10 | — |
| HLCUHAM2511BFSV1 | HLBU3777935 | ROTTERDAM → PARANAGUA | 8 | — |
| HLCUHAM2511BJAG8 | HAMU1133790 | ROTTERDAM → PARANAGUA | 8 | — |
| HLCUHAM2511BKFF2 | FCIU7099723 | ROTTERDAM → SANTOS | 8 | — |
| HLCUHAM251285730 | HLXU3723155 | ROTTERDAM → SALVADOR | 6 | — |
| HLCUHAM251297195 | HLBU1518600 | ANTWERP → RIO GRANDE | 8 | — |
| HLCUHAM260110572 | BEAU5005717 | HAMBURG → RIO GRANDE | 9 | — |
| HLCUSS5251266812 | HAMU3894715 | SANTOS → HAMBURG | 4 | 2026-03-25 |
| HLCUSS5251266834 | HAMU1923120 | SANTOS → HAMBURG | 4 | 2026-03-25 |
| HLCUSS5251266845 | FANU3591048 | SANTOS → HAMBURG | 4 | 2026-03-25 |
| HLCUSS5251266856 | FANU3591048 | SANTOS → HAMBURG | 4 | 2026-03-25 |
| HLCUSS5251266867 | HAMU2582287 | SANTOS → HAMBURG | 4 | 2026-03-25 |

### Deploy & Invoke
Deploy updated `olimpo-proxy` and invoke `bulk_manual_update_sea` once.

