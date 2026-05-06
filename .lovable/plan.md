## Objetivo

1. **Liberar edição** de vouchers tanto em `A_PROCESSAR` quanto em `OPERACAO`.
2. **Prevenir duplicação** na sincronização vinda do RM (caso 105-293183 DIM-BY gerou 2 UUIDs com o mesmo `id_rm` 4663577).
3. **Resolver os duplicados existentes** do processo afetado.

---

## Etapa 1 — Liberar edição em A_PROCESSAR + OPERACAO

**Backend** — `supabase/functions/mariadb-proxy/index.ts`, action `update_voucher_esteira` (linhas ~6651-6699):
- Trocar guard atual (`etapa_atual === 'A_PROCESSAR'`) por:
  ```
  if (!['A_PROCESSAR', 'OPERACAO'].includes(etapa_atual)) → 403
  ```
- Atualizar mensagem de erro: "Edição permitida apenas nas etapas A Processar e Operacional".
- Manter log `VOUCHER_EDICAO_BLOQUEADA` para auditoria nos demais casos (FISCAL, FINANCEIRO, SUPERVISOR, CONCLUIDO, etc.).

**Frontend** — `src/components/esteira/EditVoucherDialog.tsx` (linha ~109):
- Trocar guard front-end:
  ```
  if (!['A_PROCESSAR', 'OPERACAO'].includes(voucher.etapaAtual)) → toast erro
  ```
- Atualizar copy do toast para refletir as duas etapas permitidas.

**Tabela/Listagem** — verificar `VoucherTable.tsx` / `EsteiraIndex.tsx`: garantir que o botão "Editar" apareça também quando `etapaAtual === 'OPERACAO'` (hoje provavelmente já condiciona a `A_PROCESSAR`).

---

## Etapa 2 — Tratar duplicados existentes (105-293183 DIM-BY)

- Deletar 1 dos 2 UUIDs via action `delete_voucher_esteira` (sugestão: manter `cf29d111-19fa-44cd-ae6f-d30b41bf8112`, remover `f5c0fe62-53c3-40a3-a2e2-f58212315724`).
- Registrar log `VOUCHER_DELETADO_DUPLICADO_ADMIN` em `t_vouchers_logs` com motivo + id removido.
- Após Etapa 1 estar no ar, o UUID restante (em `OPERACAO`) já estará editável — **não precisa** reverter etapa.

---

## Etapa 3 — Prevenir duplicação no sync RM

No `mariadb-proxy`, actions `voucher_sync_rm_pending` e `voucher_integrate_rm`:

- Antes de cada `INSERT INTO t_vouchers`, executar guarda:
  ```sql
  SELECT id FROM t_vouchers
   WHERE id_rm = ? AND numero_spo = ? AND ativo = 1
   LIMIT 1;
  ```
  Se já existir → pular insert e logar `VOUCHER_RM_DUPLICADO_IGNORADO` (com `id_rm`, `numero_spo`, `usuario_origem`, `id_existente`).

- Pre-check em produção antes de criar índice único:
  ```sql
  SELECT id_rm, numero_spo, COUNT(*) c
    FROM t_vouchers
   WHERE id_rm IS NOT NULL AND ativo = 1
   GROUP BY id_rm, numero_spo
   HAVING c > 1;
  ```

- Se pre-check vier limpo (ou após limpar duplicados):
  ```sql
  ALTER TABLE t_vouchers
    ADD UNIQUE KEY uq_voucher_rm_spo (id_rm, numero_spo);
  ```
  Aplicado via action SQL admin existente. Caso o pre-check encontre outros duplicados, **paro e reporto** antes de criar o índice.

---

## Detalhes técnicos

**Arquivos afetados**
- `supabase/functions/mariadb-proxy/index.ts` — guard de edição + hardening sync RM + (opcional) action SQL admin para o ALTER TABLE
- `src/components/esteira/EditVoucherDialog.tsx` — guard front-end + copy
- Possível ajuste em `src/components/voucher/VoucherTable.tsx` e/ou `src/pages/esteira/EsteiraIndex.tsx` para liberar botão Editar em `OPERACAO`

**Logs novos**
- `VOUCHER_DELETADO_DUPLICADO_ADMIN`
- `VOUCHER_RM_DUPLICADO_IGNORADO`

**Sem mudanças** em UI fora do dialog/tabela, autenticação, RLS Supabase, schema relacional além do índice único.

**Memória a atualizar** após implementação: `mem://vouchers/workflow-logic-and-stages-v6` — registrar que edição é permitida em `A_PROCESSAR` **e** `OPERACAO`.

---

## Pontos de confirmação

1. Confirma manter `cf29d111…` e deletar `f5c0fe62…`?
2. Posso aplicar o `UNIQUE (id_rm, numero_spo)` em `t_vouchers` após pre-check? (Se houver outros duplicados, paro e reporto.)
3. A liberação `A_PROCESSAR + OPERACAO` vale para todos os perfis que hoje editam (Operação, Supervisor, ADMIN), ou alguma role deve continuar restrita?
