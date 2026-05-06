## Alteração na lógica de numeração do voucher master

Hoje o `numero_spo` do voucher master é definido pelo filho com **menor `id_rm`** (resolvido a partir de `t_vouchers.id_rm` ou, em fallback, `t_dados_financeiro_voucher.id_rm`).

Vamos passar a usar **`idmov`** (coluna em `t_dados_financeiro_voucher`) como fonte primária de comparação, mantendo `id_rm` como fallback quando `idmov` for `NULL`.

### Regra nova

Para cada filho candidato, calcular uma chave de ordenação:
- `sort_key = COALESCE(dfv.idmov, COALESCE(v.id_rm, dfv.id_rm))`

O master adota o `numero_spo` do filho com **menor `sort_key`** (não nulo). Se nenhum filho tiver `sort_key`, mantém o fallback atual (primeiro filho / random `MASTER-XXXX`).

Importante: a comparação entre `idmov` e `id_rm` no mesmo conjunto é aceitável pois ambos são inteiros monotônicos do RM — quando `idmov` existe ele é usado, caso contrário cai para `id_rm`. Não há mistura na mesma linha.

### Arquivos afetados

**`supabase/functions/mariadb-proxy/index.ts`** — duas seções:

1. **`case 'create_voucher_master'` (~linha 12343)**
   - Alterar a query `resolvedChildren` para fazer também LEFT JOIN com `t_dados_financeiro_voucher` trazendo `dfv.idmov`, e expor `resolved_sort_key = COALESCE(dfv.idmov, COALESCE(v.id_rm, dfv.id_rm))`.
   - Trocar a redução `childrenWithIdRm` / `lowestChild` para usar `resolved_sort_key` em vez de `resolved_id_rm`.
   - Ajustar logs para indicar a fonte (`idmov` vs `id_rm`).

2. **`case 'fix_master_numero_spo'` (~linha 12739)**
   - Mesma alteração: incluir `dfv.idmov` na subquery dos filhos e usar `COALESCE(dfv.idmov, COALESCE(v.id_rm, dfv.id_rm))` como chave de ordenação.
   - Atualizar `details` para registrar `lowestSortKey` e `source` (`idmov` ou `id_rm`).

Nada mais é alterado: frontend, demais cases, RM integration e demais tabelas permanecem intactos.

### Memória

Atualizar `mem://vouchers/master-numbering-logic-v1` para refletir a nova prioridade `idmov > id_rm`.

### Observação / pergunta

Confirme que a coluna `idmov` está em `t_dados_financeiro_voucher` (não vi referência prévia no código). Se estiver em outra tabela, me avise para ajustar o JOIN.