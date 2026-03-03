

# Fix: minutesSinceUpdate falsy-zero bug in firecrawl-monitor-alert

## Root Cause

Line 161 in `firecrawl-monitor-alert/index.ts`:
```typescript
const minutesSinceUpdate = Number(row.minutesSinceUpdate || 9999);
```

When MariaDB's `TIMESTAMPDIFF` returns `0` (data updated within the same minute), JavaScript's `||` operator treats `0` as falsy and substitutes `9999`. **9999 minutes = 166h 39min** — exactly what the email showed.

## Fix

**File: `supabase/functions/firecrawl-monitor-alert/index.ts`** (line 161)

Replace the falsy `||` pattern with explicit null-checking + JS-side fallback (same pattern already used in `firecrawl-monitor-stats`):

```typescript
let minutesSinceUpdate = row.minutesSinceUpdate != null ? Number(row.minutesSinceUpdate) : null;
if (minutesSinceUpdate === null || isNaN(minutesSinceUpdate) || minutesSinceUpdate < 0) {
  if (row.lastUpdate) {
    const lastDate = new Date(row.lastUpdate);
    minutesSinceUpdate = Math.round((Date.now() - lastDate.getTime()) / 60000);
  } else {
    minutesSinceUpdate = 9999;
  }
}
```

This handles:
- `0` correctly (no longer treated as falsy)
- `null`/`undefined` from the driver
- Negative values from timezone mismatches
- Missing `lastUpdate` as ultimate fallback

One line change, no other files affected. Deploy `firecrawl-monitor-alert`.

