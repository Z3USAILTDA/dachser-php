

## Plano: Alinhar contagem de processos FINANCEIRO entre Processos e Pagamentos

### Problema identificado

A query da aba **Processos** (`get_vouchers_combined`) filtra vouchers com:
- `sync_status = "ATIVO"` 
- `voucher_master_id IS NULL OR voucher_master_id = ""` (exclui filhos de masters)
- Exclui CONCLUIDO com mais de 24h

A query da aba **Pagamentos** (`list_pagamentos`) **não aplica** esses filtros — inclui filhos de masters e vouchers sem `sync_status = "ATIVO"`.

Isso faz a aba Pagamentos mostrar mais vouchers na etapa FINANCEIRO do que a aba Processos.

### Alteração

**`supabase/functions/mariadb-proxy/index.ts`** — action `list_pagamentos`

Adicionar os mesmos filtros de consistência na query de pagamentos:

1. Adicionar condição `v.sync_status = 'ATIVO'` 
2. Adicionar condição `(v.voucher_master_id IS NULL OR v.voucher_master_id = '')` para excluir filhos (masters já representam o grupo)

Essas condições serão adicionadas ao array `conditions` (linha ~9034) para afetar tanto a listagem quanto as stats.

### Resultado
Ambas as abas mostrarão a mesma quantidade de vouchers na etapa FINANCEIRO.

