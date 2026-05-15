## Objetivo

Eliminar as duplicatas reais em `t_vouchers` (mesmo SPO + mesmo fornecedor + mesmo valor, criadas em segundos próximos) e impedir que voltem.

## Escopo da limpeza

5 SPOs com cópias idênticas, todos sem `id_rm`. Para cada grupo, **mantém o voucher cujo `updated_at` é o mais recente** (= histórico mais movimentado) e marca os demais como `sync_status = 'DUPLICADO'` (soft-delete — somem da tela de processos via filtro `sync_status='ATIVO'`, mas ficam auditáveis no banco).

| SPO | Cópias | Ação |
|---|---|---|
| `105-292899 DIM-BY` | 3 → 1 | mantém max(updated_at) |
| `20261882923` | 3 → 1 | mantém max(updated_at) |
| `20261882924` | 2 → 1 | mantém max(updated_at) |
| `20261882925` | 2 → 1 | mantém max(updated_at) |
| `20261882926` | 2 → 1 | mantém max(updated_at) |

Critério de desempate: maior `updated_at`; se empatar, maior `id` (mais recente lexicograficamente).

Os outros 7 SPOs "ambíguos" (valores diferentes — vouchers legítimos distintos) **não são tocados** por essa limpeza.

## Mudanças

### 1. Backfill único (one-shot)

Novo case em `mariadb-proxy/index.ts` → `dedupe_vouchers_by_spo_fornecedor_valor`:

```sql
-- Identifica grupos de duplicatas reais (mesmo SPO normalizado + fornecedor + valor)
-- e marca todos exceto o de updated_at mais recente como DUPLICADO.
UPDATE dados_dachser.t_vouchers v
JOIN (
  SELECT
    v2.id,
    ROW_NUMBER() OVER (
      PARTITION BY SUBSTRING_INDEX(TRIM(v2.numero_spo),' ',1),
                   TRIM(v2.fornecedor),
                   COALESCE(v2.valor, 0)
      ORDER BY v2.updated_at DESC, v2.id DESC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY SUBSTRING_INDEX(TRIM(v2.numero_spo),' ',1),
                   TRIM(v2.fornecedor),
                   COALESCE(v2.valor, 0)
    ) AS grp_size
  FROM dados_dachser.t_vouchers v2
  WHERE v2.sync_status = 'ATIVO'
    AND (v2.id_rm IS NULL OR v2.id_rm = '')
    AND v2.numero_spo IS NOT NULL
    AND v2.fornecedor IS NOT NULL
    AND v2.valor IS NOT NULL
) ranked ON ranked.id = v.id
SET v.sync_status = 'DUPLICADO',
    v.updated_at  = NOW()
WHERE ranked.rn > 1 AND ranked.grp_size > 1;
```

Retorno: `{ marked_duplicated: N, groups_resolved: M, sample: [...] }`.

Depois rodo `mirror_vouchers_from_dfv` em sequência para garantir que os sobreviventes recebam `id_rm` quando aplicável.

### 2. Prevenção (importador / cadastro manual)

No mesmo edge function, antes de cada `INSERT INTO t_vouchers` que vem do importador (linhas ~6496, 12809, 13270, 13365, 16034, 19688), adiciono guard:

```sql
-- só insere se não existir um ATIVO com mesma chave lógica
INSERT INTO t_vouchers (...)
SELECT ... FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM dados_dachser.t_vouchers
  WHERE sync_status = 'ATIVO'
    AND SUBSTRING_INDEX(TRIM(numero_spo),' ',1) = SUBSTRING_INDEX(TRIM(?),' ',1)
    AND TRIM(fornecedor) = TRIM(?)
    AND COALESCE(valor,0) = COALESCE(?,0)
);
```

Sem mudança de schema (sem `UNIQUE INDEX`) para não bloquear casos legítimos do tipo "mesmo SPO mas valor `NULL` durante rascunho". A chave lógica é apenas barreira no path de escrita.

### 3. Validação

1. Rodar `dedupe_vouchers_by_spo_fornecedor_valor` → esperado 7 linhas marcadas `DUPLICADO`.
2. `SELECT numero_spo, COUNT(*) FROM t_vouchers WHERE sync_status='ATIVO' GROUP BY 1 HAVING COUNT(*) > 1` para os 5 SPOs → cada um devolve 1.
3. Conferir tela de processos (`/fin/esteira`) → cada SPO aparece uma única vez.
4. Repassar `mirror_vouchers_from_dfv` → log com `ambiguous_pending` cai dos 17 atuais.

## Detalhes técnicos

- Sem migração de schema; somente DML em MariaDB e código no edge function.
- `sync_status = 'DUPLICADO'` já é filtrado no `get_vouchers_combined` (que só carrega ATIVO), então a tela limpa automaticamente.
- Anexos/logs dos vouchers marcados ficam intactos — soft-delete reversível trocando `sync_status` de volta para `ATIVO`.
- Nada toca `auth.users`, RLS, Supabase, ou os 7 SPOs com valores legítimos distintos.
- Atualizar memória: nova entrada **vouchers/dedupe-by-spo-fornecedor-valor** documentando o critério (max updated_at) e o guard de inserção.

## Fora de escopo (decidir depois)

- Os 7 SPOs com `id_rm` ambíguo no DFV (20261882977 com 5 candidatos, 20261882979 com 6, etc.) continuam sem `id_rm`, aparecendo em `ambiguous_pending`. Não impactam a tela de processos (não geram duplicatas) — só o enrich automático fica suspenso até definirmos uma regra (tela de QA, match por valor, ou aceitar manual).
