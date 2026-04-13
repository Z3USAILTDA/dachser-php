

## Plano: Adicionar coluna `tipo_exec` na `t_dados_rm`

### Alteração

**1. Backend — `supabase/functions/mariadb-proxy/index.ts`**

No case `insert_dados_rm` (~linha 8648):
- Adicionar `tipo_exec` ao destructuring do body (aceitar valores `BAIXA_MANUAL`, `REMESSA_10H`, `REMESSA_15H`)
- Na criação da tabela (linha 8722), adicionar: `tipo_exec VARCHAR(20) DEFAULT NULL`
- Adicionar `ALTER TABLE ADD COLUMN IF NOT EXISTS` para tabelas existentes (junto aos outros ALTERs, linha 8742)
- No INSERT (linha 8759), incluir `tipo_exec` na query e passar o valor

**2. Frontend — enviar `tipo_exec` nas chamadas**

- `src/components/esteira/VoucherFinanceiroActions.tsx` (linha 78-91): adicionar `tipo_exec: voucher.tipoExecucaoPagamento` no body do `insert_dados_rm`
- `src/components/esteira/PagamentosTab.tsx` (linha 463-467): adicionar `tipo_exec: pagamento.tipo_execucao_pagamento` no body
- `src/components/esteira/FaturasDoDiaTab.tsx` (linha 176-180): adicionar `tipo_exec` se disponível

**3. Correção pendente da mensagem anterior**

Incluir também a correção da linha 21 do `VoucherFinanceiroActions.tsx` para reconhecer `"REMESSA"` como tipo válido de remessa (evitando que masters não sejam enviados para `t_dados_rm`).

### Resumo

| Arquivo | Alteração |
|---------|-----------|
| `mariadb-proxy/index.ts` | Coluna `tipo_exec` na tabela + INSERT |
| `VoucherFinanceiroActions.tsx` | Enviar `tipo_exec` + fix `REMESSA` |
| `PagamentosTab.tsx` | Enviar `tipo_exec` |
| `FaturasDoDiaTab.tsx` | Enviar `tipo_exec` |

