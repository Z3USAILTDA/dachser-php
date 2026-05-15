## Problema

Em `CreateVoucherDialog.tsx` (linhas 368–375), o submit em modo manual bloqueia o envio com "Fornecedor é obrigatório no modo manual", embora o campo Fornecedor não esteja marcado como obrigatório no formulário (no schema Zod já está como `optional()` e o label não tem asterisco).

## Correção

Remover o bloco de validação que torna `fornecedor` obrigatório no modo manual em `handleSubmitVoucher`. Demais validações (Nº do Voucher, Vencimento, Tipo de Documento, Forma de Pagamento, Origem do Processo, Fatura/Demonstrativo) permanecem inalteradas.

Resultado: campos não marcados como obrigatórios (incluindo Fornecedor) deixam de impedir o envio quando vazios.

## Arquivo alterado

- `src/components/esteira/CreateVoucherDialog.tsx` — remover linhas 368–375.
