---
name: Vouchers Master Numbering
description: SPO assignment for master vouchers using idmov as primary key with id_rm fallback
type: feature
---

The master voucher's `numero_spo` is inherited from the child with the **lowest sort key**, computed as:

`sort_key = COALESCE(dfv.idmov, v.id_rm, dfv.id_rm)`

Priority:
1. `t_dados_financeiro_voucher.idmov` (primary)
2. `t_vouchers.id_rm` (fallback when idmov is NULL)
3. `t_dados_financeiro_voucher.id_rm` (last resort)

If no child has any of those keys, fallback uses the first child's numero_spo or a random `MASTER-XXXX`.

Applied in two places in `supabase/functions/mariadb-proxy/index.ts`:
- `case 'create_voucher_master'`
- `case 'fix_master_numero_spo'` (retroactive fix for existing masters)
