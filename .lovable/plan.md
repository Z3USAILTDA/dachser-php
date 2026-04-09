

## Plano: Corrigir Envio de E-mail + Botões Aprovar/Rejeitar na Tabela

### Problema 1: E-mail não enviado
As edge functions `send-voucher-notification` e `supervisor-email-action` existem no código mas **não estão deployadas** (logs vazios). Além disso, o `CreateVoucherDialog.tsx` **não chama** `send-voucher-notification` após criar o voucher — então mesmo que as functions estivessem deployadas, nenhum e-mail seria disparado na criação.

### Problema 2: Botões na tela inicial
Quando um voucher urgente está na etapa SUPERVISOR, a tabela principal (`VoucherTable.tsx`) mostra apenas o menu de ações padrão. Os botões de Aprovar/Rejeitar só aparecem na tela de detalhes (`VoucherSupervisorActions.tsx`). O usuário quer esses botões diretamente na linha da tabela.

### Alterações

**1. `src/components/esteira/CreateVoucherDialog.tsx`**
- Após a criação bem-sucedida do voucher (depois dos uploads e log), enviar notificação via `send-voucher-notification` com `type: "VOUCHER_ENVIADO"` e `toStage: etapaAtual` (SUPERVISOR ou FISCAL)
- Incluir dados completos: voucherId, voucherNumber, fornecedor, valor, moeda, vencimento

**2. `src/components/esteira/VoucherTable.tsx`**
- Na coluna de ações (última coluna), quando `voucher.etapaAtual === "SUPERVISOR"` e `voucher.urgenciaTipo === "URGENTE_REAL"`, renderizar dois botões inline:
  - **✓ Aprovar** (verde) — chama a mesma lógica de `VoucherSupervisorActions.handleAprovar` (update voucher → FINANCEIRO, log, notificação)
  - **✗ Rejeitar** (vermelho) — abre dialog para motivo, mesma lógica de `handleRejeitar` (update → OPERACAO, log)
- Extrair a lógica de aprovar/rejeitar para um hook ou funções reutilizáveis, ou duplicar inline com os mesmos calls ao `mariadb-proxy`

**3. Deploy das edge functions**
- Deployar `send-voucher-notification` e `supervisor-email-action`

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `src/components/esteira/CreateVoucherDialog.tsx` | Enviar notificação por e-mail após criação do voucher |
| `src/components/esteira/VoucherTable.tsx` | Botões Aprovar/Rejeitar inline para vouchers SUPERVISOR + URGENTE_REAL |
| Edge functions | Deploy de `send-voucher-notification` e `supervisor-email-action` |

