## Cenário 1 — Múltiplos comprovantes para a mesma SPO (mesmo concluída)

**Causa raiz:** após o 1º comprovante, o voucher recebe `status_comprovante='VALIDADO'` e (quando o financeiro conclui) `etapa_atual='CONCLUIDO'`. Hoje:
- `get_vouchers_for_comprovante` (lista do dropdown manual) filtra apenas `etapa_atual IN ('FINANCEIRO','ROBO')` → SPO concluída desaparece.
- `find_voucher_multi` (identificação automática do robô) **encontra** a SPO em qualquer etapa, mas `attach_comprovante_batch` faz `UPDATE status_comprovante='VALIDADO'` sem mexer em `etapa_atual` — porém, se a etapa for `CONCLUIDO`, o robô deve continuar permitindo o anexo (regra do usuário: associação automática deve funcionar mesmo concluído).

### Correção (cirúrgica)

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

1. **`get_vouchers_for_comprovante` (linha ~12095):** ampliar o filtro para incluir SPOs concluídas ativas:
   ```sql
   WHERE etapa_atual IN ('FINANCEIRO','ROBO','CONCLUIDO')
     AND (sync_status IS NULL OR sync_status = 'ATIVO')
     AND etapa_atual NOT IN ('CANCELADO','AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')
   ```
   Adicionar no SELECT um campo `already_has_comprovante = (status_comprovante IN ('ANEXADO','VALIDADO'))` para o front exibir badge "já possui comprovante".

2. **`attach_comprovante_batch` (linha ~12125):** ajustar para preservar a etapa quando o voucher já estiver `CONCLUIDO`:
   - Antes do UPDATE, ler `etapa_atual` do voucher.
   - Se `etapa_atual = 'CONCLUIDO'`: **apenas** inserir o novo registro em `t_voucher_anexos` e gravar log `COMPROVANTE_ADICIONAL_ANEXADO`. Não tocar em `status_comprovante`/`etapa_atual` (preserva a conclusão).
   - Caso contrário: comportamento atual (INSERT anexo + UPDATE `status_comprovante='VALIDADO'` + log `COMPROVANTE_ANEXADO`).

3. **`find_voucher_multi` (linha ~11641):** **sem mudanças** — já encontra vouchers em qualquer etapa, garantindo a associação automática mesmo para SPOs concluídas.

### UI (frontend)

**Arquivo:** `src/pages/esteira/ComprovanteRobot.tsx`
- No dropdown de associação manual (`availableVouchers`), exibir sufixo `(já possui comprovante)` quando `already_has_comprovante` for true. Sem outras mudanças no fluxo.
- Nenhuma mudança no fluxo de identificação automática — voucher concluído já é identificado pelo `find_voucher_multi` e processado normalmente.

---

## Cenário 2 — Forma "Débito": concluir SPO ao "Marcar como Pronto"

**Causa raiz:** em `forma_pagamento='DEBITO'` não há comprovante físico (baixa direto no extrato). Hoje "Marcar como Pronto" move o voucher para `etapa_atual='ROBO'` e ele fica preso aguardando comprovante.

### Correção (cirúrgica)

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` — action `set_ready_for_robo` (linha ~10857):

1. Ler também `forma_pagamento` no SELECT inicial.
2. Se `forma_pagamento = 'DEBITO'` e `is_pronto = true`: pular `ROBO` e ir direto para conclusão:
   ```sql
   UPDATE t_vouchers SET
     is_pronto_para_robo = 1,
     status_pagamento = 'PAGO',
     status_baixa = 'BAIXA_DEBITO',
     status_financeiro = 'CONCLUIDO',
     status_comprovante = 'NAO_APLICA',
     etapa_atual = 'CONCLUIDO',
     updated_at = NOW()
   WHERE id = ?
   ```
3. Inserir log `BAIXA_DEBITO_AUTOMATICA` em `t_voucher_logs`: "Voucher concluído via débito automático — sem comprovante necessário".
4. Para qualquer outra forma de pagamento, **manter exatamente** o comportamento atual (vai para `ROBO` + `BAIXA_MANUAL`/`BAIXA_REMESSA`).

### UI (frontend)

**Arquivo:** `src/components/esteira/PagamentosTab.tsx` — `handleSetReady` (linha ~496):
- No toast de sucesso, quando `forma_pagamento === 'DEBITO'` e `isReady`, exibir "Voucher concluído (Débito automático)".

**Tipo:** `src/types/voucher.ts` — adicionar `'BAIXA_DEBITO'` em `StatusBaixa` e `'NAO_APLICA'` em `StatusComprovante` (verificar antes para não duplicar).

---

## Sem mudanças
- Sem alteração na lógica de matching do `find_voucher_multi` — voucher concluído continua sendo encontrado pelo robô.
- Sem alteração em RLS, layout, badges existentes ou outras formas de pagamento.
- Sem migrações de schema (todas as colunas já existem).

## Resultado
- **Cenário 1:** robô **identifica e anexa automaticamente** comprovantes adicionais em SPOs já concluídas, sem reverter a conclusão. Lista manual também passa a mostrar SPOs concluídas marcadas com badge.
- **Cenário 2:** vouchers com forma "Débito" são concluídos automaticamente ao "Marcar como Pronto", sem necessidade de anexar comprovante.
