## Diagnóstico

No `mariadb-proxy`, a função `fetchSpoByProcesso` (action `preview_voucher_batch_import`) indexa as linhas de `t_dados_financeiro_spo` por `numero_processo` mas mantém **apenas a primeira** ocorrência:

```ts
if (main && !byProcesso[main]) byProcesso[main] = r;
```

Resultado: quando um processo tem 2+ linhas em `t_dados_financeiro_spo` com **ND (SPO) diferentes e `valor_nf` diferentes**, só uma é considerada — escolhida pela ordem natural do banco, sem checar a coluna `Valor` da planilha. As demais somem do preview.

## Mudança proposta (cirúrgica, só no backend)

Arquivo: `supabase/functions/mariadb-proxy/index.ts` (ações `preview_voucher_batch_import` e `create_voucher_batch_import`).

### 1. `fetchSpoByProcesso` — armazenar **todas** as linhas por processo
Trocar o índice para `Record<string, any[]>`. Continuar indexando também por tokens de `detalhes`. Sem mudança no SQL.

```ts
const byProcesso: Record<string, any[]> = {};
// ...
const main = normProcesso(r.numero_processo);
if (main) (byProcesso[main] ||= []).push(r);
// idem para tokens de detalhes
```

O fallback em `t_dados_financeiro_voucher` continua igual (vouchers raramente são duplicados por processo, mas mantém a mesma estrutura de array para uniformidade).

### 2. `buildPreviewItems` — match por valor e expansão de linhas
Substituir o `mergeWithDfv` único pela seguinte lógica por linha da planilha:

1. Buscar `candidates = byProcesso[np] || []`.
2. **Se 0 candidatos** → comportamento atual (`mergeWithDfv(s, null)` → ERROR "processo não encontrado").
3. **Se 1 candidato** → comportamento atual (`mergeWithDfv(s, candidates[0])`).
4. **Se 2+ candidatos**:
   - `sheetValor = Number(s.valor)` (já parseado pelo `parseSheetRow`).
   - `matches = candidates.filter(c => Math.abs(Number(c.valor_nf) - sheetValor) < 0.01)` (tolerância 1 centavo).
   - **1 match** → usa esse SPO único (`mergeWithDfv(s, matches[0])`).
   - **≥2 matches** → **expande a linha da planilha em N items**, um por SPO casado. Cada item recebe `row_index` único (sufixo `.1`, `.2` ou novo índice incremental), preserva o `raw_json` original, e marca `field_origin.spo='DFV'` + flag `expanded_from_processo: true`. Todos passam pelo `mergeWithDfv` e pelas validações.
   - **0 matches** (valor da planilha não bate com nenhum SPO) → cair em ERROR com mensagem clara: `"Processo tem N SPOs (ND: X, Y) com valores diferentes; valor da planilha não bate com nenhum. Edite a linha para selecionar o SPO correto."` (status='ERROR', já existente no fluxo).
   - Se `sheetValor` estiver vazio/0 → tratar como "0 matches" para forçar o usuário a preencher o valor antes do match.

### 3. Garantir compatibilidade no `markDuplicates` (frontend) e `create_voucher_batch_import` (backend)
- `row_index` precisa ser único após a expansão. Estratégia: ao expandir, atribuir `row_index` sequencial novo (continuando do total atual), preservando `source_row_index` no item para mensagens ao usuário ("linha #3 da planilha → SPO 001-123456 e 001-789012").
- O `markDuplicates` do front já usa `id_rm + spo` como chave — como SPOs são distintos, não vão colidir. ✅
- No `create_voucher_batch_import`, nada muda: cada item já vira um voucher independente.

### 4. UI (`BatchImportPreviewTable` / `BatchImportRowEditor`)
- Quando `expanded_from_processo === true`, mostrar um badge sutil "Expandido do processo X" para o usuário entender por que apareceram 2 linhas com o mesmo processo. Sem outras mudanças de layout/lógica.

## Fora de escopo
- Não alterar regras de cálculo, validação de fornecedor, deduplicação por `id_rm+spo`, anexação de documentos, ou fluxo de pré-lançamento.
- Não mudar o SQL de `fetchSpoByProcesso` — só a indexação em JS.
- Não tocar em `voucher-integrate-rm` nem na criação de vouchers individuais.

## Critérios de aceite
1. Processo com 1 SPO em `t_dados_financeiro_spo` → comportamento inalterado.
2. Processo com 2+ SPOs e valores **diferentes**, planilha com 1 valor que casa com um deles → preview mostra **1 linha** com o SPO correto.
3. Processo com 2+ SPOs e valores **iguais** que casam com a planilha → preview mostra **N linhas**, uma por SPO; ao confirmar, cria N vouchers.
4. Processo com 2+ SPOs e nenhum valor casa → linha fica em ERROR com mensagem listando os SPOs e valores disponíveis.
5. `markDuplicates` continua marcando colisões reais de `id_rm+spo` (sem falsos positivos para a expansão).
