# Plano — Corrigir vínculos incorretos e órfãos em `t_voucher_anexos`

## Diagnóstico

Análise dos 48 registros revela **duas causas-raiz** no `mariadb-proxy`:

### Causa 1 — Vínculos incorretos (4 casos: 324, 370, 402, 434)

`find_voucher_by_spo` e `find_voucher_by_nd` usam fallbacks **`LIKE '%X%'`** e **prefixo progressivo** (`? LIKE CONCAT(numero_spo, '%')`) que casam vouchers vizinhos quando o número correto não existe ainda no banco:

- 402: ND `20261882950` → vinculou em `20261882948` (vizinho sequencial)
- 434: `20261882956` → `20261882940`
- 324: `20261566968` → `20261566925`
- 370: `20263777175` → `105-293381 DIM-BY` (LIKE `%X%` em `processo_id` casou um master)

### Causa 2 — Anexos órfãos (44 casos)

Várias rotas de delete em `t_vouchers` **não cascateiam** para `t_voucher_anexos`/`t_voucher_logs`:
- `delete_voucher_esteira` (7845), delete único (13491), cleanup auto-sync (16394), consolidação master (18565, 18624, 18651).

Apenas `voucher_create_unique_index_rm` (452-454) e `import_voucher_from_rm` (6388-6390) cascateiam corretamente. IDs repetidos na lista (`235b8f81…` 3×, `1e611522…` 2×) confirmam: voucher recriado/deletado, anexos antigos pendurados.

## Correções

### 1. Endurecer matchers — **preservando parametrizações existentes**

Princípio: **manter intactos** todos os formatos de filename já reconhecidos pelo `parse-comprovante-pdf` (regra `mem://vouchers/parser-filename-pattern-spo-date-suffix`) e a regra de prefixo SPO/ND (`mem://vouchers/spo-nd-prefix-identity-rule`). A mudança ocorre **só na camada de busca SQL**, não na extração:

Em `find_voucher_by_spo` e `find_voucher_by_nd`, manter:
1. **Match exato** (`= ?`) — comportamento atual
2. **Match com sufixo de espaço** via `SUBSTRING_INDEX` em ambos os lados (já documentado em `spo-nd-prefix-identity-rule`) — preserva `"105-293381 DIM-BY"`, `" SAN"`, etc.
3. **Match exato no `id_rm`** e no `processo_id` (sem `LIKE %`)

Remover:
- Bloco `LIKE '%X%'` em `numero_spo`, `id_rm` e `processo_id` (causa as colisões).
- "Progressive prefix" (`? LIKE CONCAT(numero_spo, '%')`) — só serve quando o extrator entrega lixo extra; com a regra atual de `SUBSTRING_INDEX(TRIM(x),' ',1)` aplicada na extração, isso já está coberto.

Resultado: nenhum filename hoje suportado deixa de casar; apenas matches "vizinhos" silenciosos somem.

### 2. Validação extra no `RoboTab.processOne`

Após o match, conferir que o `numero_spo` ou `id_rm` retornado é **idêntico** (após `SUBSTRING_INDEX trim`) ao candidato testado. Se não for, tratar como "não encontrado" e cair para o próximo candidato. Defesa em profundidade caso algum fallback futuro seja reintroduzido.

### 3. Cascade ao deletar voucher

Helper interna no `mariadb-proxy`:
```sql
DELETE FROM t_voucher_anexos WHERE voucher_id = ?;
DELETE FROM t_voucher_logs   WHERE voucher_id = ?;
DELETE FROM t_vouchers       WHERE id = ?;
```
Aplicar nos 6 pontos: 7845, 13491, 16394, 18565, 18624, 18651. Padronizar 452-454 e 6388-6390 com a mesma helper.

### 4. Limpeza única dos órfãos atuais

Script administrativo único (via `mariadb-proxy` sob ação restrita ou execução pontual aprovada) deletando os 44 anexos cujo `voucher_id` não existe mais em `t_vouchers`. Arquivos no bucket `voucher-anexos` não são tocados.

### 5. Re-vincular os 4 anexos errados

Resolver IDs corretos:

| linha | voucher errado (atual) | nome correto → buscar voucher por |
|---|---|---|
| 324 | `fbf934c9-1f90-45a6-9593-bdf84ca2ec2c` (em `20261566925`) | `20261566968` |
| 370 | `cf189dd4-b9c4-480a-aed3-65982a6d5f0a` (em `105-293381 DIM-BY`) | `20263777175` |
| 402 | `bbe1cee7-f63f-4d7f-912f-7806ad2964c3` (em `20261882948`) | `20261882950` |
| 434 | `ef2fff80-7eb0-4d2e-b3f9-1d89dda4dc8c` (em `20261882940`) | `20261882956` |

`UPDATE t_voucher_anexos SET voucher_id = ? WHERE id = ?` para cada um, executado após resolver o `id` correto via `SELECT id FROM t_vouchers WHERE numero_spo = ? OR id_rm = ?`.

## Detalhes técnicos

- Arquivos tocados:
  - `supabase/functions/mariadb-proxy/index.ts` — handlers de busca (passos 1-2 mantidos, fallbacks LIKE/progressivo removidos) + helper de cascade nos deletes.
  - `src/components/tabs/RoboTab.tsx` — validação de identidade após match.
  - **Não tocar** `parse-comprovante-pdf/index.ts` — todas as regras de filename existentes permanecem.
- Sem migration de schema.
- Memória a atualizar: novo `mem://vouchers/anexos-cascade-and-strict-matching.md` (cascade obrigatório + remoção de LIKE %% no matcher, mantendo regras de prefixo SPO/ND).

## Ordem de execução

1. Endurecer handlers SQL (mantendo prefixo `SUBSTRING_INDEX` e sufixo espaço).
2. Validação exata no `RoboTab`.
3. Helper de cascade nos 6 pontos de delete.
4. Limpeza dos 44 órfãos + re-vínculo dos 4 anexos errados.
5. Atualizar memória.
