## Problema

Vouchers/processos estão chegando na aba **Pagamentos** com `tipo_execucao_pagamento = 'MANUAL'` em vez de `'A_DEFINIR'` (Pendente), mesmo após as correções anteriores onde todos os INSERTs explícitos no `mariadb-proxy` foram alinhados para `'A_DEFINIR'`.

## Causa raiz

Há duas portas de entrada que ainda permitem que `tipo_execucao_pagamento` seja gravado como `'MANUAL'`:

1. **`supabase/functions/voucher-othello-webhook/index.ts`** (linhas 125–156)  
   O `INSERT INTO t_vouchers` **não inclui a coluna `tipo_execucao_pagamento`**. A coluna então assume o `DEFAULT` do schema MariaDB. Como o schema legado da coluna foi criado com `DEFAULT 'MANUAL'` (antes da migração para VARCHAR), todo voucher criado pelo webhook do Othello entra como **MANUAL**.

2. **DEFAULT da coluna em MariaDB**  
   A action `migrate_tipo_exec_column_to_varchar` (linha 10337) só converte o tipo para `VARCHAR(20) NULL DEFAULT NULL`, mas se ela nunca rodou em produção (ou se foi recriada), a coluna pode estar com `DEFAULT 'MANUAL'`. Qualquer INSERT futuro que omita a coluna herda esse valor.

Os demais pontos de inserção (`save_voucher_esteira`, `import_voucher_from_rm`, master/mirror, `sync_incremental`) já passam `'A_DEFINIR'` explícito — não são o problema.

## Correção (cirúrgica)

### 1. `supabase/functions/voucher-othello-webhook/index.ts`
Adicionar `tipo_execucao_pagamento` ao INSERT com valor fixo `'A_DEFINIR'`:

```text
INSERT INTO t_vouchers (
  ..., origem_criacao, tipo_execucao_pagamento, created_at, updated_at
) VALUES (..., ?, 'A_DEFINIR', ?, ?)
```

### 2. `supabase/functions/mariadb-proxy/index.ts` — nova action `normalize_tipo_exec_default`
Action one-shot, idempotente, que executa:

```sql
ALTER TABLE dados_dachser.t_vouchers
  MODIFY COLUMN tipo_execucao_pagamento VARCHAR(20)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  NULL DEFAULT 'A_DEFINIR';
```

Isso garante que qualquer INSERT futuro que omita a coluna grave `'A_DEFINIR'` em vez de `'MANUAL'`.

### 3. Backfill seguro (mesma action)
Após o ALTER, normalizar somente os registros que provavelmente foram afetados pelo bug (sem alterar vouchers que o usuário marcou como MANUAL conscientemente):

```sql
UPDATE dados_dachser.t_vouchers
SET tipo_execucao_pagamento = 'A_DEFINIR', updated_at = NOW()
WHERE tipo_execucao_pagamento = 'MANUAL'
  AND (is_pronto_para_robo = 0 OR is_pronto_para_robo IS NULL)
  AND etapa_atual IN ('FINANCEIRO','ROBO')
  AND origem_criacao IN ('OTHELLO','RM')
  AND lote_remessa_id IS NULL;
```

Critério: só toca em vouchers ainda não marcados como prontos, ainda em FINANCEIRO/ROBO, vindos das origens automáticas (não MANUAL no front), e sem lote de remessa associado. Vouchers que o usuário escolheu MANUAL via select da PagamentosTab não são afetados (eles já teriam `is_pronto_para_robo=1` ou foram editados manualmente).

### 4. Disparar a action
Após deploy, chamar `normalize_tipo_exec_default` uma vez (via DevTools/curl) ou colar como botão admin — pode ser uma chamada manual única a partir do console; não precisa UI.

## Arquivos alterados

- `supabase/functions/voucher-othello-webhook/index.ts` — adicionar coluna no INSERT.
- `supabase/functions/mariadb-proxy/index.ts` — nova action `normalize_tipo_exec_default` na lista de actions permitidas e no switch.

Sem mudanças em frontend, types, ou outras telas.

## Verificação

1. Criar (ou simular) um voucher via webhook Othello → deve aparecer em Pagamentos com tipo "Pendente".
2. Vouchers anteriores que eram "Manual" indevidamente passam a aparecer como "Pendente" (somente os que se enquadram nos critérios do backfill).
3. Vouchers explicitamente setados como MANUAL pelo usuário permanecem MANUAL.
