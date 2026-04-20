

## Correção: vouchers cancelados não aparecem ao filtrar por "Cancelado"

### Causa-raiz
A query `get_vouchers_combined` em `supabase/functions/mariadb-proxy/index.ts` (linha 14176) filtra vouchers ativos com:

```sql
WHERE sync_status = "ATIVO"
  AND (voucher_master_id IS NULL OR voucher_master_id = "")
  AND (etapa_atual != "CONCLUIDO" OR (etapa_atual = "CONCLUIDO" AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))
```

Vouchers em `CANCELADO` passam pelo `sync_status = "ATIVO"`, mas:
- **Sem filtro de mês:** são incluídos (estão no resultado).
- **Com filtro de mês (caso atual: abril/2026):** o `ativosMonthClause` exige que `etapa_atual IN ('OPERACAO','FISCAL','SUPERVISOR','FINANCEIRO')` **OU** que `data_emissao` esteja no mês. Como `CANCELADO` não está na lista de etapas ativas e `data_emissao` muitas vezes é nula/fora do mês para vouchers cancelados, eles somem.

Além disso, vouchers cancelados deveriam ter retenção idêntica a `CONCLUIDO` (ficar visíveis por algum período após o cancelamento), o que hoje não existe.

### Solução (cirúrgica)

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` — bloco `get_vouchers_combined`.

1. **Tratar `CANCELADO` como etapa ativa para fins de visibilidade no mês corrente**, adicionando-o ao `IN(...)` do `ativosMonthClause`:
   ```sql
   v.etapa_atual IN ('OPERACAO','FISCAL','SUPERVISOR','FINANCEIRO','AJUSTE_OPERACAO','AJUSTE_FISCAL','CANCELADO')
   ```
   *(Inclui também `AJUSTE_*` que tinham o mesmo problema latente.)*

2. **Adicionar exceção de retenção para `CANCELADO` na cláusula de exclusão**, espelhando o comportamento de `CONCLUIDO`:
   ```sql
   AND (etapa_atual NOT IN ('CONCLUIDO','CANCELADO') 
        OR (etapa_atual IN ('CONCLUIDO','CANCELADO') AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))
   ```
   Assim, vouchers cancelados continuam visíveis nas últimas 24h (igual a `CONCLUIDO`) — útil para conferência imediata após o cancelamento.

### Não muda
- Frontend (`VoucherTable.tsx`, `EsteiraIndex.tsx`): o `SelectItem value="CANCELADO"` já existe e funciona — só precisava receber os dados.
- Lógica de cancelamento (`cancelar_voucher`): já está correta, o voucher é marcado como `etapa_atual = 'CANCELADO'`.
- Demais queries (`get_vouchers_ativos`, etc.) — escopo restrito ao endpoint usado pela tela.

### Resultado esperado
- Após cancelar um voucher, ele continua aparecendo na lista por até 24h e pode ser filtrado por "Cancelado" no dropdown de Etapa.
- Vouchers cancelados em meses anteriores aparecem ao trocar o filtro de mês para o mês do cancelamento.

