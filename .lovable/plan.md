

## Ajustes no sistema de alertas da Esteira

### 1. Aprovação de urgência por Supervisor → e-mail direcionado + cópia
**Quando:** voucher é criado/enviado com `URGENTE_REAL` (etapa SUPERVISOR) — fluxos em `CreateVoucherDialog.tsx` e `VoucherOperacaoActions.tsx`.

**Mudanças:**
- Em `send-voucher-notification`, substituir o override fixo (`larissa@z3us.ai`) por uma resolução dinâmica:
  - Buscar o `criado_por_user_id` do voucher → buscar `supervisor_id` desse usuário em `t_users_dachser` → e-mail do supervisor vai para `to`.
  - E-mail do criador vai para `cc`.
  - Fallback: se não houver supervisor vinculado, mantém comportamento atual (todos os SUPERVISOR/GESTOR_SUPERVISOR) e cc no criador.
- Após aprovação/rejeição (tanto via `VoucherSupervisorActions.tsx`, `VoucherTable.tsx`, quanto via `supervisor-email-action`):
  - Disparar novo tipo `URGENCIA_APROVADA` ou reusar `VOUCHER_ENVIADO` (aprovado) e `URGENCIA_REJEITADA` (já existe), enviando para **supervisor (to) + criador (cc)** com dados completos do voucher.
  - Em rejeição, incluir o `motivo` (já existe campo `reason` no template).

### 2. Retorno para etapa anterior → notificar responsável anterior
**Quando:** qualquer "devolver/ajustar" em:
- `VoucherFiscalActions.tsx` (Fiscal → AJUSTE_OPERACAO)
- `VoucherFinanceiroActions.tsx` (Financeiro → AJUSTE_OPERACAO ou AJUSTE_FISCAL)
- `VoucherSupervisorActions.tsx` / `VoucherTable.tsx` (Supervisor → AJUSTE_OPERACAO)
- `PagamentosTab.tsx` (Financeiro → AJUSTE_FISCAL/OPERACAO)

**Lógica de "responsável anterior":**
- Se devolução vai para `AJUSTE_OPERACAO` → destinatário = usuário em `criado_por_user_id` (quem criou).
- Se devolução vai para `AJUSTE_FISCAL` → destinatário = usuário em `responsavel_fiscal_user_id` (último que tratou na etapa Fiscal).
- Se nenhum estiver setado, fallback para a lista atual de roles da etapa.

**Mudanças:**
- Adicionar action `get_user_email_by_id` em `mariadb-proxy` (ou expandir `get_voucher_by_id` para retornar emails dos responsáveis).
- Em `send-voucher-notification`, no tipo `AJUSTE_SOLICITADO`, resolver destinatário individual a partir do `voucherId` + `toStage`. O remetente (`senderName`) e motivo (`reason`) já existem no payload.

### 3. Relatório mensal segmentado por função
**Arquivo:** `voucher-monthly-report/index.ts` (hoje envia tudo só para `larissa@z3us.ai`).

**Nova estratégia — múltiplos e-mails ao final do mês:**
- **Relatório completo (todos os vouchers do mês, todas etapas)** → `bia.souza@dachser.com`, `fernanda.ribeiro@dachser.com`, `larissa@z3us.ai`.
- **Relatório por função** filtrando apenas vouchers que passaram pela etapa correspondente no mês:
  - `FISCAL` → todos usuários ativos com role FISCAL/GESTOR_FISCAL **+** `marta.silva@dachser.com`.
  - `OPERACAO` → todos usuários ativos com role OPERACAO/GESTOR_OPERACAO **+** `cleiciane.faconi@dachser.com`, `luciana.vulcano@dachser.com`.
  - `SUPERVISOR` → todos usuários ativos com role SUPERVISOR/GESTOR_SUPERVISOR.
  - `FINANCEIRO` → todos usuários ativos com role FINANCEIRO/GESTOR_FINANCEIRO.

**Filtragem por etapa:** consultar `t_voucher_log` (ou `acao` LIKE) para identificar quais vouchers tiveram passagem em cada etapa no mês — tabela já alimentada por `save_voucher_log`.

### Arquivos que serão alterados
| Arquivo | Mudança |
|---|---|
| `supabase/functions/send-voucher-notification/index.ts` | Resolução dinâmica de destinatário (supervisor vinculado, responsável anterior), suporte a `cc`, novos tipos se necessário |
| `supabase/functions/mariadb-proxy/index.ts` | Nova action `get_voucher_responsaveis_emails` (retorna emails de criador, fiscal, supervisor, financeiro do voucher) |
| `supabase/functions/supervisor-email-action/index.ts` | Após aprovar/rejeitar via link, disparar e-mail de confirmação para supervisor + criador |
| `supabase/functions/voucher-monthly-report/index.ts` | Múltiplos envios segmentados por função + extras fixos |
| `src/components/esteira/VoucherFiscalActions.tsx` | Ao devolver, chamar `send-voucher-notification` com `AJUSTE_SOLICITADO` |
| `src/components/esteira/VoucherFinanceiroActions.tsx` | Idem nos dois `handleDevolver*` |
| `src/components/esteira/VoucherSupervisorActions.tsx` | No `handleRejeitar`, disparar notificação de retorno |
| `src/components/esteira/VoucherTable.tsx` | Idem na rejeição inline |
| `src/components/esteira/PagamentosTab.tsx` | Idem na devolução do Financeiro |
| `src/utils/esteiraNotifications.ts` | Adicionar helper `shouldNotifyReturnStage` para AJUSTE_OPERACAO/AJUSTE_FISCAL |

### Observações importantes
- O remetente continua `noreply@hermes.z3us.ai` (Resend já configurado).
- Envio de anexos no e-mail de aprovação/rejeição mantém-se opcional (já existe lógica).
- O cron mensal já existe (chama `voucher-monthly-report`); não muda agendamento, só conteúdo/destinatários.
- Memória será atualizada em `mem://vouchers/reporting-and-notification-strategy-v2`.

