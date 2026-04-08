

## Plano: Aprovar/Rejeitar Voucher Urgente Diretamente pelo E-mail

### Conceito
Quando um voucher urgente chegar ao Supervisor, o e-mail conterá dois botões: **"Aprovar"** e **"Rejeitar"**. Cada botão será um link para uma nova edge function que processa a ação automaticamente, sem necessidade de login no sistema.

### Segurança
Cada notificação gerará um **token único** (UUID) salvo no MariaDB junto ao `voucher_id` e `ação permitida`. O token expira em 48h. Ao clicar, a edge function valida o token antes de executar a ação.

### Alterações

**1. Backend — Nova edge function `supervisor-email-action/index.ts`**
- Recebe via query params: `token`, `action` (approve/reject)
- Valida o token no MariaDB (tabela `t_supervisor_email_tokens`)
- Se válido e não expirado:
  - **Approve**: atualiza voucher para `etapa_atual = FINANCEIRO`, `status_financeiro = APROVADO`, loga ação, envia notificação ao Financeiro
  - **Reject**: atualiza voucher para `etapa_atual = OPERACAO`, `status_financeiro = REJEITADO`, loga ação
- Marca token como usado
- Retorna uma página HTML simples com confirmação visual (sucesso ou erro)

**2. Backend — Tabela MariaDB `t_supervisor_email_tokens`**
- Criada via action no `mariadb-proxy` (setup)
- Colunas: `id`, `token` (VARCHAR 36, UNIQUE), `voucher_id`, `action_type` (APPROVE/REJECT), `used` (BOOLEAN), `expires_at` (DATETIME), `created_at`

**3. Backend — `mariadb-proxy/index.ts`**
- Nova action `create_supervisor_token`: gera 2 tokens (approve + reject) para um voucher, retorna os tokens
- Nova action `validate_supervisor_token`: valida e retorna dados do token
- Nova action `setup_supervisor_tokens_table`: cria a tabela se não existir

**4. Backend — `send-voucher-notification/index.ts`**
- Quando `type = "VOUCHER_ENVIADO"` e `toStage = "SUPERVISOR"`: gerar tokens via mariadb-proxy e adicionar botões "Aprovar" (verde) e "Rejeitar" (vermelho) no HTML do e-mail, apontando para a edge function `supervisor-email-action`

**5. Frontend — `VoucherOperacaoActions.tsx`** (onde envia ao Supervisor)
- Sem alterações — os tokens são gerados dentro da edge function de notificação, transparente ao frontend

### Fluxo

```text
Operação marca urgente
  → send-voucher-notification (toStage=SUPERVISOR)
    → Gera 2 tokens (approve/reject) no MariaDB
    → E-mail com botões "Aprovar ✓" e "Rejeitar ✗"
      → Supervisor clica "Aprovar"
        → GET supervisor-email-action?token=xxx&action=approve
          → Valida token → Atualiza voucher → Página de sucesso
```

### Arquivos alterados/criados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/supervisor-email-action/index.ts` | **Novo** — processa ação do supervisor via link |
| `supabase/functions/mariadb-proxy/index.ts` | Novas actions: `create_supervisor_token`, `setup_supervisor_tokens_table` |
| `supabase/functions/send-voucher-notification/index.ts` | Gerar tokens e adicionar botões Aprovar/Rejeitar no e-mail do Supervisor |

### Resultado esperado
O supervisor recebe um e-mail com dois botões claros. Ao clicar em "Aprovar", o voucher avança para Financeiro automaticamente. Ao clicar em "Rejeitar", volta para Operação. Uma página HTML confirma a ação ao supervisor.

