

# Correcao: Nao extrair HS Code como NCM no xlsxExtractor

## Problema

No `xlsxExtractor.ts`, os aliases da coluna `ncm` incluem termos de HS Code (`'tariff code'`, `'tariff'`, `'taric'`, `'warentarifnummer'`, `'zolltarif'`). Quando o Manifest tem uma coluna com esses nomes, o extrator mapeia como NCM e extrai os valores -- gerando divergencias falsas.

## Solucao

Mover os 5 aliases genericos de tarifa da lista `ncm` para a lista `hs_code`. Como a extracao (linha 340) so usa `colMap.ncm` e ignora `colMap.hs_code`, os valores de HS Code deixam de ser extraidos.

## Detalhes Tecnicos

### Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`

**Aliases NCM -- remover:**
```
'tariff code', 'tariff', 'taric', 'warentarifnummer', 'zolltarif'
```

**Aliases NCM corrigidos (linhas 91-95):**
```
'ncm code', 'ncm', 'código ncm', 'codigo ncm', 'ncm-code',
'ncm nr', 'ncm code 8 digits', 'ncm 8', 'codigo ncm 8',
```

**Aliases HS Code corrigidos (linhas 96-99):**
```
'hs code', 'hs', 'hs-code', 'h.s.', 'hs code 6 digits',
'harmonized code', 'harmonized system',
'tariff code', 'tariff', 'taric', 'warentarifnummer', 'zolltarif',
```

Deploy automatico do edge function `sea-submit-analysis` apos a alteracao.

