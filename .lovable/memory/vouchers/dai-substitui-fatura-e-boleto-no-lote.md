---
name: DAI substitui Fatura e Boleto no lote
description: No fluxo de importação em lote, anexo DAI satisfaz a obrigatoriedade de FATURA e BOLETO simultaneamente
type: feature
---
Em `mariadb-proxy/index.ts` (ações `get_batch_import_status` e `finalize_batch_import`): se `temDai` for true, força `temFatura=true` e `temBoleto=true` antes de derivar status/motivos. Voucher fica COMPLETO e pode ser finalizado sem fatura/boleto físicos.
