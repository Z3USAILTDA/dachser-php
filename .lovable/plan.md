## Objetivo
Na importação em lote, quando o lookup em `t_dados_financeiro_spo` retorna mais de uma linha que compartilha o **mesmo SPO (nd) + processo + valor + vencimento**, considerar apenas a ocorrência com `data_insert` mais recente, evitando que duplicidades reais da tabela de origem inflem a contagem de candidatas ambíguas na pré-visualização.

## Mudança (apenas backend)
Arquivo: `supabase/functions/mariadb-proxy/index.ts` — função `fetchDfvByProcVenc` (~linha 21830) e `buildPreviewItems` (~21945). Sem alterações em frontend.

### 1. Incluir `data_insert` no SELECT
Adicionar `data_insert` à lista de colunas retornadas pelo SELECT em `t_dados_financeiro_spo` (linha 21855), para permitir ordenar as candidatas.

### 2. Deduplicar por SPO dentro de cada chave processo|valor|vencimento
Logo após popular `byKey` (linha 21868), para cada chave aplicar:
- Agrupar as linhas por `TRIM(nd)` (SPO).
- Para cada grupo de mesmo SPO, manter somente a linha com o maior `data_insert` (timestamps nulos perdem para qualquer não-nulo; empate vence a primeira encontrada).
- O array final por chave passa a ter no máximo uma linha por SPO distinto.

### 3. Comportamento resultante em `buildPreviewItems`
Nenhuma alteração de lógica — apenas se beneficia do array já deduplicado:
- 1 SPO distinto restante → linha resolvida normalmente (não ambígua, mesmo que originalmente houvesse 2+ inserts para o mesmo SPO).
- 2+ SPOs distintos → comportamento atual de ambiguidade preservado (`is_ambiguous`, `ambiguous_total`, mensagem "SPO ambígua: N candidatas…").

## Fora de escopo
- Frontend (`BatchImportVoucherDialog`, `BatchImportPreviewTable`): nenhuma alteração; `markDuplicates` continua reagindo a `ambiguous_group_key` e `ambiguous_total` enviados pelo backend.
- Outras rotas de lookup (unitário, RM, vouchers existentes).
- Regra `dedupe-by-spo-fornecedor-valor` (cron de duplicados em `t_vouchers`) — independente; permanece como está.

## Memória
Atualizar `mem://vouchers/batch-import-lookup-by-processo-valor-vencimento` adicionando: "Quando múltiplas linhas em `t_dados_financeiro_spo` compartilham o mesmo `nd` para a mesma chave processo+valor+vencimento, o backend mantém apenas a de `data_insert` mais recente antes de decidir ambiguidade."