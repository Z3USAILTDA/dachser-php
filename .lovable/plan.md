## Problemas

### 1. SPO não aparece nos vouchers do lote
A tabela `t_voucher_batch_import_item` **não possui coluna `spo`** (esquema linhas 18144–18166 do `mariadb-proxy/index.ts`). O `INSERT` na linha 18581 também não grava SPO. Portanto, `i.spo` no `get_batch_import_status` é sempre `undefined`, e o card mostra "SPO —".

### 2. Modal "Vincular documentos ao lote" fora do design system
O `BatchDocumentBinderDialog` e o `BatchVoucherChecklist` usam estilos crus (cores hardcoded como `bg-emerald-500/10`, bordas `border-white/10`, sem cards/headers/badges no padrão DACHSER Z3US — gold `#F5B843`, fundo `#050608`, cantos arredondados, tipografia mono para SPO etc.).

## Plano

### Backend: buscar SPO real do voucher

`supabase/functions/mariadb-proxy/index.ts`, action `get_batch_import_status` (linha 18697–18723):

- Após carregar `items`, fazer um `SELECT id, numero_spo FROM t_vouchers WHERE id IN (...)` para os `voucher_id` presentes.
- Montar map `spoByVoucher`.
- No `checklist.map`, retornar `numero_spo: spoByVoucher[i.voucher_id] ?? null`.

Sem alterações de schema; sem migrations.

### Frontend: redesign do modal

`src/components/esteira/BatchDocumentBinderDialog.tsx`:
- Header com ícone (`Paperclip`/`Link2`) + subtítulo descritivo
- Duas colunas em cards (`bg-card/40 border border-border/60 rounded-xl`) com headers padronizados (uppercase tracking-wider, contagem ao lado)
- Lista de **documentos**: itens com `rounded-lg`, hover dourado sutil, badge de status (`PENDENTE`/`VINCULADO`) usando tokens semânticos (`bg-primary/10 text-primary` para vinculado, `bg-muted/40` para pendente), botão unbind discreto
- Lista de **vouchers**: passa pelo `BatchVoucherChecklist` redesenhado
- Footer: separator, Select de tipo com label, botões com ícones, "Finalizar lote" como `default`/gold, "Vincular" como `secondary`

`src/components/esteira/BatchVoucherChecklist.tsx`:
- Card com `bg-card/40 border-border/60 rounded-xl p-3.5`, hover `bg-primary/5`, selecionado `ring-2 ring-primary/60 border-primary/40`
- Linha 1: `SPO 105-292848` em mono dourado (chip `bg-primary/10 px-2 py-0.5 rounded-md`) + valor à direita em mono
- Linha 2: fornecedor em `font-medium` com truncate
- Linha 3: pequenos chips para forma de pagamento e vencimento (`bg-muted/30 text-muted-foreground rounded-full px-2 py-0.5 text-[11px]`)
- Linha 4: dois badges de checklist (Fatura / Boleto) — verde `bg-emerald-500/10 border-emerald-500/30 text-emerald-400` quando ok, âmbar quando faltando, neutro quando n/a
- Status final como badge canto inferior direito, cores via tokens semânticos (`destructive`, `primary`, `emerald`)
- Remover textos `PENDENTE_FATURA` em maiúsculas e usar labels amigáveis: "Completo", "Falta fatura", "Falta boleto", "Falta fatura e boleto"

Sem mudanças de lógica (seleção, vínculo, finalização).

## Resultado
- SPO real visível em cada cartão (vindo de `t_vouchers.numero_spo`)
- Modal alinhado ao design system DACHSER (dark + gold, cards, chips, badges semânticas)
