## Objetivo

Na seção **Observações** do olhinho da aba Pagamentos, mostrar **apenas** o comentário da Operação (campo `comentarios_operacao`), removendo Fiscal e Financeiro.

## Mudanças

### Frontend — `src/components/esteira/PagamentosTab.tsx`

- Simplificar o card "Observações" para renderizar somente quando `comentarios_operacao` tiver texto não-vazio.
- Exibir um único `Badge` "Operação" e o texto do comentário em `<p>` com `whitespace-pre-wrap break-words`.
- Remover a lógica que itera sobre Fiscal e Financeiro.

### Backend — `supabase/functions/mariadb-proxy/index.ts`

- Remover `v.comentarios_fiscal` e `v.comentarios_financeiro` do `SELECT` de `list_pagamentos`, mantendo apenas `v.comentarios_operacao`.

### Interface

- Remover `comentarios_fiscal?` e `comentarios_financeiro?` de `PagamentoItem`, mantendo apenas `comentarios_operacao?`.

## Fora de escopo

- Edição do comentário no olhinho.
- Qualquer outra aba/query/comportamento.
