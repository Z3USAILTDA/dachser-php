

# Correcao: Deteccao inteligente de header + leitura completa de todas as linhas e colunas

## Problema

O `xlsxExtractor.ts` tem dois problemas:

1. **Deteccao de header errada**: A logica atual pega a primeira linha com 3+ celulas nao vazias (linhas 277-285). Manifests com metadados no topo (ex: "Container ID:", "Vessel Name:") fazem essa linha ser selecionada como header, causando falha total na extracao.

2. **Linhas ignoradas**: Linhas sem supplier/description ou sem dados numericos sao descartadas (`continue` na linha 324). Isso perde dados potencialmente importantes.

## Solucao

### 1. Header scoring inteligente

Criar funcao `scoreHeaderRow` que pontua cada linha candidata contando quantas celulas correspondem a aliases conhecidos em `COLUMN_ALIASES`. Varrer as primeiras 20 linhas e selecionar a de maior score (minimo 2). Se nenhuma atingir score 2, usar fallback atual.

### 2. Leitura de todas as linhas sem pular

Remover a condicao que descarta linhas sem supplier e sem dados numericos. Ao inves disso, usar "UNKNOWN EXPORTER" como fallback para qualquer linha que tenha pelo menos 1 celula nao vazia, garantindo que nenhum dado seja perdido.

### 3. Captura de colunas nao mapeadas

Adicionar ao `ExporterItem` um campo `extra_columns` (dicionario header->valor) para colunas que nao foram mapeadas a nenhum alias conhecido. Assim todas as informacoes da planilha sao preservadas no JSON extraido.

## Detalhes Tecnicos

### Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`

**Mudanca 1 -- Nova funcao `scoreHeaderRow` (antes de `extractXlsxStructured`):**

```text
function scoreHeaderRow(row: any[]): number
  - Para cada celula da linha, normalizar com normalizeHeader()
  - Verificar se o valor normalizado faz match (exato ou parcial)
    com algum alias de COLUMN_ALIASES
  - Retornar total de matches
```

**Mudanca 2 -- Substituir deteccao de header (linhas 277-285):**

```text
Antes:
  for i in 0..min(rows.length, 10):
    if nonEmpty >= 3: headerRowIdx = i; break

Depois:
  bestIdx = 0, bestScore = 0
  for i in 0..min(rows.length, 20):
    if nonEmpty >= 3:
      score = scoreHeaderRow(row[i])
      if score > bestScore: bestScore = score, bestIdx = i
  if bestScore < 2:
    fallback para primeira linha com 3+ celulas (logica antiga)
  log("Header row: idx={bestIdx}, score={bestScore}")
```

**Mudanca 3 -- Nao descartar linhas (linhas 316-325):**

```text
Antes:
  if (!supplierName):
    if (hasAnyNumericData): supplierName = 'UNKNOWN EXPORTER'
    else: continue  // <-- perde dados

Depois:
  if (!supplierName):
    // Verificar se a linha tem QUALQUER celula nao vazia
    hasAnyCellData = row.some(cell => String(cell||'').trim() !== '')
    if (hasAnyCellData): supplierName = 'UNKNOWN EXPORTER'
    else: continue  // so pula linhas 100% vazias
```

**Mudanca 4 -- Capturar colunas extras no ExporterItem:**

Adicionar campo `extra_columns: Record<string, string>` ao `ExporterItem`. Na iteracao de cada linha, para colunas cujo indice nao esta mapeado em `colMap`, capturar header e valor no dicionario.

```text
interface ExporterItem {
  ...campos existentes...
  extra_columns: Record<string, string>;  // novo
}

// Na iteracao:
const extraCols: Record<string, string> = {};
for (let c = 0; c < headers.length; c++) {
  if (!mappedIndices.has(c) && headers[c].trim()) {
    const val = parseString(row[c]);
    if (val) extraCols[headers[c].trim()] = val;
  }
}
```

### Resumo de mudancas

```text
Arquivo                                           Mudanca
------------------------------------------------  -------------------------------------------
supabase/functions/sea-submit-analysis/           1. Nova funcao scoreHeaderRow()
  xlsxExtractor.ts                                2. Header detection com score (top 20 rows)
                                                  3. Nao pular linhas com dados
                                                  4. extra_columns no ExporterItem
```

Deploy automatico do edge function `sea-submit-analysis` apos as alteracoes.
