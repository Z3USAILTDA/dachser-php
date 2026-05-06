## Relatório Técnico — Módulo Esteira do Voucher

Vou produzir um documento Markdown extenso e 100% técnico em `/mnt/documents/esteira-voucher-relatorio-tecnico.md` (com versão PDF opcional), cobrindo **toda** a arquitetura, fluxo, regras de negócio, integrações e operações do módulo. Não envolve mudanças de código — é apenas geração de artefato.

### Escopo do relatório

**1. Visão geral arquitetural**
- Stack (React+Vite+TS, Tailwind, Supabase Edge, MariaDB `dados_dachser`)
- Diagrama de camadas: UI → Edge Functions → MariaDB / Storage / Lovable AI
- Mapa de tabelas envolvidas: `t_vouchers`, `t_vouchers_anexos`, `t_vouchers_logs`, `t_dados_financeiro_voucher`, `t_dados_rm`, `t_dados_rm_pending`, `t_remessa_lote`, `t_remessa_item`, `t_voucher_baixas`, `t_accrual`, `t_users_esteira_role`, `t_fornecedores_sem_fiscal`, `t_voucher_rules`, `t_email_voucher_log`

**2. Modelo de dados e estados**
- Enum completo: `EtapaAtual`, `StatusBaixa`, `StatusFinanceiro`, `StatusComprovante`, `TipoExecucaoPagamento`, `StatusPagamento`, `StatusLoteRemessa`, `UrgenciaTipo`, `FormaPagamento`, `TipoAnexo`, `UserRole`
- SLA por etapa (SLA_POR_ETAPA), urgência automática vs real
- Estrutura `Voucher`, `Anexo`, `LogEntry`, `RemessaLote/Item`, `DadosBancarios`

**3. Roles e segurança**
- `useUserRole`: leitura via `t_users_esteira_role` + cache 60s + fallback admin
- Matriz de permissões: criar/editar/deletar/aprovar/voltar etapa/cancelar/desmembrar
- Visibilidade de menus e abas por role
- Bypass de admin e regras de gestor (`GESTOR_*`)

**4. Ciclo de vida do voucher (workflow)**
- Origens: MANUAL (Operação), RM pending (`voucher-sync-rm-pending` + Othello webhook), MASTER (consolidação)
- Transições: A_PROCESSAR → RASCUNHO → OPERACAO → FISCAL → SUPERVISOR → FINANCEIRO → ROBO → CONCLUIDO
- Caminhos de exceção: AJUSTE_OPERACAO / AJUSTE_FISCAL / CANCELADO
- Bypass urgente (Auto e Real) → vai direto p/ Supervisor (memória `urgent-routing-and-logic-v2`)
- Notificações por etapa (`esteiraNotifications.ts` + `send-voucher-notification`)
- Rastreio de responsáveis por etapa (campos `responsavel*UserId/Name`)
- Logs de auditoria (`t_vouchers_logs`) e bug conhecido de edição silenciosa

**5. UI — Páginas e componentes**
- `EsteiraIndex` (2.287 linhas): hub principal, abas, polling, filtros, paginação, modos (Backlog/Faturas do Dia/Pagamentos/Comprovantes/Histórico)
- `VoucherTable`, `VoucherFilters`, `VoucherActionsMenu`
- Dialogs: Create/Edit/Cancel/Desmembrar/RetornarPendente/InviteUser/FornecedoresSemFiscal
- Painéis por etapa: `VoucherRascunhoActions`, `VoucherOperacaoActions`, `VoucherFiscalActions`, `VoucherSupervisorActions`, `VoucherFinanceiroActions`, `VoucherRoboActions`
- `VoucherDetailsView`, `ProcessoOrigemCard`, `ProntidaoChecklist`, `DadosPagamentoPanel`, `VoucherDivergenceAlert`, `AccrualMatchBadge`, `StatusComprovanteBadge`
- Páginas auxiliares: `EsteiraDashboard`, `EsteiraReports`, `EsteiraManual`, `VoucherRules`, `AccrualManagement`, `ComprovanteRobot`, `EmailPreview`, `EsteiraVoucherDetails`, `EsteiraUserManagement`

