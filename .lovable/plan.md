

## Correção: erro "Unknown column 'processo_id'" no create_voucher_master

### Causa raiz
O INSERT de registros espelho em `create_voucher_master` (linha ~10577) referencia colunas que podem não existir na tabela MariaDB:
- `processo_id`
- `origem_criacao`  
- `criado_por_dfv`

O fluxo normal de criação de voucher (linha ~5650) executa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` antes do INSERT, mas o bloco do master não faz isso.

### Correção

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

1. **Antes do INSERT de mirror records (~linha 10569)**, adicionar os mesmos `ALTER TABLE ADD COLUMN IF NOT EXISTS` que o fluxo normal já faz:
   - `processo_id VARCHAR(100)`
   - `origem_criacao VARCHAR(20)` (verificar se existe)
   - `criado_por_dfv VARCHAR(255)` (verificar se existe)

2. **Alternativa mais segura**: simplificar o INSERT do mirror para usar apenas colunas que sabemos existir com certeza (`id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, forma_pagamento, etapa_atual, status_baixa, status_financeiro, voucher_master_id, id_rm, created_at, updated_at`), removendo `processo_id`, `origem_criacao` e `criado_por_dfv` do INSERT.

3. Também remover `processo_id` da query SELECT na `t_dados_financeiro_voucher` (linha 10562) caso essa coluna também não exista nessa tabela.

Recomendo a **alternativa 2** (simplificar o INSERT) para evitar dependência de ALTER TABLE em runtime, a menos que essas colunas sejam necessárias para o funcionamento correto dos espelhos.

