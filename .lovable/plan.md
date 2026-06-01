## Diagnóstico até aqui

Backend está respondendo corretamente. Testei `get_voucher_by_id` direto contra o `mariadb-proxy`:

- Voucher `bd2e556d-...` (OPERAÇÃO, criado por Cleiciane via front) → **5 anexos `FATURA_DEMONSTRATIVO` retornados**, `dadosBancarios` preenchidos. OK.
- Voucher `550e3fc5-...` (OPERAÇÃO, `criado_por_user_id = SISTEMA_SYNC`, vencimento 2024) → `anexos: []`, `logs: []`. Esse é importado do RM em 04/05/2026 e nunca passou pelo front, então **nunca teve anexos**.

A query do `get_voucher_by_id` (linhas 8140–8224 de `mariadb-proxy/index.ts`) já tem retry, não mascara erro e filtra `voucher_id = ?` sem nenhum join estranho. O front (`EsteiraVoucherDetails.tsx` 82–143) lê `responseData.anexos`/`logs` corretamente.

Logo, **não há evidência de regressão genérica**. A hipótese mais provável é que você está abrindo vouchers `SISTEMA_SYNC` antigos (lote do RM de 04/05) que entraram em OPERAÇÃO sem nunca terem anexos no FNC.

## Antes de mexer no código, rodar auditoria

Vou adicionar **uma ação read-only** `audit_anexos_etapas_op` no `mariadb-proxy` (sem migration, sem mudança de schema, sem efeito colateral) que devolve:

```text
para cada etapa em ('OPERACAO','AJUSTE_OPERACAO'):
  total_vouchers
  total_com_anexos          (COUNT DISTINCT voucher_id em t_voucher_anexos)
  total_com_logs            (COUNT DISTINCT voucher_id em t_voucher_logs)
  total_sem_anexos_origem_RM  (criado_por_user_id='SISTEMA_SYNC' OU id_rm IS NOT NULL)
  total_sem_anexos_origem_FRONT
  amostra_5_sem_anexos_FRONT   (id, numero_spo, criado_por_user_id, created_at, updated_at)
```

Invoco a ação na mesma vez, reporto os números no chat e só então decidimos:

1. **Se "sem anexos" forem só os RM-imported**: nada a corrigir no código. Eventualmente abrir ticket separado para esconder/marcar visualmente "Importado do RM — sem anexos no FNC" no detalhe.
2. **Se houver vouchers FRONT (não SISTEMA_SYNC) sem anexos/logs**: aí é regressão real. A amostra dá os IDs, eu cruzo com Storage (`voucher-anexos`) e t_voucher_logs por SPO, identifico se órfão (arquivo existe mas linha sumiu) ou se nunca foi inserido, e proponho fix surgical.

## Arquivos tocados nesta etapa

- `supabase/functions/mariadb-proxy/index.ts` — somente adicionar a action `audit_anexos_etapas_op` (read-only, ~40 linhas, sem tocar nada existente).
- Deploy: `mariadb-proxy`.

## Sem mudanças irreversíveis

Nada de migração, nada de DELETE/UPDATE, nada de mudança em outras actions ou no front nesta etapa. Apenas a auditoria. O plano de correção (se houver) vem depois, baseado em dados.

## Confirmação

Posso seguir adicionando essa action de auditoria e rodando-a?
