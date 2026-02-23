

# Correção: Remover filtro de etapa na busca do Voucher Master

## Problema

A query `search_vouchers_for_master` no `mariadb-proxy` filtra vouchers por `etapa_atual IN ('OPERACAO', 'A_PROCESSAR', 'FISCAL')`. Vouchers em qualquer outra etapa (RASCUNHO, SUPERVISOR, FINANCEIRO, ROBO, etc.) não aparecem no modal, mesmo sendo visíveis na lista principal.

## Solução

Remover o filtro de etapa, permitindo que qualquer voucher (exceto os já consolidados em um master ou que já são master) apareça na busca.

## Detalhes Técnicos

### Arquivo: `supabase/functions/mariadb-proxy/index.ts`

Na action `search_vouchers_for_master` (linha ~8612), remover a linha:

```sql
AND etapa_atual IN ('OPERACAO', 'A_PROCESSAR', 'FISCAL')
```

A query resultante ficará:

```sql
SELECT id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, etapa_atual, filial
FROM dados_dachser.t_vouchers
WHERE (numero_spo LIKE ? OR fornecedor LIKE ? OR CAST(id AS CHAR) = ? OR CAST(id_rm AS CHAR) = ?)
  AND (voucher_master_id IS NULL OR voucher_master_id = '')
  AND (is_master IS NULL OR is_master = 0)
ORDER BY numero_spo ASC
LIMIT 20
```

Os filtros que permanecem garantem que:
- O voucher ainda não pertence a outro master
- O voucher não é ele próprio um master

Esta é uma alteração de uma única linha. Nenhum outro arquivo precisa ser modificado.

