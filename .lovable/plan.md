## Causa raiz

O gate `check_voucher_rm_ready` foi originalmente desenhado para vouchers **MANUAIS** (criados na esteira sem origem no RM), garantindo que o registro espelho em `t_dados_financeiro_voucher` esteja completo antes de avançar para o Financeiro.

O problema: o gate está sendo aplicado também a vouchers que **já vieram do RM** (como o SPO 20261882949), em que `t_dados_financeiro_voucher` existe mas pode ter campos pontuais (ex.: `forma_pag`) `NULL` por motivos do próprio fluxo de importação. Como o usuário já preencheu esses campos na esteira (em `t_vouchers`), não faz sentido travar.

Confirmado:
- `check_voucher_rm_ready { numero_spo: "20261882949" }` → `{ found: true, ready: false, missingFields: ["forma_pag"] }`
- `t_vouchers.forma_pagamento = "TRANSFERENCIA"` (preenchido pelo usuário)
- O front classificou esse voucher como `origemCriacao = "MANUAL"` apenas porque `id_rm` está `null` no espelho (heurística em `EsteiraVoucherDetails.tsx:129`), mas o registro **existe em `t_dados_financeiro_voucher`** — ou seja, veio do RM.

## Regra acordada

**Se o voucher não foi criado manualmente, ele não deve ser bloqueado por falta de dados em `t_dados_financeiro_voucher`.** O critério de "manual" deve refletir a realidade: **manual = não existe registro em `t_dados_financeiro_voucher`** (o RM nunca o criou).

## Correção (cirúrgica, dois pontos)

### 1) `supabase/functions/mariadb-proxy/index.ts` — handler `check_voucher_rm_ready` (~linha 9937)

Mudar a semântica do retorno para refletir a regra:

- Mantém o `SELECT` em `t_dados_financeiro_voucher`.
- Se `found === false` (registro inexistente) → é **voucher manual sem espelho RM**. Retorna `{ ready: false, found: false, isManual: true, missingFields: ['registro inexistente em t_dados_financeiro_voucher'] }` (comportamento atual).
- Se `found === true` → **veio do RM**. Retorna `{ ready: true, found: true, isManual: false, missingFields: [] }` independentemente dos campos do espelho. Se houver campos vazios, eles são apenas informativos e logados via `console.log` — não bloqueiam.

Justificativa: a partir do momento em que existe espelho RM, a esteira é a fonte de verdade da operação; campos espelho podem ser reconciliados depois sem travar o fluxo do operador.

### 2) `src/components/esteira/VoucherFiscalActions.tsx` (linhas ~133-153) e `VoucherFinanceiroActions.tsx` (linhas ~46-60 e ~88-110)

Ajustar o gate para refletir a nova semântica:

- Continuar chamando `check_voucher_rm_ready` apenas para vouchers que o front classifica como `origemCriacao === "MANUAL"` (já é o caso em FiscalActions; replicar exatamente a mesma condição em FinanceiroActions).
- Adicionar uma condição extra: se a resposta vier com `isManual === false` (ou seja, encontrou espelho), **não bloquear** mesmo que `ready === false`. Isso cobre casos como o SPO 20261882949, em que a heurística `id_rm trim → MANUAL` é um falso positivo.
- Mensagem de bloqueio só aparece quando `found === false` (genuinamente sem espelho RM): "A integração com o RM ainda não criou o registro deste voucher. Aguarde a sincronização."

Sem mudanças em schema, RLS, na origem do `origemCriacao` em `EsteiraVoucherDetails.tsx`, nem em outros pontos.

## Validação pós-deploy

1. `curl mariadb-proxy { action: "check_voucher_rm_ready", numero_spo: "20261882949" }` → `{ found: true, ready: true, isManual: false }`.
2. Abrir o voucher no Fiscal, clicar "Aprovar e Enviar para Financeiro" → transição ocorre.
3. Criar um voucher genuinamente manual (sem registro em `t_dados_financeiro_voucher`) e tentar aprovar antes da sincronização → bloqueio continua funcionando com a mensagem clara.
4. Repetir o teste no Financeiro (botão Baixar) — mesmo comportamento.

## Memória

Adicionar em `.lovable/memory/index.md`:
- `[check_voucher_rm_ready Scope](mem://vouchers/check-rm-ready-only-blocks-manual)` — gate de prontidão RM só bloqueia vouchers sem espelho em `t_dados_financeiro_voucher`. Vouchers vindos do RM não são bloqueados por campos faltantes no espelho; a esteira (`t_vouchers`) é a fonte de verdade da operação.

Criar `.lovable/memory/vouchers/check-rm-ready-only-blocks-manual.md` com a regra acima.
