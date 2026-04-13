

## Plano: Alinhar stats do Pagamentos com os filtros da listagem

### Problema identificado

Os filtros `sync_status = 'ATIVO'` e `voucher_master_id IS NULL OR ''` foram adicionados corretamente na query de **listagem** do `list_pagamentos` (linhas 9037-9038), mas a query de **stats** (linhas 9159-9165) tem seu próprio WHERE independente que **não inclui esses filtros**.

Isso faz com que o card/contador de totais na aba Pagamentos mostre uma contagem maior que a aba Processos.

### Alteração

**`supabase/functions/mariadb-proxy/index.ts`** — action `list_pagamentos`, query de stats (linhas 9159-9165)

Adicionar as duas condições faltantes ao WHERE da query de stats:

```sql
-- Linha 9160, após o AND NOT EXISTS...
AND v.sync_status = 'ATIVO'
AND (v.voucher_master_id IS NULL OR v.voucher_master_id = '')
```

### Resultado
A contagem de vouchers nas stats da aba Pagamentos será idêntica à da aba Processos para a etapa FINANCEIRO.

