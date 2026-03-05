

# Fix: Vouchers não aparecem na busca para Voucher Master

## Causa raiz identificada

Há **duas causas** que impedem vouchers de aparecerem na busca:

1. **Filtro `sync_status = 'ATIVO'`**: Vouchers com `sync_status` NULL ou `'BAIXADO'` são excluídos da busca. Vouchers criados manualmente ou importados do RM antes da coluna existir podem ter `sync_status = NULL`, tornando-os invisíveis.

2. **`LIMIT 20`**: Se o termo de busca é genérico (ex: nome de fornecedor comum), os 20 primeiros resultados podem não incluir o voucher desejado.

## Alterações

### 1. `supabase/functions/mariadb-proxy/index.ts` — action `search_vouchers_for_master`

- **Remover** o filtro `AND v.sync_status = 'ATIVO'` — a busca para master deve encontrar **qualquer** voucher, independentemente do status de sync.
- **Aumentar** o `LIMIT` de 20 para **50**.
- **Adicionar** filtro para excluir apenas `etapa_atual = 'CANCELADO'` (vouchers cancelados não fazem sentido para consolidação).

Query resultante:
```sql
SELECT DISTINCT v.id, v.numero_spo, v.fornecedor, ...
FROM dados_dachser.t_vouchers v
LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv 
  ON dfv.nd = v.numero_spo
WHERE (
  v.numero_spo LIKE ? 
  OR v.fornecedor LIKE ? 
  OR v.cnpj_fornecedor LIKE ?
  OR v.processo_id LIKE ?
  OR CAST(v.id AS CHAR) LIKE ?
  OR CAST(v.id_rm AS CHAR) = ?
  OR dfv.nd LIKE ?
)
AND (v.etapa_atual != 'CANCELADO' OR v.etapa_atual IS NULL)
ORDER BY v.created_at DESC
LIMIT 50
```

Nenhuma alteração de frontend necessária — o componente já renderiza todos os resultados retornados.

