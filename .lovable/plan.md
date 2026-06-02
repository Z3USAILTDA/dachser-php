## Problema

E-mails de aprovação de urgência estão sendo enviados para múltiplos supervisores em vez de apenas para o supervisor direto do criador do voucher. Dois pontos precisam ser corrigidos:

1. **UserManagement.tsx** (linha 397) filtra `s.id !== user.id` no seletor de supervisor — um usuário supervisor não pode ser definido como o próprio supervisor.
2. **send-voucher-notification/index.ts** (linhas 390-395) faz fallback para `getRecipientEmails(STAGE_TO_ROLES["SUPERVISOR"])` (todos os SUPERVISOR/GESTOR_SUPERVISOR ativos) quando `creator_supervisor_email` está vazio — gera broadcast para todos os supervisores.

## Mudanças

### 1. `src/pages/admin/UserManagement.tsx` (linha 396-402)
Remover o `.filter((s) => s.id !== user.id)`, permitindo que o próprio usuário apareça na lista de supervisores. Assim, um usuário que é supervisor pode ser atribuído como supervisor de si mesmo.

### 2. `supabase/functions/send-voucher-notification/index.ts` (linhas 386-395)
No bloco `URGENCIA_SOLICITADA`, remover o fallback que envia para todos os supervisores. Se `creator_supervisor_email` for nulo, abortar silenciosamente (mesmo padrão já usado em `AJUSTE_SOLICITADO/AJUSTE_OPERACAO` e `AJUSTE_FISCAL`), retornando `{ success: true, sent: 0, reason: "no_creator_supervisor" }` e logando warning.

Nenhuma alteração de schema, RLS ou outros fluxos. Mudanças puramente surgicais.