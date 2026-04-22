

## Diagnóstico
Hoje, ao disparar `URGENCIA_SOLICITADA`:
- **TO:** supervisor direto
- **CC:** solicitante ← **risco de segurança**: o solicitante recebe os botões "Aprovar/Rejeitar" e pode auto-aprovar a própria urgência clicando no link do próprio e-mail.

O usuário quer fechar essa brecha: **somente o supervisor deve ter acesso aos botões de ação**, e o solicitante recebe um e-mail informativo separado, sem botões.

## Mudanças propostas

### 1. Novo tipo: `URGENCIA_SOLICITADA_CONFIRMACAO`
Em `supabase/functions/send-voucher-notification/index.ts`:
- Adicionar ao union `type`: `URGENCIA_SOLICITADA_CONFIRMACAO`.
- Nova entrada em `cfgMap` (título "Solicitação de Urgência Enviada", cor info/verde).
- Novo bloco em `getEmailContent` com texto:
  > "Sua solicitação de urgência para o voucher **{numero}** foi enviada ao supervisor. Você será notificado assim que houver aprovação ou rejeição."
- **Sem botões** Aprovar/Rejeitar, sem anexos.

### 2. Roteamento de destinatários
No bloco existente `URGENCIA_SOLICITADA` (linhas ~381–389):
- **Remover** `ccEmails = [responsaveis.creator_email]`.
- Manter TO = supervisor direto (com fallback atual para roles SUPERVISOR/GESTOR_SUPERVISOR).
- Manter Reply-To = solicitante (supervisor ainda responde direto a quem pediu).

No novo bloco `URGENCIA_SOLICITADA_CONFIRMACAO`:
- TO = `responsaveis.creator_email` apenas.
- Sem CC, sem Reply-To especial.

### 3. Disparo paralelo no frontend
Em `CreateVoucherDialog.tsx` (~linha 684) e `VoucherOperacaoActions.tsx` (~linha 364), logo após o `invoke` de `URGENCIA_SOLICITADA`, adicionar segundo `invoke` independente com `type: 'URGENCIA_SOLICITADA_CONFIRMACAO'`, reaproveitando `voucherId`, `voucherNumber`, `senderName`. Cada envio em try/catch isolado — falha em um não impede o outro.

### 4. Memória
Atualizar `mem://vouchers/reporting-and-notification-strategy-v2` na seção **Alerta 2**:
- Trocar "CC: solicitante" por "Solicitante recebe e-mail informativo separado (`URGENCIA_SOLICITADA_CONFIRMACAO`), sem botões — garante que apenas o supervisor possa aprovar/rejeitar".
- Manter Reply-To = solicitante no e-mail do supervisor.

## Benefício de segurança
Os links de Aprovar/Rejeitar usam tokens 48h validados em `supervisor-email-action`, mas a posse do link é o controle de acesso. Removendo o solicitante do CC, **só o supervisor recebe os tokens** — eliminando auto-aprovação por encaminhamento ou acesso direto à caixa de entrada do solicitante.

## Arquivos alterados
- `supabase/functions/send-voucher-notification/index.ts` — novo tipo, novo template, remoção do CC do bloco URGENCIA_SOLICITADA.
- `src/components/esteira/CreateVoucherDialog.tsx` — segundo invoke.
- `src/components/esteira/VoucherOperacaoActions.tsx` — segundo invoke.
- `mem://vouchers/reporting-and-notification-strategy-v2` — atualizar regra com justificativa de segurança.

## Validação
1. Criar voucher novo marcado como **URGENTE_REAL**.
2. Confirmar:
   - Caixa do supervisor: e-mail com botões Aprovar/Rejeitar; **solicitante NÃO está no CC**.
   - Caixa do solicitante: e-mail informativo "Sua solicitação foi enviada ao supervisor", sem botões.
3. Repetir editando voucher existente para urgente em `VoucherOperacaoActions`.
4. Confirmar que aprovação/rejeição posterior continuam disparando `URGENCIA_APROVADA`/`URGENCIA_REJEITADA` para o solicitante (fluxo inalterado).

## Riscos
- **Sem alteração de schema** — apenas roteamento de e-mail.
- **Volume**: dobra para urgências (1 supervisor + 1 solicitante), efeito desejado.
- **Reply-To preservado**: supervisor ainda pode responder ao solicitante diretamente fora do fluxo de botões.

