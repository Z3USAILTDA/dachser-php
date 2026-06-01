## Regra-mestra
Nenhum e-mail da Esteira pode ir para mais de uma pessoa, **exceto o relatório mensal**. Se o destinatário individual não puder ser resolvido, **abortar o envio** (nunca cair em lista fixa nem em role broadcast).

## Diagnóstico

### 1) Ajuste indo para várias pessoas
`supabase/functions/send-voucher-notification/index.ts`:
- `AJUSTE_OPERACAO` (l.415–420): se `creator_email` é nulo (voucher veio da sync, sem `criado_por_user_id`), cai em `OPERACAO_FIXED_EMAILS` — **6 pessoas**.
- `AJUSTE_FISCAL` (l.421–436): já é 1:1 com abort silencioso, está correto.
- `URGENCIA_SOLICITADA`: 1 supervisor (correto) + e-mail separado de confirmação ao solicitante (correto, é outra mensagem).
- `URGENCIA_APROVADA/REJEITADA`: TO = solicitante, CC = supervisor → **2 pessoas**. Vira 1:1 (remover CC; supervisor já agiu no clique e pode receber confirmação separada se necessário, mas hoje o CC é o que infringe a regra).

Fluxos de aprovação (forward) não disparam e-mail — não há broadcast a remover lá.

### 2) Anexos sumindo + gate "anexe a fatura"
`VoucherOperacaoActions.tsx`, `VoucherRascunhoActions.tsx`, `VoucherFiscalActions.tsx`, `VoucherTable.tsx` calculam `hasFatura` em cima de `voucher.anexos` vindo de `get_vouchers_combined`/`get_voucher_by_id`. Em qualquer hipótese de lista vazia silenciosa, o botão "Enviar" trava mesmo com o PDF no Storage. A blindagem `anexos-fetch-resilience` (retry + request-token) só está aplicada na aba Pagamentos.

## Mudanças

### A) Notificações — 1:1 obrigatório, sem fallback de broadcast
Arquivo: `supabase/functions/send-voucher-notification/index.ts`.

1. **Eliminar `OPERACAO_FIXED_EMAILS`** e a entrada `__OPERACAO_FIXED__` em `STAGE_TO_ROLES`.
2. **`AJUSTE_OPERACAO`**: igual ao fiscal — se `creator_email` nulo, tentar fallback de log (último `user_id` com ação `VOUCHER_ENVIADO/RASCUNHO_ENVIADO/MASTER_APROVADO_OPERACAO/REENVIO_APOS_AJUSTE` em `t_voucher_logs`); se mesmo assim não resolver, abortar com `{ sent: 0, reason: "no_specific_operacao_recipient" }`.
3. **`URGENCIA_APROVADA` e `URGENCIA_REJEITADA`**: zerar `ccEmails`. Manter TO = solicitante apenas. Se quiser confirmar ao supervisor, gerar uma segunda invocação separada com TO = supervisor (1:1).
4. **Guard final (defesa em profundidade)**: antes do `resend.emails.send`, se `toEmails.length > 1` **e** `type !== "MONTHLY_REPORT"`, logar warning, truncar para o primeiro e-mail e seguir. Impede regressão futura.

Backend: `supabase/functions/mariadb-proxy/index.ts` → `get_voucher_responsaveis_emails` (l.8235): replicar o mesmo padrão de fallback de log (que hoje só preenche `fiscal_email`) também para `creator_email`.

### B) Relatório mensal — única exceção autorizada
`voucher-monthly-report` permanece como hoje (lista resolvida em `t_users_dachser` + `SEGMENT_EXTRA_EMAILS`). O guard do item A.4 ignora `type` que comece com `REPORT_` / cron consolidado. Documentar em `mem://vouchers/reporting-and-notification-strategy-v2`.

### C) Anexos — blindagem em todas as abas
Arquivo: `supabase/functions/mariadb-proxy/index.ts`.

1. **`get_voucher_anexos`**: aplicar o mesmo retry de `anexos-fetch-resilience`; em erro, retornar 5xx (nunca `[]`).
2. **`get_vouchers_combined` / `get_voucher_by_id`**: o sub-fetch de anexos deve propagar erro de conexão MariaDB em vez de absorver e devolver `anexos: []`. Front trata como "tente novamente" em vez de "sem fatura".
3. **`save_voucher_anexo`**: SELECT pós-INSERT na mesma transação; se a linha não voltar, retornar 500. Front então mostra erro real em vez de "Upload concluído" enganoso.

Frontend (4 arquivos):
4. `VoucherOperacaoActions.tsx`, `VoucherRascunhoActions.tsx`, `VoucherFiscalActions.tsx`, `VoucherTable.tsx`: após `save_voucher_anexo`, re-buscar `get_voucher_anexos` com request-token (helper já existente em `PagamentosTab.tsx`) e só liberar o gate se a fatura voltar. Se o re-fetch falhar/voltar vazio, exibir toast "Falha ao confirmar upload — tente novamente" e manter o botão bloqueado.

### D) Auditoria one-shot (read-only)
Nova ação `audit_orphan_anexos` em `mariadb-proxy`:
- Arquivos em `voucher-anexos` (Storage) sem linha em `t_voucher_anexos`.
- Vouchers OPERACAO/RASCUNHO com `hasFatura=false` mas com log `ANEXO_UPLOAD` recente.

Retorna relatório para confirmar o tamanho do problema e, num passo seguinte (se autorizado), re-vincular.

## Memory updates após implementação
- `mem://vouchers/reporting-and-notification-strategy-v2`: registrar regra "1 destinatário por e-mail (exceto relatório mensal)"; remover menção a `OPERACAO_FIXED_EMAILS`; remover CC do supervisor em URGENCIA_APROVADA/REJEITADA.
- `mem://vouchers/anexos-fetch-resilience`: estender escopo de "aba Pagamentos" para todas as abas (Operação, Rascunho, Fiscal, Tabela).

## Arquivos tocados
- `supabase/functions/send-voucher-notification/index.ts`
- `supabase/functions/mariadb-proxy/index.ts`
- `src/components/esteira/VoucherOperacaoActions.tsx`
- `src/components/esteira/VoucherRascunhoActions.tsx`
- `src/components/esteira/VoucherFiscalActions.tsx`
- `src/components/esteira/VoucherTable.tsx`
- Deploy: `send-voucher-notification`, `mariadb-proxy`

## Confirmação
Posso seguir com tudo acima? Em particular: (a) abortar silenciosamente quando o criador original não puder ser identificado e (b) remover o CC do supervisor nas confirmações de urgência aprovada/rejeitada.