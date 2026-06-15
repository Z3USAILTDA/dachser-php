## Objetivo

Mudar o matching da importação em lote de SPO: parar de buscar por `nd` (SPO) e passar a buscar em `t_dados_financeiro_spo` por **`numero_processo` + `valor_nf` + `data_vencimento`**. O resultado preenche automaticamente SPO e Fornecedor. Quando o lookup retornar mais de uma SPO para a mesma chave, expandir em N linhas no preview, todas marcadas como erro, forçando o usuário a remover N-1 linhas para prosseguir.

## Mudanças

### 1. Planilha de entrada (`BatchImportVoucherDialog.tsx`)
- Remover `"SPO"` da lista `EXPECTED_HEADERS`.
- Mensagens de validação/duplicidade deixam de citar "SPO+RM"; passam a citar "Processo+Valor+Vencimento".
- A função `markDuplicates` continua existindo, mas a chave passa a ser `processo|valor|vencimento` para detectar linhas duplicadas digitadas na própria planilha (caso o usuário coloque duas linhas idênticas).
- `validate` deixa de exigir `spo` no front (o SPO virá da resolução do backend); mantém os demais campos obrigatórios.

### 2. Backend — `mariadb-proxy/index.ts`, action `preview_voucher_batch_import`

#### 2.1 `parseSheetRow`
- Não tentar mais ler a coluna `SPO/ND/Voucher`. Manter campo `spo: null` por compatibilidade até a resolução.

#### 2.2 Nova função `fetchDfvByProcessoValorVenc`
Substitui `fetchDfvBySpo`. Recebe a lista de tuplas `(processo, valor, vencimento)` distintas e roda uma única query:

```sql
SELECT id_rm, nd, nome_beneficiario, nome_cobranca, numero_processo,
       modal, tipo_pag, forma_pag, data_emissao, data_vencimento,
       valor_nf, moeda, cnpj, razao_social, detalhes
  FROM dados_dachser.t_dados_financeiro_spo
 WHERE (UPPER(REPLACE(TRIM(numero_processo),' ','')) COLLATE utf8mb4_unicode_ci,
        ROUND(valor_nf, 2),
        DATE(data_vencimento)) IN ((?,?,?), ...)
```

Retorna `Map<chave, DfvRow[]>` (array — pode ter múltiplos SPOs para a mesma chave).

Normalização da chave: `processo` sem espaços e em uppercase; `valor` arredondado a 2 casas; `vencimento` no formato `YYYY-MM-DD`.

#### 2.3 Nova fase de expansão antes do `mergeWithDfv`
Em `buildPreviewItems`:
- Após `parseSheetRow`, agrupar as linhas e fazer 1 lookup.
- Para cada linha da planilha:
  - **0 matches** → emite 1 linha resolvida com `spo=null`, `fornecedor=null`, `status='ERROR'`, `validation_message='Nenhuma SPO encontrada em t_dados_financeiro_spo para este processo+valor+vencimento'`. Não bloqueia a edição manual.
  - **1 match** → emite 1 linha resolvida normalmente (preenchendo `spo`, `id_rm`, `fornecedor`, `cnpj`, etc. via `mergeWithDfv` existente).
  - **N > 1 matches** → emite **N linhas** (uma por SPO candidata), todas com:
    - `status='ERROR'`
    - `is_ambiguous=true`
    - `ambiguous_group_key=<processo|valor|vencimento>`
    - `ambiguous_total=N`
    - `validation_message='SPO ambígua: N candidatas para o mesmo processo+valor+vencimento. Exclua N-1 linhas para prosseguir.'`
    - `row_index` sequencial, preservando ordem original.

#### 2.4 `mergeWithDfv`
- Remover obrigatoriedade de `merged.spo` no validador (continua exigindo processo/valor/vencimento). Quando o lookup falhar, mantém erro "Nenhuma SPO encontrada".
- O `field_origin` de `spo` e `fornecedor` passa a ser sempre `'DFV'` quando vier do lookup.

#### 2.5 `markDuplicates` (atual marca SPO+RM duplicado na planilha)
Manter, mas trocar a chave para `processo|valor|vencimento` (detecta linhas idênticas digitadas pelo usuário). Não conflita com `is_ambiguous` — uma vem do lookup, outra da planilha.

### 3. Preview (`BatchImportPreviewTable`)
- Adicionar coluna/badge "Ambígua (k/N)" quando `is_ambiguous=true`.
- Mensagem de erro consolidada em `errorReasons` agrupa por `"SPO ambígua — processo X"`.
- O botão "Criar lote" já bloqueia quando há erros; manter. Acrescentar bloqueio explícito: enquanto houver grupos com `is_ambiguous` e mais de 1 linha do mesmo `ambiguous_group_key`, não permite confirmar.

### 4. `confirm()` no diálogo
- Antes de invocar `create_voucher_batch_import`, verificar grupos ambíguos não resolvidos (`ambiguous_group_key` com >1 ocorrência ainda presente em `items`). Se houver, exibir toast e abortar.

### 5. Memória do projeto
Salvar nova memory `mem://vouchers/batch-import-lookup-by-processo-valor-vencimento` documentando a chave de match e o comportamento de ambiguidade.

## Detalhes técnicos

- A coluna `numero_processo` em `t_dados_financeiro_spo` pode ter espaços/máscaras; normalizar via `REPLACE(TRIM(...),' ','')`.
- Comparação de `valor_nf` usando `ROUND(?, 2)` em ambos os lados para evitar problemas de ponto flutuante.
- `data_vencimento`: comparar como `DATE(...)` truncando hora.
- Performance: 1 query única por preview (batch IN), independente do número de linhas.
- Compatibilidade: o fallback antigo para `t_dados_financeiro_voucher` por SPO/nd é **removido** — o usuário pediu para usar SPO da `t_dados_financeiro_spo` como fonte da verdade.

## Arquivos a editar
- `supabase/functions/mariadb-proxy/index.ts` (parseSheetRow, fetchDfvByProcessoValorVenc novo, buildPreviewItems, mergeWithDfv)
- `src/components/esteira/BatchImportVoucherDialog.tsx` (EXPECTED_HEADERS, validate, markDuplicates, confirm, errorReasons)
- `src/components/esteira/BatchImportPreviewTable.tsx` (badge ambígua)
- Memória nova em `.lovable/memory/vouchers/`