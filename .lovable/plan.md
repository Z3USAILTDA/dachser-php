

# Remover OPERACAO dos destinatarios de e-mail

## Alteracao

Remover a role OPERACAO (e GESTOR_OPERACAO) da lista de destinatarios de e-mail. Como a Operacao e quem inicia o processo, nao faz sentido notifica-los por e-mail.

## Mapeamento atualizado de etapa para destinatarios

| Etapa destino | Roles notificadas |
|---|---|
| ~~OPERACAO / AJUSTE_OPERACAO~~ | ~~Ninguem~~ — sem envio de e-mail |
| FISCAL / AJUSTE_FISCAL | FISCAL, GESTOR_FISCAL |
| SUPERVISOR | SUPERVISOR, GESTOR_SUPERVISOR |
| FINANCEIRO / ROBO | FINANCEIRO, GESTOR_FINANCEIRO |
| CONCLUIDO | Ninguem (ou apenas log) |

## Impacto tecnico

Quando o voucher for devolvido para OPERACAO (ex: ajuste solicitado pelo Fiscal ou Supervisor), o sistema **nao** enviara e-mail. Apenas as transicoes para FISCAL, SUPERVISOR e FINANCEIRO dispararao notificacoes.

Isso sera aplicado no helper `notifyStageUsers` (a ser criado em `src/utils/esteiraNotifications.ts`) e nos componentes de acao que devolvem para OPERACAO:

- `VoucherFiscalActions.tsx` — ao devolver para AJUSTE_OPERACAO: sem e-mail
- `VoucherFinanceiroActions.tsx` — ao devolver para AJUSTE_OPERACAO: sem e-mail
- `VoucherSupervisorActions.tsx` — ao rejeitar urgencia (volta para OPERACAO): sem e-mail

