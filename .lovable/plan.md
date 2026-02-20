
# Correcao: Peso/CBM/Volumes inflados por linhas nao-dados

## Problema

A mudanca anterior ("manter TODAS as linhas com qualquer celula nao-vazia") faz o extrator incluir linhas de metadados, notas, separadores e subtotais parciais nos calculos. Isso infla dramaticamente os totais:

- Peso: 24.600.872 kg (deveria ser ~12.414 kg)
- CBM: 5.152.186 m3 (deveria ser ~52 m3)
- Packages: 190 (deveria ser 95 -- provavel double-counting de 2 sheets)

## Causa Raiz

1. Linhas pos-header que nao sao dados reais (ex: "Loading Date: 46358" onde 46358 e um serial de data Excel) tem valores numericos em colunas de peso/CBM que sao somados
2. Linhas de subtotal parcial (que nao contem as palavras exatas de `isSkipRow`) sao somadas ao total
3. Possivelmente 2 sheets com os mesmos dados sendo processados (explica packages 2x)

## Solucao

### 1. Filtro inteligente de linhas de dados (substituir logica "keep ALL rows")

Uma linha so deve ser considerada "dado real" se atender pelo menos UMA destas condicoes:
- Tem um nome de supplier/exporter reconhecido (coluna supplier preenchida)
- Tem um valor numerico > 0 em PELO MENOS 2 colunas numericas mapeadas (peso, cbm, packages)
- Tem um NCM code valido na coluna NCM

Linhas que so tem uma celula nao-vazia qualquer (como notas, separadores, datas) devem ser descartadas.

### 2. Melhorar `isSkipRow` com mais padroes

Adicionar padroes de skip para linhas comuns em manifests que nao sao dados:
- 'loading date', 'vessel', 'voyage', 'port of', 'container id', 'seal no'
- Linhas onde a primeira celula termina com ":" (indicador de label de metadado)

### 3. Deduplicacao de sheets

Se 2+ sheets tem os mesmos headers, processar apenas o que tiver mais linhas de dados (evita double-counting).

### 4. Log detalhado para debug

Adicionar log das primeiras 5 linhas de dados processadas (com valores) para facilitar identificacao de problemas futuros.

## Detalhes Tecnicos

### Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`

**Mudanca 1 -- Substituir logica de retencao de linhas (linhas 346-354):**

```text
Antes:
  if (!supplierName):
    hasAnyCellData = row.some(...)
    if (hasAnyCellData): supplierName = 'UNKNOWN EXPORTER'
    else: continue

Depois:
  if (!supplierName):
    // Verificar se a linha tem dados NUMERICOS em colunas mapeadas
    const hasWeight = colMap.gross_weight >= 0 && parseNumber(row[colMap.gross_weight]) > 0;
    const hasCbm = colMap.cbm >= 0 && parseNumber(row[colMap.cbm]) > 0;
    const hasPkgs = colMap.packages_qty >= 0 && parseNumber(row[colMap.packages_qty]) > 0;
    const hasNcm = colMap.ncm >= 0 && extractNcmCodes(row[colMap.ncm]).length > 0;
    const hasDesc = colMap.description >= 0 && parseString(row[colMap.description]).length > 3;
    
    const numericCols = [hasWeight, hasCbm, hasPkgs].filter(Boolean).length;
    
    if (numericCols >= 2 || hasNcm || (numericCols >= 1 && hasDesc)):
      supplierName = 'UNKNOWN EXPORTER'
    else:
      continue  // Nao e uma linha de dados real
```

**Mudanca 2 -- Melhorar `isSkipRow` (linha 210-213):**

Adicionar padroes de metadados e subtotais comuns em manifests:

```text
const skipPatterns = [
  'grand summary', 'grand total', 'total:', 'subtotal', 'sum:',
  'total gross', 'total net', 'total cbm',
  'loading date', 'vessel name', 'voyage no', 'port of loading',
  'port of discharge', 'container id', 'seal number',
  'bill of lading', 'booking no', 'shipping mark',
];

// Tambem pular linhas onde a primeira celula termina com ":"
// (indicador de label de metadado como "Container ID:", "Vessel:")
const firstCell = String(row[0] || '').trim();
if (firstCell.endsWith(':') && row.filter(c => String(c||'').trim()).length <= 3) {
  return true;
}
```

**Mudanca 3 -- Deduplicacao de sheets (antes do loop principal):**

```text
// Agrupar sheets por headers identicos
// Se multiplos sheets tem mesmos headers, manter apenas o maior
const sheetsByHeaders = new Map<string, { name: string; rowCount: number }>();
for (const sheetName of sheetsToProcess) {
  const rows = XLSX.utils.sheet_to_json(sheet, ...);
  const headerKey = rows[headerRowIdx].map(normalizeHeader).join('|');
  
  const existing = sheetsByHeaders.get(headerKey);
  if (!existing || rows.length > existing.rowCount) {
    sheetsByHeaders.set(headerKey, { name: sheetName, rowCount: rows.length });
  }
}
// Processar apenas sheets unicos
```

**Mudanca 4 -- Log de debug (dentro do loop de dados):**

```text
// Log primeiras 5 linhas para debug
if (totalRowsProcessed <= 5) {
  console.log(`📊 [XLSX Extractor] Row ${r}: supplier="${supplierName}", 
    weight=${grossWeight}, cbm=${cbm}, pkgs=${packagesQty}, 
    ncm=[${ncmCodes.join(',')}], desc="${description.substring(0,50)}"`);
}
```

### Resumo

```text
Arquivo                                           Mudanca
------------------------------------------------  -------------------------------------------
supabase/functions/sea-submit-analysis/           1. Filtro inteligente de linhas (numericCols >= 2)
  xlsxExtractor.ts                                2. isSkipRow com mais padroes de metadados
                                                  3. Deduplicacao de sheets com mesmos headers
                                                  4. Log detalhado das primeiras 5 linhas
```

Deploy automatico do edge function `sea-submit-analysis` apos as alteracoes.
