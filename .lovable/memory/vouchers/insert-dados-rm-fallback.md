---
name: insert_dados_rm Fallback Lookup
description: insert_dados_rm must read linha_digitavel/chave_pix from t_vouchers when payload is empty, to defend against front-end race conditions
type: feature
---

The handler `insert_dados_rm` in `supabase/functions/mariadb-proxy/index.ts` must NEVER trust the front-end payload alone for `voucher_boleto` (linha_digitavel/codigo_barras) and `chave_pix`.

**Why:** The front (`src/utils/voucherRmSync.ts` → `insertDadosRmOnFinanceiro`) reads from a stale React `voucher` object. If the operator clicks "Aprovar" before `extract-boleto-barcode` finishes writing `linha_digitavel` to `t_vouchers`, the payload arrives with `voucher_boleto: null`. Result: `t_dados_rm.voucher_boleto` is persisted as NULL even though the source-of-truth `t_vouchers.linha_digitavel` is correct. The function intentionally never throws, so the operator never sees the failure.

**Rule:** Before INSERT, if `voucher_boleto` is empty AND `forma_pag` is BOLETO (or `chave_pix` is empty AND `forma_pag` is PIX), do a lookup:
```sql
SELECT linha_digitavel, codigo_barras, chave_pix
FROM dados_dachser.t_vouchers
WHERE id_rm = ? OR numero_spo = ?
ORDER BY created_at DESC LIMIT 1
```
Use the recovered values and emit `console.warn` for traceability.

Do not push the fix to the front (multiple call-sites: `VoucherTable`, `VoucherSupervisorActions`, `VoucherRascunhoActions`, `VoucherOperacaoActions`, `VoucherFiscalActions`). The defense lives in the proxy.
