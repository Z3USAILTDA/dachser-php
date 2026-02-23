

# Corrigir busca do modal Voucher Master -- garantir 100% de paridade com a tela principal

## Diagnóstico

A busca do modal (`search_vouchers_for_master`) consulta **apenas** a tabela `t_vouchers`. Porém, a tela principal da Esteira mostra vouchers de **duas fontes**:

1. **`t_vouchers`** (vouchers ativos) -- estes a busca do modal já cobre
2. **`t_dados_financeiro_voucher`** (backlog/pendentes RM) -- estes a busca do modal **NÃO** cobre

Vouchers que existem apenas no backlog (ainda não foram processados e inseridos em `t_vouchers`) simplesmente não existem na tabela consultada pelo modal.

Além disso, na própria `t_vouchers`, o campo `nd` da tabela `t_dados_financeiro_voucher` pode ser diferente do `numero_spo`, e a busca atual não faz JOIN com essa tabela.

## Solução

### Arquivo: `supabase/functions/mariadb-proxy/index.ts`

Expandir a query `search_vouchers_for_master` para incluir um LEFT JOIN com `t_dados_financeiro_voucher`, permitindo buscar também pelo campo `nd` (que é o identificador usado no backlog). Isso garante que qualquer voucher visível na tela principal possa ser encontrado no modal.

**Query atualizada:**

```sql
SELECT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda, 
       v.vencimento, v.etapa_atual, v.filial, v.voucher_master_id, v.is_master, 
       v.processo_id, dfv.nd as nd_rm
FROM dados_dachser.t_vouchers v
LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv 
  ON dfv.nd COLLATE utf8mb4_general_ci = v.numero_spo COLLATE utf8mb4_general_ci
WHERE (
  v.numero_spo LIKE ? 
  OR v.fornecedor LIKE ? 
  OR v.cnpj_fornecedor LIKE ?
  OR v.processo_id LIKE ?
  OR CAST(v.id AS CHAR) LIKE ?
  OR CAST(v.id_rm AS CHAR) = ?
  OR dfv.nd LIKE ?
)
AND v.sync_status = 'ATIVO'
ORDER BY v.created_at DESC
LIMIT 20
```

Isso adiciona apenas:
- Um LEFT JOIN com `t_dados_financeiro_voucher` (mesmo padrão usado na query `get_vouchers_ativos`)
- Uma condição de busca adicional pelo campo `dfv.nd`
- Um parâmetro extra nos bindings da query

Nenhum outro arquivo precisa ser alterado.

