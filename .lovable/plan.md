

# Fix: False Piece Discrepancy on AWB 006-52942455

## Problem Identified

The AWB `006-52942455` is flagged as "Discrepancia Pecas (20)" but all events actually have **20 pieces** -- except one specific event:

> "**0 pieces** at ICN offloaded from DL0188/13FEB26."

This event means **zero pieces were offloaded** (i.e., nothing was removed from the flight -- a good outcome). However, the `extractPieces` function extracts `0` from "0 pieces", and since `0 != 20` (the baseline), the system flags it as a discrepancy.

## Root Cause

In `supabase/functions/fetch-status-aereo/index.ts`, the `extractPieces` function (line 22) matches the regex `(\d+)\s*piece` on **all** event descriptions without considering context. The phrase "0 pieces offloaded" is semantically different from an actual piece count change -- it indicates that no cargo was removed.

## Solution

Modify the `extractPieces` function to **skip events where pieces = 0 and the context is "offloaded"**, since "0 pieces offloaded" is not a real shipment quantity -- it's confirming nothing was removed.

### Technical Details

**File**: `supabase/functions/fetch-status-aereo/index.ts`

**Change 1**: In the `detectPiecesDiscrepancy` function (lines 170-179), skip events where extracted pieces = 0 **and** the description contains "offload" (which indicates a non-event rather than an actual piece count):

```typescript
// Inside the loop at line 172-179:
const pieces = extractPieces(desc);
if (pieces !== null) {
  // Skip "0 pieces offloaded" -- means nothing was removed, not a real count
  const descUpper = desc.toUpperCase();
  if (pieces === 0 && (descUpper.includes('OFFLOAD') || descUpper.includes('OFLD'))) {
    continue;
  }
  eventsWithPieces.push({ pieces, isDelivery: isDeliveryEvent(ev), index: i });
}
```

This is a minimal, targeted fix that:
- Only skips the specific "0 pieces offloaded" pattern
- Does not affect real discrepancy detection (e.g., "10 pieces" vs "20 pieces")
- Preserves existing behavior for all other events

After the change, the edge function will be redeployed automatically.