**6. Backend — Edge Functions (12)**
Cada uma com: propósito, payload, ações (cases), tabelas tocadas, regras críticas:
- `mariadb-proxy` (~18k linhas, ~150 actions): hub central — CRUD vouchers, anexos, logs, baixas, RM, master, audit, reversal
- `voucher-mariadb-sync` — sync periódico
- `voucher-sync-rm-pending` — espelha `t_dados_rm_pending` em `t_vouchers`
- `voucher-integrate-rm` — leitura `t_dados_rm` por nd
- `voucher-othello-webhook` — recepção do RM
- `voucher-check-baixas` — reconciliação
- `voucher-monthly-report` — relatório consolidado
- `extract-boleto-barcode` — Lovable AI Gateway, suporta bancário (47) e arrecadação (48)
- `parse-comprovante-pdf` — robô comprovantes
- `fetch-fin-voucher-stats` — dashboard
- `send-voucher-notification` — Resend
- `supervisor-email-action` — aprovação via e-mail externa

**7. Pagamentos & RM**
- `PagamentosTab` (1.654 linhas): grid de pagamento, definição de `tipoExecucaoPagamento`, geração de remessa
- `insert_dados_rm` com fallback `linha_digitavel/chave_pix` (memória `insert-dados-rm-fallback`)
- `check_voucher_rm_ready` — gate para vouchers vindos do RM (memória `check-rm-ready-only-blocks-manual`)
- Numeração master (memória `master-numbering-logic-v1`)
- Sincronização cron de status (1 min)

**8. Comprovantes & Baixas**
- `ComprovanteRobot`: matching ND (10–13 dígitos) por `linha_digitavel/codigo_barras/nd` (memória `comprovante-robot-matching-rules`)
- `HistoricoBaixasTab`: filtros, mapeamento de status (memória `write-off-history-logic-v4`)
- Resiliência de anexos (memória `anexos-fetch-resilience`)

**9. Regras de negócio sensíveis**
- Urgente Auto vs Real (D-1, D-0)
- Fornecedores sem fiscal — bypass do Fiscal
- ADF — documento opcional
- Voucher Master — agrupamento, numeração herdada do filho com menor `idmov`/`id_rm`
- Voltar etapa — restrições por role + log obrigatório
- Cancelamento — exige motivo + voucher de crédito
- Edição administrativa (`revert_voucher_field`) — usada para correções fora do fluxo

**10. Integrações externas**
- Lovable AI Gateway (LOVABLE_API_KEY) para extract-boleto e parse-comprovante
- Resend para e-mails (templates HTML)
- Supabase Storage `voucher-anexos` (público)
- MariaDB FIN (`MARIADB_FIN_*`) — collation `utf8mb4_unicode_ci`, `NULLIF(?, '')` para datas

**11. Cron jobs e automações**
- `voucher-sync-rm-pending` (1 min)
- `voucher-check-baixas`
- `voucher-monthly-report`
- Cron-manager UI

**12. Logs, auditoria e bugs conhecidos**
- Estrutura `t_vouchers_logs` + tipos de evento
- Bug de edição silenciosa de vencimento (caso 105-292893 DIM-BY) — diagnóstico, reversão e ação corretiva sugerida
- `audit_voucher_diff` e `revert_voucher_field`

**13. Memórias de projeto referenciadas**
Lista compacta das ~25 memórias `mem://vouchers/*` e seus impactos.

**14. Anexos técnicos**
- Diagrama de máquina de estados (texto/ASCII)
- Tabela completa de actions do `mariadb-proxy` agrupadas por domínio
- Glossário (SPO, ND, RM, ADF, Accrual, Remessa, CRASS)

### Formato de entrega

```text
/mnt/documents/esteira-voucher-relatorio-tecnico.md   (markdown principal, ~30-50 páginas)
/mnt/documents/esteira-voucher-relatorio-tecnico.pdf  (opcional, gerado via pandoc)
```

Sem alterações de código. Apenas exploração + geração de artefato + QA visual do PDF (se gerado).

### Confirme antes de eu executar

1. **Profundidade**: ok cobrir os 14 blocos acima (relatório longo, ~30-50 páginas), ou prefere foco em algum sub-conjunto (ex.: só backend, só workflow, só regras de negócio)?
2. **Formato**: só Markdown, ou também PDF?
3. **Inclusão de trechos de código**: incluir snippets-chave (SQL, TS) das funções críticas, ou manter 100% descritivo?
