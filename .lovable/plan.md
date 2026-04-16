

## Plano: Deduplicar Vouchers Vinculados

### Diagnóstico
A query `get_voucher_filhos` (L11309-11314) é um simples `SELECT FROM t_vouchers WHERE voucher_master_id = ?`. A duplicação vem de **registros reais duplicados na tabela `t_vouchers`** — múltiplas linhas com mesmo `numero_spo`, `fornecedor`, `valor` e `vencimento` apontando para o mesmo master.

Isso não é um problema de JOIN, mas de dados duplicados na base.

### Solução

**1. Deduplicar a query `get_voucher_filhos`** em `supabase/functions/mariadb-proxy/index.ts` (L11309-11314):

Agrupar por `numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual` para mostrar apenas 1 linha por combinação única, usando `MIN(id)` como id representativo:

```sql
SELECT MIN(id) as id, numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual,
       COUNT(*) as qtd_duplicados
FROM dados_dachser.t_vouchers 
WHERE voucher_master_id = ?
GROUP BY numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual
ORDER BY numero_spo ASC
```

**2. Deduplicar `get_voucher_filhos_batch`** (L14074) — mesma lógica de GROUP BY.

**3. Atualizar VoucherDetailsView.tsx** — mostrar badge com quantidade quando `qtd_duplicados > 1`.

### Arquivo alterado
- `supabase/functions/mariadb-proxy/index.ts` (2 queries)
- `src/components/esteira/VoucherDetailsView.tsx` (badge opcional)

