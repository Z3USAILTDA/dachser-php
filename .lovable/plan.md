

# Plan: Atualização Manual de Processos SEA Tracking

## Overview
Create a new `bulk_manual_update_sea` action in the `olimpo-proxy` edge function that will execute all the manual updates to `t_tracking_sea` and `t_tracking_sea_history` tables in MariaDB. Also remove the IMO auto-populate message from the VesselFinder map component.

## Changes

### 1. Remove IMO message (`src/components/tracking/VesselFinderMap.tsx`)
Remove the text "O IMO será populado automaticamente na próxima sincronização" from the vessel map component.

### 2. New action `bulk_manual_update_sea` in `olimpo-proxy/index.ts`
Add a new action that executes the following SQL operations in sequence:

**a) Insert new events into `t_tracking_sea_history`** (source: 'MANUAL') for each MBL listed:

| MBL | Events |
|-----|--------|
| HLCUSS5260125917 | Loaded SANTOS 2026-03-01 07:32 + Vessel departed SANTOS 2026-03-01 17:39 (MAERSK MONTE ALEGRE) |
| HLCUBKK260145016 | Loaded YANTIAN 2026-03-03 13:03 + Vessel departed YANTIAN 2026-03-03 20:35 (ZIM BANGKOK) |
| HLCUBKK260146220 | Same as above + update origem/destino to LAEM CHABANG / SANTOS |
| HLCUBKK260144320 | Loaded YANTIAN 2026-03-03 16:43 + Vessel departed YANTIAN 2026-03-03 20:35 (ZIM BANGKOK) |
| HLCUBKK260143931 | Same events as HLCUBKK260144320 |
| HLCUSZX2601BTMJ8 | Departure from SANTOS 2026-03-04 04:19 (Truck) |
| HLCUVL1260108963 | Replace all events → Vessel departed VALENCIA 2026-02-08 05:15 (MSC ANTIGUA) |
| HLCUSS5260153330 | Vessel arrived CARTAGENA 2026-02-21 02:53 + Discharged CARTAGENA 2026-02-21 05:46 (DALIAN EXPRESS) |
| HLCUSS5251264397 | Vessel arrived NEW YORK 2026-03-03 15:42 + Discharged NEW YORK 2026-03-04 02:20 (WIELAND) |
| HLCUIZ1260200160 | 3 events: Arrival in LIVORNO, Loaded LIVORNO, Vessel departed LIVORNO (MSC CADIZ) |
| HLCUHAM2512ATNT8 | Vessel arrived RIO GRANDE + Discharged RIO GRANDE (MSC INSA) |
| HLCUSS5251264386 | Clean up duplicates - keep only 'Vessel departed' status |
| HLCUBC1251213949 | Update container to GCXU 2194037 + 8 full events |
| HLCUBI1260201172 | Update container to HAMU 3433267 + 7 events |
| HLCUBI1260201194 | Update container to HLBU 1759059 + 7 events + ETA 2026-03-10 |
| HLCUBI1260201201 | Update container to FANU 1038748 + 7 events + ETA 2026-03-10 |
| HLCUBSC251212360 | Update container to FANU 3088183 + 12 full events |
| HLCUBSC251286321 | Update container to CAIU 6986670 + 8 full events |

**b) Update `t_tracking_sea`** main table:
- Update `last_event` to match latest event description
- Update `container` where specified
- Update `origem`/`destino` for HLCUBKK260146220
- Update `eta` for HLCUBI1260201194 and HLCUBI1260201201
- Update `navio` to latest vessel name

**c) For HLCUVL1260108963**: Delete existing events and insert the correct single event.

**d) For HLCUSS5251264386**: Remove duplicate events, keep only 'Vessel departed'.

### 3. Deploy and invoke
Deploy the updated `olimpo-proxy` edge function, then invoke the `bulk_manual_update_sea` action once to apply all changes. The action will be a one-time operation.

## Technical Details
- All event inserts use `INSERT IGNORE` on the unique index `(mbl_id, container, event_code, event_datetime)` to avoid duplicates
- Event codes mapped: Loaded→CRG, Vessel departed→DEP, Vessel arrived→ARR, Discharged→DCH, Arrival in→ARR, Departure from→DEP, Gate out empty→GOE, Gate in empty→GIE, Loaded→CRG
- Container updates use `UPDATE t_tracking_sea SET container = ? WHERE mbl_id = ?`
- Source field set to 'MANUAL' for all inserted events

