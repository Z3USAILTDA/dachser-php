# Ajuste: usar sempre "Total Collect" (não "Collect" puro)

## Problema
Na conferência CHB (rota `/chb/conferences/:id`), ao extrair "Valor Total Frete" de AWB/HAWB/BL, o LLM está pegando a linha **"Collect"** (frete básico, antes das taxas e packaging) em vez da linha **"Total Collect"** que aparece no rodapé da coluna e já inclui frete + taxas + embalagem.

A causa é o prompt em `supabase/functions/analyze-chb-documents/index.ts`, que hoje diz apenas "linha Total na coluna Prepaid/Collect" sem deixar explícito que o rótulo correto é **"Total Collect"/"Total Prepaid"** (final da coluna), nunca um subtotal "Collect"/"Prepaid" no meio.

## Mudanças no prompt (cirúrgicas, sem refatoração)

Arquivo único: `supabase/functions/analyze-chb-documents/index.ts`

### 1) Seção 7B — "VALOR TOTAL FRETE" (linhas ~683-721)
- Reescrever o "ONDE PROCURAR" para CCT/BL/AWB explicitando que o valor é **sempre** o da linha final rotulada `Total Prepaid` ou `Total Collect` (rodapé da coluna), que já consolida frete + taxas + packaging.
- Adicionar regra anti-erro: **nunca usar** a linha intermediária "Collect" / "Prepaid" / "Freight Charge" / "WT/VAL" sozinha — esses são parciais e não representam o total cobrado.
- Atualizar a lista de sinônimos VÁLIDOS para deixar `Total Prepaid` e `Total Collect` como prioritários (e marcar `Freight`, `Ocean Freight`, `Air Freight`, `Collect`, `Prepaid` como fallback **apenas** quando não houver linha "Total ...").

### 2) Seção 14B — Regras AWB/HAWB (linhas ~868-878)
- Reforçar que a linha "Total" considerada para frete é a do **rodapé** da coluna (`Total Prepaid` / `Total Collect`), que soma:
  - Weight/Valuation Charge
  - Tax
  - Total Other Charges Due Agent
  - Total Other Charges Due Carrier
- Adicionar exemplo numérico curto mostrando que `Collect = 1.200` (frete) vs `Total Collect = 1.450` (frete + outros) → usar **1.450**.
- Listar explicitamente como ERRADO: reportar o valor da linha "Collect"/"Weight Charge" como `Valor Total Frete`.

## Fora de escopo
- Nenhuma mudança em UI, schema, código de pós-processamento, fallback de regex (linhas 1700-1740 já mapeiam `total prepaid`/`total collect` corretamente).
- Nenhuma mudança nas regras de validação cruzada Incoterm × Prepaid/Collect.

## Validação
Após editar, fazer deploy de `analyze-chb-documents` e rodar uma nova conferência num processo conhecido com AWB Collect cujo "Collect" ≠ "Total Collect" para confirmar que agora o sistema captura o valor final.
