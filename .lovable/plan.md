

# Otimizar busca do modal Voucher Master -- resolver possivel timeout

## Diagnostico

A query `search_vouchers_for_master` esta potencialmente sofrendo timeout por dois motivos principais:

1. **LEFT JOIN com COLLATE em runtime** -- a clausula `ON dfv.nd COLLATE utf8mb4_general_ci = v.numero_spo COLLATE utf8mb4_general_ci` forca conversao de charset em cada comparacao, impedindo uso de indices e causando full table scan na `t_dados_financeiro_voucher` (~5.795 registros).

2. **7 condicoes OR com LIKE %...%** -- patterns com `%` no inicio nunca usam indice, resultando em scans completos.

## Solucao

### Arquivo: `supabase/functions/mariadb-proxy/index.ts`

Otimizar a query de busca:

1. **Remover o COLLATE do JOIN** -- usar comparacao direta (ambas as colunas ja devem usar o mesmo charset por padrao no MariaDB)
2. **Adicionar GROUP BY ou DISTINCT** para evitar duplicatas causadas pelo LEFT JOIN (um voucher pode ter multiplos registros em `t_dados_financeiro_voucher`)
3. **Adicionar log de tempo** para diagnosticar se a query esta de fato demorando

**Query otimizada:**

```sql
SELECT DISTINCT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda, 
       v.vencimento, v.etapa_atual, v.filial, v.voucher_master_id, v.is_master, 
       v.processo_id
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
AND v.sync_status = 'ATIVO'
ORDER BY v.created_at DESC
LIMIT 20
```

Mudancas:
- Removido `COLLATE utf8mb4_general_ci` de ambos os lados do JOIN (causa principal de lentidao)
- Adicionado `DISTINCT` para evitar linhas duplicadas
- Removido `dfv.nd as nd_rm` do SELECT (nao era usado no frontend)
- Adicionado log de tempo de execucao (`console.log` com `Date.now()` antes e depois da query)

### Arquivo: `src/components/esteira/VoucherMasterForm.tsx`

Aumentar o debounce de 300ms para 500ms para reduzir chamadas desnecessarias enquanto o usuario digita.

Nenhuma outra alteracao necessaria.
