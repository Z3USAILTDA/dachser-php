## Objetivo

Após confirmar a criação de um voucher master, "travar" o agrupamento de vouchers para que documentos adicionais (ex: boleto vindo depois da fatura) possam ser vinculados ao mesmo master sem precisar reselecionar todos os vouchers nem reconfirmar.

## Comportamento atual

- A cada clique em "Vincular", o usuário precisa selecionar os vouchers + documento + tipo.
- Se selecionar 2+ vouchers, abre o `AlertDialog` de confirmação do master.
- Após vincular, `selectedVouchers` e `selectedDocs` são limpos.
- Ao subir um segundo documento (boleto), o usuário tem que reselecionar os mesmos vouchers e reconfirma o master de novo.

## Comportamento desejado

1. Ao confirmar a criação do master pela primeira vez:
   - Vincular o documento atual ao grupo master (fluxo atual já faz isso via `bind_batch_document_to_master_group`).
   - **Travar** a seleção de vouchers como "master ativo" — exibir um cartão fixo no topo da seção de vouchers ("Master em montagem: N vouchers · SPO previsto: X · total Y") com botão "Encerrar master".
   - Limpar apenas `selectedDocs` (não `selectedVouchers`), mantendo o grupo travado visualmente.
2. Próximos vínculos enquanto o master estiver ativo:
   - Basta selecionar o(s) documento(s) novo(s) e o tipo; clicar em "Vincular ao master" usa o grupo travado e **não** reabre o `AlertDialog`.
   - O backend continua chamando `bind_batch_document_to_master_group` com os mesmos `voucher_ids`.
3. Encerrar master:
   - Botão "Encerrar master" (ou ao fechar o dialog/finalizar lote) limpa o estado travado, devolvendo o seletor ao modo livre.
4. Se o usuário desmarcar/alterar vouchers manualmente enquanto o master está travado, oferecemos "Encerrar master" automaticamente (a edição implica novo grupo) — mais simples: enquanto travado, os checkboxes de vouchers ficam desabilitados (somente leitura), com tooltip "Encerre o master para alterar a seleção".

## Mudanças

Arquivo único: `src/components/esteira/BatchDocumentBinderDialog.tsx`

- Novo estado `lockedMaster: { voucherIds: string[]; previewSpo: string; total: number } | null`.
- Em `doBind`, quando `voucherIds.length >= 2` e `!lockedMaster`, após sucesso definir `lockedMaster` com a seleção atual.
- Em `requestBind`, se `lockedMaster` existir, ignorar `selectedVouchers` e usar `lockedMaster.voucherIds`; pular o `AlertDialog`.
- Após bind bem-sucedido, limpar somente `selectedDocs` (manter `selectedVouchers` igual a `lockedMaster.voucherIds` para feedback visual).
- Renderizar banner do master travado acima da grid de vouchers com botões "Encerrar master".
- Desabilitar `BatchVoucherChecklist` (prop `multi` + novo `disabled`) enquanto `lockedMaster` ativo, exceto para os vouchers do grupo (que aparecem como "fixados").
- Resetar `lockedMaster` no `useEffect` de fechamento do dialog e após `finalize` bem-sucedido.

## Fora de escopo

- Sem mudanças no edge function `mariadb-proxy` — o backend já aceita múltiplas chamadas `bind_batch_document_to_master_group` com o mesmo `voucher_ids` e o `finalize_batch_import` consolida em um único master ao final.
