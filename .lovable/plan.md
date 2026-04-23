

## Diagnóstico

O e-mail de `AJUSTE_SOLICITADO` para `AJUSTE_FISCAL` foi para **todos** os usuários com role `FISCAL` / `GESTOR_FISCAL` (fernanda, dayane, thays, marta, etc.) em vez de ir apenas para o fiscal que processou o voucher e o enviou ao Financeiro.

### Causa raiz

Em `supabase/functions/send-voucher-notification/index.ts` (linhas 421-426):

```ts
} else if (data.toStage === "AJUSTE_FISCAL") {
  if (responsaveis?.fiscal_email) {
    toEmails = [responsaveis.fiscal_email];
  } else {
    toEmails = await getRecipientEmails(STAGE_TO_ROLES["AJUSTE_FISCAL"] || []);
    // ↑ broadcast pra TODOS os FISCAL/GESTOR_FISCAL ativos
  }
}
```

`responsaveis.fiscal_email` é resolvido em `mariadb-proxy → get_voucher_responsaveis_emails` a partir de `t_vouchers.responsavel_fiscal_user_id`. Para o voucher `503d2d3d-…/20261566868`, esse campo está **nulo** (legado, escrita falha, ou voucher anterior à lógica em `VoucherFiscalActions.tsx:142`), então a função caiu no fallback — broadcast.

O mesmo padrão existe para `AJUSTE_OPERACAO`, mas lá o fallback é uma lista fixa pequena, então é menos visível. A regra está incorreta: ajuste é uma devolução **direcionada** ao indivíduo que tocou a etapa, não um anúncio pra área inteira.

## Correção (cirúrgica)

### 1. Backend — adicionar fallback baseado em log antes de fazer broadcast

Em `mariadb-proxy/index.ts`, no handler `get_voucher_responsaveis_emails`, quando `fiscal_email` resolver `NULL`, buscar o `user_id` do **último log de aprovação fiscal** desse voucher e resolver o e-mail dele. Mesmo tratamento simétrico para `creator_email` (já existe via `criado_por_user_id`, sem mudança) e para futuras necessidades.

Pseudocódigo do enriquecimento (apenas para `fiscal_email`, sem alterar nada que já funciona):

```sql
-- Se r.fiscal_email IS NULL, fallback:
SELECT u.email, u.username
FROM dados_dachser.t_voucher_logs l
JOIN ai_agente.t_users_dachser u
  ON u.id = l.user_id
WHERE l.voucher_id = ?
  AND l.acao IN ('APROVADO_FISCAL', 'REENVIO_APOS_AJUSTE')
  AND l.user_id IS NOT NULL
  AND l.user_id <> '0'
ORDER BY l.data_hora DESC
LIMIT 1
```

Retornar esse e-mail como `fiscal_email` quando o caminho primário for nulo. Sem mudança de schema.

### 2. Edge `send-voucher-notification` — remover o broadcast cego

No ramo `AJUSTE_SOLICITADO` / `toStage === "AJUSTE_FISCAL"`:
- Se `responsaveis.fiscal_email` existir → enviar **somente** para ele (comportamento atual).
- Se ainda assim vier nulo (caso raro: voucher legado sem nenhum log) → **não** disparar broadcast. Em vez disso:
  - Logar warning explícito.
  - Retornar `{ success: true, sent: 0, reason: "no_specific_fiscal_recipient" }`.
- Resultado: nunca mais um ajuste vira "memo geral" pra área fiscal.

Aplicar a mesma regra de "sem broadcast" para `AJUSTE_OPERACAO`: se `responsaveis.creator_email` for nulo, não cair em `OPERACAO_FIXED_EMAILS`. Hoje a lista fixa é considerada destinatário válido — mas conceitualmente também é um broadcast e deve ser usada apenas como último recurso explícito (mantenho-a pois a área de Operação opera em pool; se o usuário quiser remover também, ajusto).

### 3. Garantir que o caminho primário se popule sempre

Conferir se `VoucherFiscalActions.tsx` (linha 142 e 213) está realmente persistindo `responsavel_fiscal_user_id` no `update_voucher_esteira`. Se o handler do mariadb-proxy estiver ignorando o campo no UPDATE, o problema se repete pra todos os vouchers novos. Vou validar e, se necessário, adicionar o campo na lista de campos updatable do handler `update_voucher_esteira`.

## Arquivos alterados

- `supabase/functions/mariadb-proxy/index.ts` — fallback por log no `get_voucher_responsaveis_emails`; verificar `update_voucher_esteira`.
- `supabase/functions/send-voucher-notification/index.ts` — remover broadcast no ramo `AJUSTE_FISCAL`.
- `mem://vouchers/reporting-and-notification-strategy-v2` — registrar regra: ajuste é **1:1** ao responsável da etapa anterior; nunca broadcast.

## Validação

1. Solicitar novo ajuste do Financeiro → Fiscal no voucher `503d2d3d-…`: deve ir **somente** para o fiscal que aprovou anteriormente (resolvido via fallback de log).
2. Voucher novo: o caminho primário (`responsavel_fiscal_user_id`) já preenchido deve continuar entregando 1 destinatário.
3. Voucher sem nenhum histórico fiscal (caso patológico): nenhum e-mail é disparado, log mostra `no_specific_fiscal_recipient`.
4. Demais notificações (URGENCIA_*, AJUSTE_OPERACAO) não devem ser afetadas.

## Riscos

- Sem alteração de schema.
- Voucher muito antigo sem log nem `responsavel_fiscal_user_id` deixará de notificar. Aceitável: esse é justamente o cenário onde o broadcast hoje gera ruído.

