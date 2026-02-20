

# Reverter mudanças que quebraram a extração, manter apenas o fix de NCM

## Diagnóstico

Das 5 mudanças feitas ao `xlsxExtractor.ts`, apenas 1 corrigiu o NCM (o `scoreHeaderRow` para encontrar o header correto). As outras 4 mudanças introduziram problemas:

| Mudança | Efeito | Ação |
|---------|--------|------|
| `scoreHeaderRow` | Corrigiu detecção do header e NCM | MANTER |
| Sheet deduplication (linhas 295-321) | Pode remover sheets com dados válidos | REMOVER |
| `isSkipRow` expandido (linhas 212-225) | Padrões como 'container id', 'vessel name' pulam linhas de dados | REVERTER ao original |
| Smart row filtering `numericCols >= 2` (linhas 388-402) | Mais restritivo que o original, descarta linhas válidas | REVERTER ao original |
| `extra_columns` no ExporterItem | Inofensivo, captura dados extras | MANTER |

## Mudanças Específicas

### Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`

### 1. REMOVER sheet deduplication (linhas 295-321)

Remover todo o bloco de deduplicação de sheets. Voltar a processar todos os sheets (exceto 'instruction', 'info', etc. que já eram filtrados). Usar `sheetsToProcess` diretamente no loop.

### 2. REVERTER `isSkipRow` ao original (linhas 210-228)

Reverter para apenas os padrões básicos de totalização que já existiam antes:

```text
function isSkipRow(row): boolean
  skipPatterns = ['grand summary', 'grand total', 'total:', 'subtotal', 'sum:',
                  'total gross', 'total net', 'total cbm']
  // SEM 'loading date', 'vessel name', 'container id', etc.
  // SEM a lógica de firstCell.endsWith(':')
```

### 3. REVERTER row filtering ao original simples (linhas 388-402)

Voltar à lógica original: se não tem supplier e não tem description, simplesmente pular. Sem a lógica complexa de `numericCols >= 2`:

```text
Antes (complexo):
  if (!supplierName):
    hasWeight, hasCbm, hasPkgs, hasNcm, hasDesc...
    numericCols = count(...)
    if (numericCols >= 2 || hasNcm || ...): 'UNKNOWN EXPORTER'
    else: continue

Depois (original simples):
  if (!supplierName):
    supplierName = 'UNKNOWN EXPORTER'
    // Manter a linha, agrupada como UNKNOWN
```

### 4. MANTER scoreHeaderRow (linhas 244-257) - Sem alterações

Esta é a função que corrigiu a detecção do header e, consequentemente, o NCM.

### 5. MANTER extra_columns (linha 32, linhas 467-475) - Sem alterações

Captura dados de colunas não mapeadas sem afetar nenhuma outra funcionalidade.

### 6. Ajuste no loop principal: usar `sheetsToProcess` em vez de `dedupedSheets`

Na linha 329, trocar `dedupedSheets` por `sheetsToProcess` já que removemos a deduplicação.

## Resumo

```text
Arquivo                                           Mudança
------------------------------------------------  -------------------------------------------
supabase/functions/sea-submit-analysis/           1. REMOVER bloco de sheet deduplication
  xlsxExtractor.ts                                2. REVERTER isSkipRow (só padrões de totais)
                                                  3. REVERTER row filtering (simples, sem numericCols)
                                                  4. Trocar dedupedSheets → sheetsToProcess no loop
                                                  MANTER: scoreHeaderRow, extra_columns
```

Deploy automático do edge function `sea-submit-analysis` após as alterações.

