
## Fix: Grand Total row overlapping client rows

The Grand Total row uses `sticky bottom-0` which causes it to float over client data rows as you scroll, creating an ugly overlap because the background is semi-transparent (`bg-primary/5`).

### Fix (single line change)

In `src/pages/olimpo/OlimpoCobranca.tsx` line 760, change the Grand Total `<tr>` classes:

**From:** `border-t-2 border-primary/40 bg-primary/5 sticky bottom-0`
**To:** `border-t-2 border-primary/40 bg-card sticky bottom-0 z-10 shadow-[0_-2px_6px_rgba(0,0,0,0.3)]`

This gives the sticky row:
- An opaque background (`bg-card`) so content doesn't show through
- A `z-10` to stay above other rows
- A subtle top shadow to visually separate it from the scrolling content

### File modified
| File | Change |
|---|---|
| `src/pages/olimpo/OlimpoCobranca.tsx` | Opaque background + z-index + shadow on Grand Total sticky row |
