

## Deduplicação de HAWBs por `id_olss` no Rastreio Aéreo

### Problema
Quando existe um novo MAWB para o mesmo HAWB (mesmo processo), ambos aparecem na tela de rastreio aéreo. A coluna `id_olss` identifica univocamente o processo, então devemos usá-la para manter apenas o registro mais recente (`data_insert`).

### Solução

Modificar a edge function `supabase/functions/fetch-status-aereo/index.ts` em dois pontos:

1. **Query do t_master_dados (Passo 2, ~linha 511)**: Incluir `id_olss` e `data_insert` no SELECT.

2. **Lógica de deduplicação (Passo 2, ~linha 527-540)**: Após buscar os registros do `t_master_dados`, agrupar por `id_olss` (quando disponível) e manter apenas o registro com `data_insert` mais recente. Quando `id_olss` for nulo, manter o comportamento atual (deduplicar por `mawb|hawb`).

### Detalhes Técnicos

**Arquivo**: `supabase/functions/fetch-status-aereo/index.ts`

**Alteração 1 - Query** (~linha 511-518):
- Adicionar `id_olss` e `data_insert` ao SELECT
- Remover o `DISTINCT` (a deduplicação será feita em JS)

**Alteração 2 - Deduplicação JS** (~linha 527-540):
- Para registros com `id_olss`: agrupar por `id_olss`, manter apenas o de maior `data_insert`
- Para registros sem `id_olss`: manter lógica atual (`mawb|hawb`)
- Isso garante que um mesmo processo (mesmo `id_olss`) com MAWBs diferentes mostrará apenas o mais recente

