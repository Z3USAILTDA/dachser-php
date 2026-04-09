

## Plano: Remover Notificações Individuais e Criar Relatório Mensal

### Resumo
Remover todas as notificações por e-mail da esteira **exceto** o fluxo de aprovação/rejeição de urgência do Supervisor. Criar uma nova Edge Function de relatório mensal que envia um resumo dos vouchers concluídos + em andamento, disparada via cron no final do mês.

### O que será removido
Todas as chamadas `supabase.functions.invoke("send-voucher-notification", ...)` nos seguintes arquivos:
- `CreateVoucherDialog.tsx` — notificação ao criar voucher
- `VoucherOperacaoActions.tsx` — notificação ao enviar para próxima etapa
- `VoucherFiscalActions.tsx` — notificação ao enviar para FINANCEIRO
- `VoucherSupervisorActions.tsx` — notificação ao aprovar urgência (envia para FINANCEIRO)
- `VoucherFinanceiroActions.tsx` — notificação de ajuste solicitado
- `VoucherRoboActions.tsx` — notificação de comprovante retornado
- `VoucherTable.tsx` — notificações de comprovante retornado pendente e envio

### O que será MANTIDO
- O e-mail de aprovação/rejeição de urgência para o Supervisor (os botões Aprovar/Rejeitar no e-mail) — este fluxo usa a mesma Edge Function `send-voucher-notification` mas com `toStage === "SUPERVISOR"` e `type === "VOUCHER_ENVIADO"`. Ele continuará funcionando normalmente.
- A Edge Function `send-voucher-notification` permanece no projeto (usada apenas pelo fluxo de Supervisor).

### Nova funcionalidade: Relatório Mensal

**Edge Function `voucher-monthly-report`**:
- Consulta o MariaDB buscando:
  - Vouchers com `etapa_atual = 'CONCLUIDO'` e `updated_at` no mês anterior
  - Vouchers em andamento (etapas intermediárias) no último dia do mês
- Monta um e-mail HTML com tabela resumo contendo: Número SPO, Fornecedor, Valor, Moeda, Etapa, Data Conclusão/Última Atualização
- Inclui totalizadores (quantidade por etapa, valor total concluído)
- Envia via Resend para `larissa@z3us.ai`

**Agendamento via pg_cron**:
- Cron configurado para rodar no dia 1 de cada mês às 08:00 UTC
- Schedule: `0 8 1 * *`

### Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/esteira/CreateVoucherDialog.tsx` | Remover bloco de invoke `send-voucher-notification` |
| `src/components/esteira/VoucherOperacaoActions.tsx` | Remover bloco de invoke (manter apenas fluxo SUPERVISOR) |
| `src/components/esteira/VoucherFiscalActions.tsx` | Remover bloco de invoke |
| `src/components/esteira/VoucherSupervisorActions.tsx` | Remover bloco de invoke |
| `src/components/esteira/VoucherFinanceiroActions.tsx` | Remover bloco de invoke |
| `src/components/esteira/VoucherRoboActions.tsx` | Remover bloco de invoke |
| `src/components/esteira/VoucherTable.tsx` | Remover blocos de invoke |
| `supabase/functions/voucher-monthly-report/index.ts` | Nova Edge Function — consulta MariaDB, monta HTML, envia via Resend |
| `supabase/config.toml` | Adicionar config para `voucher-monthly-report` |
| SQL (insert tool) | Criar job pg_cron `0 8 1 * *` para disparar o relatório |

