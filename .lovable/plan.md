

## Plano: Cron de Sincronização de Status (1 min) + Expandir Lógica

### O que será feito

1. **Expandir `check_baixas_vouchers` no `mariadb-proxy`** para se tornar `sync_voucher_statuses` — verificando **todos** os vouchers com `etapa_atual != 'A_PROCESSAR'` e corrigindo ambos os status:

   **Regras incrementais (nunca regride):**
   - Se `etapa_atual IN ('ROBO','CONCLUIDO')` e `is_pronto_para_robo = 1` e `status_financeiro = 'PENDENTE'` → `status_financeiro = 'PROCESSADO'`
   - Se `status_comprovante IN ('ANEXADO','VALIDADO')` e `status_financeiro != 'CONCLUIDO'` → `status_financeiro = 'CONCLUIDO'`
   - Se `status_comprovante IN ('ANEXADO','VALIDADO')` e `status_baixa NOT IN ('BAIXA_SOLICITADA','REALIZADA')` → `status_baixa = 'BAIXA_SOLICITADA'`
   - Se `status_baixa = 'BAIXA_SOLICITADA'` → checar tbaixas via id_rm (lógica existente) → `status_baixa = 'REALIZADA'`

2. **Atualizar `voucher-check-baixas`** para chamar a nova action `sync_voucher_statuses`

3. **Criar cron job** a cada 1 minuto via SQL (pg_cron + pg_net) chamando a edge function `voucher-check-baixas`

### Arquivos a alterar

- `supabase/functions/mariadb-proxy/index.ts` — Substituir case `check_baixas_vouchers` por `sync_voucher_statuses` com as 4 regras
- `supabase/functions/voucher-check-baixas/index.ts` — Alterar action para `sync_voucher_statuses`
- SQL insert via Supabase tool — Criar cron job `cron.schedule('sync-voucher-statuses', '* * * * *', ...)`

