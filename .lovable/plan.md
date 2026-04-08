

## Plano: Exibir vouchers filhos do Master na aba Pagamentos

### Problema
A aba Pagamentos (`PagamentosTab.tsx`) não tem noção de Voucher Master. O backend (`list_pagamentos`) não retorna `is_master` nem `nome_master`, e o frontend não exibe os filhos vinculados.

### Alterações

**1. Backend — `mariadb-proxy/index.ts` (action `list_pagamentos`)**
- Adicionar `v.is_master, v.nome_master, v.voucher_master_id` ao SELECT da query (linha ~8988)

**2. Frontend — `PagamentosTab.tsx`**

- Adicionar campos `is_master`, `nome_master`, `voucher_master_id` na interface `PagamentoItem`
- Adicionar estado `masterChildrenMap` + cache (mesmo padrão do `VoucherTable.tsx`):
  - `useEffect` que detecta masters na lista e chama `get_voucher_filhos` para cada um
  - Cache em `useRef` para evitar re-fetches
- Na coluna SPO da tabela (linha ~903-904):
  - Se `is_master && nome_master`: exibir `nomeMaster` em vez do SPO
  - Adicionar badge "Master" (roxo)
  - Subtítulo com `↳ SPO-001, SPO-002...` (lista dos filhos, máx 5 + contagem)
  - Borda lateral roxa na row do master

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | Adicionar `is_master, nome_master, voucher_master_id` ao SELECT de `list_pagamentos` |
| `src/components/esteira/PagamentosTab.tsx` | Interface + estado + renderização de master/filhos |

### Resultado esperado
Vouchers Master aparecem na aba Pagamentos com nome personalizado, badge "Master" e lista de SPOs filhos, igual ao comportamento da tabela principal da Esteira.

