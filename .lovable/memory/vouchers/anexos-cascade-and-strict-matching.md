---
name: Anexos Cascade & Strict Matching
description: Toda exclusão de voucher precisa cascatear t_voucher_anexos/t_voucher_logs; matchers find_voucher_by_spo/by_nd usam apenas match exato + prefixo SUBSTRING_INDEX (sem LIKE %X% nem prefixo progressivo)
type: feature
---

## Cascade obrigatório ao deletar voucher

Toda rota que executa `DELETE FROM dados_dachser.t_vouchers` deve, **antes**, executar:
```sql
DELETE FROM t_voucher_anexos WHERE voucher_id IN (...);
DELETE FROM t_voucher_logs   WHERE voucher_id IN (...);
```
Pontos cobertos no `mariadb-proxy/index.ts`: `delete_voucher_esteira`, `disassemble_master`, `cleanup_auto_sync_vouchers`, cleanup de vouchers inválidos (numero_spo nulo/MANUAL-%), cleanup PRE_LANCAMENTO em `cleanup_abandoned_batch_imports`, e os caminhos já existentes (`voucher_create_unique_index_rm`, `import_voucher_from_rm`, batch AGUARDANDO_DOCUMENTOS_LOTE, orphans CONSOLIDADO_NO_MASTER).

**Por que:** sem cascade, anexos viram órfãos em `t_voucher_anexos` (44 casos detectados em maio/2026), aparecendo na aba Comprovantes sem voucher correspondente.

## Matching estrito em find_voucher_by_spo / find_voucher_by_nd

Apenas estes níveis são permitidos, em ordem:
1. Match exato (`numero_spo = ?` / `id_rm = ?`)
2. Match exato em `processo_id`
3. Match com sufixo de espaço via `SUBSTRING_INDEX(TRIM(x),' ',1)` em ambos os lados (cobre `"105-292915 DIM-BY"`, `" SAN"`)
4. Child-to-master pela mesma regra de prefixo

**Proibido:** `LIKE '%X%'` e "progressive prefix" (`? LIKE CONCAT(numero_spo, '%')`). Esses fallbacks vinculavam SPOs vizinhos sequenciais ao errado (ex.: `20261882950` vinculado em `20261882948`). Casos confirmados: anexos `fbf934c9…`, `cf189dd4…`, `bbe1cee7…`, `ef2fff80…`.

## Defesa em profundidade no front (RoboTab)

`pickVoucher(vouchers, queried)` filtra resultados aplicando `isIdentityMatch` — exige que `normalizeKey(numero_spo|id_rm|processo_id|child_spo)` seja idêntico ao valor consultado. Se o SQL um dia voltar a entregar match colateral, o front bloqueia.

## Não tocar parâmetros do parser

Regras de filename já existentes (`mem://vouchers/parser-filename-pattern-spo-date-suffix`, `mem://vouchers/spo-nd-prefix-identity-rule`, `mem://vouchers/comprovante-robot-matching-rules`) **permanecem inalteradas** — a mudança ocorreu só na camada SQL e na validação do front.

## Ação one-shot de limpeza

`cleanup_orphan_anexos_and_relink` no `mariadb-proxy`:
- Re-vincula os 4 anexos identificados ao voucher correto (busca por `SUBSTRING_INDEX prefix` ou `id_rm`).
- Apaga todos os `t_voucher_anexos` cujo `voucher_id` não exista em `t_vouchers`.
Pode ser disparada novamente com segurança (idempotente).
