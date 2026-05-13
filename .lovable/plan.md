## Causa

No handler `search_pre_lancamento_by_fornecedores` (mariadb-proxy/index.ts, linha 19633), a busca SÓ retorna vouchers se houver match exato pelo nome do `fornecedor` do lote. Se o nome não bate (espaço, acento, "S/A" vs "S.A."), ou se o lote não tem fornecedores extraídos, o modal vem vazio — mesmo existindo pré-lançados na base.

## Correção

Garantir que **sempre** que o usuário abrir o modal apareçam todos os pré-lançamentos disponíveis (sem master, em `PRE_LANCAMENTO`), priorizando os do(s) fornecedor(es) do lote no topo.

### Mudança única — `supabase/functions/mariadb-proxy/index.ts` (linhas 19632–19663)

Substituir a query do bloco `search_pre_lancamento_by_fornecedores` para:

1. Buscar **todos** os vouchers em `PRE_LANCAMENTO` com `voucher_master_id IS NULL` (sem filtrar por fornecedor no `WHERE`).
2. Quando houver lista de fornecedores do lote, ordenar os correspondentes primeiro (via `CASE WHEN UPPER(TRIM(fornecedor)) IN (...) THEN 0 ELSE 1 END`).
3. Manter ordenação por vencimento/numero_spo.
4. Limitar a, por exemplo, 500 registros para evitar payloads gigantes.

Pseudocódigo SQL:
```sql
SELECT id, numero_spo, id_rm, fornecedor, cnpj_fornecedor, valor, moeda,
       vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de,
       urgencia_tipo, processo_id, origem_processo, filial,
       data_emissao_documento, comentarios_operacao, created_at
  FROM dados_dachser.t_vouchers
 WHERE etapa_atual = 'PRE_LANCAMENTO'
   AND voucher_master_id IS NULL
 ORDER BY
   CASE WHEN UPPER(TRIM(fornecedor)) COLLATE utf8mb4_unicode_ci IN (<ph>) THEN 0 ELSE 1 END,
   vencimento ASC, fornecedor ASC, numero_spo ASC
 LIMIT 500
```
Quando `fornecedores` estiver vazio, o `CASE` é omitido e ordena só por vencimento.

Sem alterações no frontend, schema, RLS ou no fluxo de `attach_pre_lancamento_to_batch`.

## Resultado esperado

Ao abrir o modal "Buscar pré-lançados" no lote, o usuário vê **todos** os pré-lançamentos existentes (com os do fornecedor do lote no topo), podendo selecionar mesmo sem match exato de nome.
