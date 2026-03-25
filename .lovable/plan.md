

## Fix: Add JS Date.toString() Pattern Detection to All Date Formatters

### Root Cause
The value reaching MariaDB is `'Mon Apr 20 2026 00:00:00 GM 00:00:00.000'`. This is a JS `Date.toString()` output (with truncated timezone `GM` instead of `GMT`). None of the existing regex checks match this pattern — they only handle `YYYY-MM-DD`, ISO with `T`, and `DD/MM/YYYY`. The `new Date()` fallback also fails because the string is malformed.

### Fix
Add a **month-name extraction regex** as the first check after the simple format detections, in all 4 date formatting helpers. This directly extracts `Apr` → `04`, `20`, `2026` without relying on `new Date()`.

### File: `supabase/functions/mariadb-proxy/index.ts`

Add this block **before** the `new Date(s.replace(...))` fallback in each of the 4 helpers:

```typescript
// Detect JS Date.toString() format: "Mon Apr 20 2026 ..."
const monthMap: Record<string,string> = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
};
const jsMatch = s.match(/\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/);
if (jsMatch && monthMap[jsMatch[1]]) {
  return `${jsMatch[3]}-${monthMap[jsMatch[1]]}-${jsMatch[2].padStart(2,'0')} 00:00:00.000`;
}
```

### Locations (4 total)
1. **`toMySQLDate`** (~line 5832) — used by `create_voucher`
2. **`formatDateVal`** (~line 6079) — used by `update_voucher_esteira`
3. **`toMySQLDateSafe`** (~line 10419) — used by `import_voucher_from_rm`
4. **`formatDateForMariaDB`** (~line 10919) — used by `create_voucher_master`
5. **`mirrorVenc` inline** (~line 10833) — used by master mirror creation

Each location: insert the `jsMatch` block right **after** the BR date match and **before** the `new Date(s.replace(...))` line.

No other files need changes.

