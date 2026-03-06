

# Fix: `resolveUnkFromTimeline` picking future events

## Problem
AWB 045-21167753 shows **BKD** on screen but the real latest event is **DIS** (Discrepancy at 16:55 today). The function `resolveUnkFromTimeline` sorts timeline events by date DESC but doesn't filter out future-dated events. A "Booked" prediction event dated 2026-03-13 (future) is picked first, resolving to BKD instead of the real current status DIS.

`extractLastEventDate` already filters future events (`if (eventDate > now) continue`), but this same guard was never added to `resolveUnkFromTimeline`.

## Fix — `supabase/functions/fetch-status-aereo/index.ts`

### In `resolveUnkFromTimeline` (around line 258, after ETD cutoff filtering)

Add future-date filtering to the `filtered` array, same as `extractLastEventDate`:

```typescript
const now = new Date();

const filtered = (etdCutoff
  ? sorted.filter(ev => {
      const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
      if (!ts) return true;
      const eventDate = parseFlexibleDate(String(ts));
      if (!eventDate) return true;
      return eventDate >= etdCutoff!;
    })
  : sorted
).filter(ev => {
  // Also exclude future events (predictions, not real statuses)
  const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
  if (!ts) return true;
  const eventDate = parseFlexibleDate(String(ts));
  if (!eventDate) return true;
  if (eventDate > now) return false;
  if (eventDate.getFullYear() < 2020) return false;
  return true;
});
```

### Same fix in `detectInTransit` (around line 395)

Apply identical future-date filtering to ensure `in_transit` detection also ignores future "Booked" events.

Two surgical changes in the same file, consistent with the existing `extractLastEventDate` guards.

**Expected result for 045-21167753:** Status changes from BKD → **DIS** (or FOH depending on exact ordering at same timestamp).

