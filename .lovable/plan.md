## Objetivo

Quando um voucher do lote tem **DAI vinculado**, o sistema deve tratar essa vinculação como satisfazendo **tanto fatura quanto boleto** — sem mostrar badges "Falta Fatura"/"Falta Boleto" nem bloquear "Finalizar lote".

## Diagnóstico

Em `supabase/functions/mariadb-proxy/index.ts`, dois blocos calculam pendências do lote a partir dos anexos:

1. `get_batch_import_status` (linhas ~22548-22567) — produz o `checklist` consumido por `BatchVoucherChecklist.tsx` (badges Fatura/Boleto e status `PENDENTE_FATURA_E_BOLETO`, etc.).
2. `finalize_batch_import` (linhas ~22608-22624) — bloqueia finalização quando `motivos` contém `PENDENTE_FATURA`/`PENDENTE_BOLETO`.

Hoje, o `temDai` só é considerado no caso especial de `PRE_LANCAMENTO`. No fluxo normal, DAI não substitui fatura nem boleto.

## Mudança (cirúrgica, somente backend)

Em ambos os blocos, antes de derivar `status`/`motivos`:

```ts
if (temDai) { temFatura = true; temBoleto = true; }
```

Isso garante:
- O checklist mostra Fatura ✓ e Boleto ✓ quando há DAI.
- O `status` resulta em `COMPLETO`.
- `finalize_batch_import` não acrescenta `PENDENTE_FATURA`/`PENDENTE_BOLETO` ao motivo do voucher com DAI.

Nenhuma mudança no frontend. Lógica de extração de linha digitável e prioridade BOLETO>DAI permanecem intactas.

## Fora de escopo

- Fluxo normal da esteira (fora de lote).
- Regras de PRE_LANCAMENTO (já tratadas).
- Estrutura de anexos, validações de tipo, e o front `BatchVoucherChecklist`.

## Memória

Atualizar `mem://vouchers/document-validation-rules-v2` ou adicionar `mem://vouchers/dai-substitui-fatura-e-boleto-no-lote` com a regra: **"No lote, anexo DAI substitui tanto FATURA quanto BOLETO; voucher fica COMPLETO e pode finalizar mesmo sem fatura/boleto físicos."**
