## Problema

Quando o lote é criado com a opção **Pré-lançamento**, os vouchers nascem com `etapa_atual = 'PRE_LANCAMENTO'` já dentro do lote. A query `search_pre_lancamento_by_fornecedores` busca **todo** voucher com `etapa = PRE_LANCAMENTO AND voucher_master_id IS NULL`, então esses mesmos vouchers reaparecem na coluna **"Pré-lançados disponíveis"**, dando a impressão de que processos ainda não concluídos estão "soltos" e disponíveis para anexar.

O filtro no frontend (`idsNoLote` derivado de `checklist`) não cobre esse caso de forma consistente porque:
- pode rodar antes do checklist estar carregado;
- e, conceitualmente, qualquer voucher já vinculado a um lote em andamento (`PENDING_DOCUMENTS`) não deveria ser considerado "disponível" para outro master.

## Correção (cirúrgica, somente backend)

Arquivo: `supabase/functions/mariadb-proxy/index.ts`, dentro do case `search_pre_lancamento_by_fornecedores` (linhas 19676–19687).

Adicionar duas exclusões na query:

1. Excluir vouchers que já estão em algum item do **lote atual** (`batch_id = ?`).
2. Excluir vouchers que já estão em **qualquer outro lote em aberto** (`t_voucher_batch_import.status = 'PENDING_DOCUMENTS'`), evitando que um pré-lançado "preso" a outro lote em andamento apareça como disponível.

Pseudo-SQL adicionado ao `WHERE`:

```sql
AND id NOT IN (
  SELECT bi.voucher_id
    FROM dados_dachser.t_voucher_batch_import_item bi
    JOIN dados_dachser.t_voucher_batch_import b ON b.id = bi.batch_id
   WHERE bi.voucher_id IS NOT NULL
     AND (bi.batch_id = ? OR b.status = 'PENDING_DOCUMENTS')
)
```

Quando `batchIdArg` for nulo, manter apenas a parte `b.status = 'PENDING_DOCUMENTS'`.

## O que NÃO muda

- Frontend (`BatchDocumentBinderDialog.tsx`) permanece igual; o filtro `idsNoLote` continua como segunda linha de defesa.
- Lógica de criação do lote (`create_voucher_batch_import`) e de anexação (`attach_pre_lancamento_to_batch`) inalteradas.
- Vouchers em `PRE_LANCAMENTO` que ficaram realmente "soltos" (sem lote em aberto) seguem aparecendo normalmente na coluna.

## Validação

1. Criar lote em modo **Pré-lançamento** com 2 vouchers → coluna "Pré-lançados disponíveis" deve aparecer **vazia**.
2. Criar um voucher pré-lançado em outro fluxo (sem lote pendente) → deve aparecer normalmente em outro lote aberto.
3. Finalizar o lote → vouchers pré-lançados de fora do lote voltam a aparecer normalmente em novos lotes.
