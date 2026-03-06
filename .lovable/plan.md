

# Fix: ETD filter too strict -- events before ETD date are all removed

## Problem

Logs show: `3 valid events, 0 after ETD filter (cutoff=2026-03-06T00:00:00.000Z)` for AWB 724-86856405.

The ETD is today (2026-03-06). Since `etdDate <= now`, the code uses ETD directly as cutoff. But pre-departure events (BKD, RCS, etc.) naturally occur *before* the ETD, so `eventDate >= etdCutoff` filters them all out.

## Root cause

Line 6270: when ETD is in the past, `etdCutoff = etdDate` with no buffer. Events like BKD happen days/weeks before ETD.

## Fix

### `supabase/functions/mariadb-proxy/index.ts` -- line 6270

When ETD is in the past, subtract 30 days as buffer to keep pre-departure events:

```typescript
// Before:
etdCutoff = etdDate;

// After:
etdCutoff = new Date(etdDate.getTime() - 30 * 24 * 60 * 60 * 1000);
```

This preserves all events from the current shipment cycle (BKD, RCS, DEP, ARR, etc.) while still filtering out stale events from previous uses of the same AWB number.

