## Objetivo

Adicionar, no modal de detalhes (olhinho) da aba **Pagamentos** (`/fin/esteira`), uma seção de **Observações** que mostra os comentários já existentes no voucher (`comentarios_operacao`, `comentarios_fiscal`, `comentarios_financeiro`), indicando claramente quando estiverem preenchidos ou vazios.

## Mudanças

### 1. Backend — `supabase/functions/mariadb-proxy/index.ts` (action `list_pagamentos`)

- Adicionar `v.comentarios_operacao, v.comentarios_fiscal, v.comentarios_financeiro` no `SELECT` (linha ~11331-11337).
- Sem alterar `WHERE`, ordenação, paginação, stats ou demais ações.

### 2. Frontend — `src/components/esteira/PagamentosTab.tsx`

- Estender a `interface PagamentoItem` com os 3 campos opcionais (`comentarios_operacao?`, `comentarios_fiscal?`, `comentarios_financeiro?`).
- Dentro do `Dialog` de detalhes (após o painel `DadosPagamentoPanel` e antes/depois do bloco "Documentos Anexados"), renderizar um card **"Observações"** com:
  - Três sub-blocos rotulados: **Operação**, **Fiscal**, **Financeiro**.
  - Cada sub-bloco com um pequeno badge ao lado do rótulo:
    - "Preenchido" (verde) quando há texto não-vazio
    - "Vazio" (muted) quando ausente/em branco
  - Texto do comentário em um `<p>` com whitespace-pre-wrap; quando vazio mostrar `—` discreto.
- Usar exclusivamente tokens semânticos do design system (sem cores cruas).

## Fora de escopo

- Edição de comentários no olhinho.
- Alterar qualquer outra aba, query ou comportamento.
- Renomear/refatorar arquivos.