## Diagnóstico

Na tela **Financeiro › Disputas** (`/financeiro/disputa`), o "excluir" devolve sucesso visualmente, mas o registro reaparece no próximo refresh. A causa está no **mariadb-proxy**, nos handlers `delete_disputa_cr` e `bulk_delete_disputas_cr`:

- O front-end envia ao backend o campo `nf` (single) ou `doc_keys` (bulk).
- Esses valores vêm da `get_disputas_cr`, onde:
  - `nf = COALESCE(numero_nf, documento, nd, fd_nf)` — geralmente **não** é igual a `t_fin_disputas.nf`.
  - `doc_key`:
    - origem `nova_base` / `legado_orfao` → é `CR|...` (= `fd.nf`) ✔
    - origem `legado_casado` → é `v.doc_key` da view financeira, **≠** `fd.nf` ✘
- Backend faz `UPDATE t_fin_disputas SET deleted_at=NOW() WHERE nf = ?` com a chave recebida → `affectedRows = 0` para todas as linhas que não casam diretamente.
- O fallback `INSERT t_financeiro_soft_delete (documento=?, active=0)` também é inútil, porque a query `get_disputas_cr` filtra com `sd.documento = fd.nf` — e a chave gravada não é a `fd.nf` real.

Resultado: a linha continua aparecendo, mesmo a UI mostrando "Disputa excluída".

## Plano de correção (cirúrgico)

### 1. Front: enviar `doc_key` em vez de `nf`

`src/pages/FinanceiroDisputa.tsx`
- `handleDelete`: trocar `body: { action: "delete_disputa_cr", nf: targetNf }` por `body: { action: "delete_disputa_cr", doc_key: deleteDocKey }`. Remover o `rows.find(...).nf`.
- `handleBulkDelete`: já envia `doc_keys` — manter.

### 2. Backend: resolver `doc_key → fd.id` antes de marcar como deletado

`supabase/functions/mariadb-proxy/index.ts`, casos `delete_disputa_cr` (≈ linha 3737) e `bulk_delete_disputas_cr` (≈ linha 18426).

Para cada chave recebida, primeiro descobrir o(s) `fd.id` reais usando a mesma lógica do `get_disputas_cr`:

```sql
SELECT fd.id, fd.nf
FROM ai_agente.t_fin_disputas fd
LEFT JOIN dados_dachser.v_fin_regua_contas_receber v
  ON v.doc_key COLLATE utf8mb4_unicode_ci = fd.nf COLLATE utf8mb4_unicode_ci
 OR (
      fd.nf NOT LIKE 'CR|%' AND (
        SUBSTRING_INDEX(fd.nf,'|',1) COLLATE utf8mb4_unicode_ci = v.documento COLLATE utf8mb4_unicode_ci
     OR SUBSTRING_INDEX(fd.nf,'|',1) COLLATE utf8mb4_unicode_ci = v.numero_nf COLLATE utf8mb4_unicode_ci
     OR SUBSTRING_INDEX(fd.nf,'|',1) COLLATE utf8mb4_unicode_ci = v.nd        COLLATE utf8mb4_unicode_ci
      )
    )
WHERE fd.is_disputa = 1 AND fd.deleted_at IS NULL
  AND (
       fd.nf = ?                                  -- nova_base / órfão (doc_key = CR|...)
    OR v.doc_key COLLATE utf8mb4_unicode_ci = ?   -- legado_casado (doc_key = v.doc_key)
  )
```

Depois:

```sql
UPDATE ai_agente.t_fin_disputas
   SET deleted_at = NOW(), is_disputa = 0, updated_at = NOW()
 WHERE id IN (...ids...);

INSERT INTO ai_agente.t_financeiro_soft_delete (documento, active, active_at)
VALUES (?, 0, NOW())  -- usar fd.nf real de cada linha resolvida
ON DUPLICATE KEY UPDATE active = 0, active_at = NOW();
```

Aceitar tanto `doc_key` quanto `nf` no payload por compatibilidade (preferindo `doc_key`).

Manter `success = false` se nenhum `fd.id` for resolvido (em vez do falso-positivo atual).

### 3. Verificação

- Excluir 1 disputa nova_base → desaparece após refresh.
- Excluir 1 disputa legado_casado (sem prefixo `CR|`) → desaparece após refresh.
- Bulk delete misturando origens → todas somem.
- Conferir log do edge function: `affected > 0` e `softDeleteUpserted` correto.

Sem mudanças de schema, sem refactor estrutural — apenas o front (1 linha) e os 2 cases do proxy.