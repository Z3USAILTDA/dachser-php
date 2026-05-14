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

## CRITICAL: Mirror children must participate in sort_key

In `create_voucher_master`, the sort_key candidate list MUST be built by UNIONING:
- rows resolved from `t_vouchers` (joined with `dfv` by `nd`)
- rows from `t_dados_financeiro_voucher` for ALL `voucher_ids` (including those that only exist in dfv and will be created as mirrors LATER in the same flow)

Without the dfv-direct query, children that are mirrored after the sort_key calculation are excluded from the "lowest" decision, and the master inherits the wrong numero_spo. Bug fixed 2026-05-14: master `041fec4c…` had inherited `20263777220` instead of `20261567083` because the latter was a dfv-only child at the moment of sort_key resolution.
