

## Plan: Fix Status Divergence + Build Errors

### Problem 1: Build Errors (`NodeJS.Timeout`)
Three files use `NodeJS.Timeout` which isn't available in the browser TypeScript context.

**Fix**: Replace `NodeJS.Timeout` with `ReturnType<typeof setTimeout>` in:
- `src/pages/ContainerTracking.tsx` (line 426)
- `src/pages/FinanceiroDisputa.tsx` (lines 98, 104)

### Problem 2: Status Divergence (Dashboard vs Timeline)

**Root Cause**: The dashboard listing extracts RFB status from `partesEstoque` using **chronological ordering** (most recent timestamp wins). But the detail timeline page generates synthetic events from ALL `partesEstoque` entries and picks the **most advanced by hierarchy**. When a `partesEstoque` entry with a recent timestamp has a lower-hierarchy status (e.g., "Manifestada") than an older entry (e.g., "Em Área de Transferência"), the dashboard shows the wrong (lower) status.

**Fix**: Change both RFB `partesEstoque` status extraction blocks in `supabase/functions/mariadb-proxy/index.ts` (lines ~3320-3348 and ~3503-3539) to use **hierarchy** instead of chronological ordering, matching the "timeline is supreme" principle:

```typescript
// Before: chronological (most recent timestamp wins)
if (new Date(peTimestamp).getTime() > new Date(rfbLatestTimestamp).getTime()) {
  rfbSituacaoMapped = mapped;
}

// After: hierarchy (most advanced status wins)
const existingOrder = CCT_STATUS_ORDER[rfbSituacaoMapped || ''] || 0;
const newOrder = CCT_STATUS_ORDER[mapped] || 0;
if (newOrder > existingOrder) {
  rfbSituacaoMapped = mapped;
}
```

This ensures the dashboard and timeline always agree: the most advanced status across all `partesEstoque` entries wins, regardless of timestamps.

### Files Changed
1. `src/pages/ContainerTracking.tsx` — Fix `NodeJS.Timeout` type
2. `src/pages/FinanceiroDisputa.tsx` — Fix `NodeJS.Timeout` type (2 occurrences)
3. `supabase/functions/mariadb-proxy/index.ts` — Change both RFB status extraction blocks to use hierarchy ordering

