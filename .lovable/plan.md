

## Diagnóstico

O erro `Field 'criado_por_user_id' doesn't have a default value` ocorre no **INSERT de mirror records** (linha 10577). Esse INSERT não inclui a coluna `criado_por_user_id`, mas a tabela `t_vouchers` define essa coluna como `NOT NULL` sem valor default.

O INSERT do master (linha 10655) já inclui `criado_por_user_id` corretamente. O problema é apenas no INSERT dos espelhos criados a partir da `t_dados_financeiro_voucher`.

## Correção

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

Adicionar `criado_por_user_id` ao INSERT de mirror records (linha 10577-10595), usando o valor `criado_por_user_id` recebido no body da requisição:

- Adicionar `criado_por_user_id` na lista de colunas do INSERT
- Adicionar o parâmetro `criado_por_user_id` (do body) na lista de valores

