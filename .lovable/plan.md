## Objetivo

Reverter para `A_PROCESSAR` todos os vouchers que estão hoje em `OPERACAO` mas **não possuem nenhum registro** em `t_voucher_logs` — sinal claro de que nunca foram efetivamente enviados/manipulados pelo usuário (como o exemplo `105-260050 DIM-BY` da imagem, com histórico vazio).

## O que será feito

1. **Nova action no `mariadb-proxy`** (`reset_operacao_sem_logs_para_a_processar`):
   - `SELECT v.id, v.numero_spo, v.criado_por_user_id` em `t_vouchers` onde `etapa_atual = 'OPERACAO'` e `NOT EXISTS (SELECT 1 FROM t_voucher_logs l WHERE l.voucher_id = v.id)`.
   - `UPDATE t_vouchers SET etapa_atual = 'A_PROCESSAR', updated_at = NOW()` nos ids encontrados.
   - Insere um log por voucher em `t_voucher_logs` com `acao = 'ETAPA_ALTERADA_SISTEMA'` e detalhe `"Voucher movido de OPERACAO para A_PROCESSAR — sem histórico de ações (correção retroativa: nunca foi enviado pelo usuário)."`.
   - Retorna `{ success, total, samples }` (padrão idêntico ao `backfill_vouchers_sem_anexo_para_operacao` já existente em `mariadb-proxy/index.ts:8149`).

2. **Execução única**: chamar a action via `supabase--curl_edge_functions` para aplicar a correção imediatamente na base. O resultado mostra a contagem de vouchers movidos e uma amostra para validação.

## Escopo / não-escopo

- **Apenas** `etapa_atual = 'OPERACAO'`. Não toca em `AJUSTE_OPERACAO`, `FISCAL`, `SUPERVISOR`, `FINANCEIRO`, `CONCLUIDO`, `CANCELADO`, `RASCUNHO`, `A_PROCESSAR`.
- Critério de "sem logs" = zero linhas em `t_voucher_logs` para aquele `voucher_id`. Vouchers com qualquer log (mesmo `VOUCHER_CRIADO`) permanecem em OPERACAO.
- Não altera anexos, dados financeiros, sync_status, criado_por_user_id.
- Action permanente: pode ser reexecutada a qualquer momento; também serve como mecanismo de auto-correção pontual.

## Verificação pós-execução

- Abrir o voucher `105-260050 DIM-BY` (exemplo da imagem) — deve aparecer com badge `A_PROCESSAR` em vez de `OPERACAO`, e o histórico passa a ter 1 linha (`ETAPA_ALTERADA_SISTEMA`).
- Resposta da action lista `total` e `samples` para conferência rápida.
