

## Problem Analysis

Two AWBs (125-21258182, 724-86856405) show incorrect status in the Air Tracking overview because the ZEUS scraper stored `last_status_code: "UNK"` and the fallback function `resolveUnkFromTimeline` resolves to the wrong IATA code.

**AWB 724-86856405**: Most recent timeline event is `"AWB Documentation has been received at GRU"`. This is an **AWR** event (documents received), but `AWR` is not in the `statusMap`, so the generic regex `/\breceived\b/i` catches it and maps it to **RCF** (wrong). The actual most advanced status in the timeline is ARR at GRU (destination).

**AWB 125-21258182**: Most recent timeline event is `"Consignee informed"`. This is an **NFD** event, but there's no pattern matching "consignee informed" in `descPatterns`. The function skips it and picks "Received on flight" → **RCF** via `/\breceived\b/i`. The actual most advanced status should be NFD.

**Root Cause**: `resolveUnkFromTimeline` picks the **first chronologically resolvable** event. Two problems:
1. Missing pattern mappings cause wrong events to be picked
2. Chronological ordering can pick a less-advanced status when a more specific event isn't recognized

## Fix (in `supabase/functions/fetch-status-aereo/index.ts`)

### 1. Add missing statusMap entries
```typescript
'AWR': 'AWR', 'DOCUMENTS RECEIVED': 'AWR',
```

### 2. Add missing descPatterns (BEFORE the generic `/\breceived\b/i`)
```typescript
[/\bconsignee\s+informed\b/i, 'NFD'],
[/\bawb\s+documentation\b/i, 'AWR'],
[/\bdocuments?\s+received\b/i, 'AWR'],
```

### 3. Switch to hierarchy-based resolution
Instead of returning the first chronologically resolvable event, iterate ALL events, resolve each one, and pick the **most advanced** by IATA hierarchy:

```
BKD(1) < RCS(2) < MAN(3) < PRE(3) < DEP(4) < ARR(5) < RCF(6) < AWR(7) < NFD(8) < AWD(9) < POD(10) < DLV(11)
```

This mirrors the CCT "timeline is supreme" principle — the most advanced status wins regardless of timestamp order.

### Files Changed
1. `supabase/functions/fetch-status-aereo/index.ts` — Add AWR/NFD patterns, switch to hierarchy resolution in `resolveUnkFromTimeline`

