

## Ajuste do SELECT e mínimo de 6 caracteres — Voucher Master

### Alterações

**1. `supabase/functions/mariadb-proxy/index.ts` (linhas ~10461-10486)**
- Alterar o mínimo de caracteres de `2` para `6` no guard (`search.length < 6`)
- Remover `COLLATE` do JOIN (não necessário na nova query)
- Alterar os parâmetros LIKE de `%search%` para `%search` (sem wildcard no início, conforme solicitado)
- Manter o `=` para `id_rm` sem wildcard

**2. `src/components/esteira/VoucherMasterForm.tsx` (linha ~77)**
- Alterar o mínimo de caracteres de `2` para `6` no `useEffect` que dispara a busca (`trimmed.length >= 6`)

### Detalhes da query final

```sql
SELECT DISTINCT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda,
       v.vencimento, v.etapa_atual, v.filial, v.voucher_master_id, v.is_master,
       v.processo_id
FROM dados_dachser.t_vouchers v
LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv
  ON dfv.nd = v.numero_spo
WHERE (
  v.numero_spo LIKE '%{search}'
  OR v.fornecedor LIKE '%{search}'
  OR v.cnpj_fornecedor LIKE '%{search}'
  OR v.processo_id LIKE '%{search}'
  OR CAST(v.id AS CHAR) LIKE '%{search}'
  OR CAST(v.id_rm AS CHAR) = '{search}'
  OR dfv.nd LIKE '%{search}'
)
AND (v.etapa_atual != 'CANCELADO' OR v.etapa_atual IS NULL)
ORDER BY v.created_at DESC
LIMIT 50
```

Parâmetros: `%${search}` (sem wildcard final) para os LIKE, `search` puro para o `=`.

