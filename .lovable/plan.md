

## Correção: Cards mostrando quantidade e valor multiplicados

### Problema
A query de stats (linha 8273) faz `LEFT JOIN` com `t_dados_financeiro_voucher` mas usa `SUM(CASE ...)` sem `DISTINCT`. Se um voucher tem 3 registros na tabela `dfv` (mesmo `numero_spo`), ele é contado 3 vezes nos cards. Por isso mostra "3 - R$ 5.249,85" (3 × R$ 1.749,95) ao invés de "1 - R$ 1.749,95".

A query de contagem principal (linha 8243) já usa `COUNT(DISTINCT v.id)` corretamente, mas a query de stats não aplica a mesma lógica.

### Correção

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (linhas 8273-8299)

Remover o `LEFT JOIN` da query de stats, já que ela não usa nenhuma coluna de `dfv` — só precisa de colunas de `t_vouchers`. O filtro `(dfv.modal IS NULL OR dfv.modal <> 'ADM')` pode ser convertido em um `NOT EXISTS` subquery.

**De:**
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN v.vencimento >= CURDATE() THEN 1 ELSE 0 END) as a_vencer_count,
  ...
FROM dados_dachser.t_vouchers v
LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv 
  ON dfv.nd COLLATE utf8mb4_general_ci = v.numero_spo COLLATE utf8mb4_general_ci
WHERE (v.etapa_atual = 'FINANCEIRO' OR ...)
AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
```

**Para:**
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN v.vencimento >= CURDATE() THEN 1 ELSE 0 END) as a_vencer_count,
  ...
FROM dados_dachser.t_vouchers v
WHERE (v.etapa_atual = 'FINANCEIRO' OR ...)
AND NOT EXISTS (
  SELECT 1 FROM dados_dachser.t_dados_financeiro_voucher dfv 
  WHERE dfv.nd COLLATE utf8mb4_general_ci = v.numero_spo COLLATE utf8mb4_general_ci 
  AND dfv.modal = 'ADM'
)
```

Isso elimina a duplicação de linhas causada pelo JOIN e mantém o filtro de exclusão de `modal = 'ADM'`.

