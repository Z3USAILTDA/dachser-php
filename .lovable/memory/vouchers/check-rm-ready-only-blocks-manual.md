---
name: check_voucher_rm_ready Scope
description: Gate de prontidão RM só bloqueia vouchers sem espelho em t_dados_financeiro_voucher
type: feature
---

O handler `check_voucher_rm_ready` (em `supabase/functions/mariadb-proxy/index.ts`) só pode bloquear o avanço da esteira quando o registro espelho **não existir** em `dados_dachser.t_dados_financeiro_voucher` (`found === false`). Esse é o caso de vouchers genuinamente manuais ainda não sincronizados pelo RM.

Se `found === true` (o RM já criou o espelho), a resposta deve ser sempre `{ ready: true, isManual: false, missingFields: [] }` — campos eventualmente vazios em `t_dados_financeiro_voucher` (ex.: `forma_pag`) são apenas informacionais (`informationalEmptyFields`) e nunca bloqueiam, pois `t_vouchers` (esteira) é a fonte de verdade da operação e o usuário já preencheu/corrigiu lá.

Os gates no front (`VoucherFiscalActions.handleAprovar` e `VoucherFinanceiroActions.handleBaixar` / `useEffect checkRm`) só chamam o handler quando `origemCriacao === "MANUAL"` e exibem mensagem genérica de "RM ainda não criou o registro" — sem listar campos faltantes.

**Por quê:** Anteriormente, vouchers vindos do RM com algum campo `NULL` no espelho (ex.: SPO 20261882949 com `forma_pag = NULL` mesmo já tendo `t_vouchers.forma_pagamento = TRANSFERENCIA`) ficavam travados no Fiscal. A heurística do front (`id_rm null → MANUAL`) era falso positivo. A correção move a decisão para o backend usando a presença do espelho.
