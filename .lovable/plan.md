

## Correcao: Reverter Matching Programatico e Corrigir Peso Total

### Diagnostico Baseado nos Documentos Reais

Analisei os dois documentos enviados (Manifest TCNU4156682.xlsx e HBL TCNU4156682.PDF) e identifiquei as causas raiz dos problemas:

**Problema 1: "exporter not found in HBL JSON" em todos os 26 exportadores**

O `matchExportersToHbl()` tenta combinar exportadores usando o array `exporters[]` extraido pelo pdfExtractor. Porem, o pdfExtractor NAO consegue extrair os 26 fornecedores individuais das rider pages do HBL porque:
- As rider pages tem os nomes dos fornecedores na coluna "Marks and Numbers" (ex: "BOLLHOFF GMBH", "FRENZELIT GMBH"), nao em um campo "Shipper" convencional
- O pdfExtractor provavelmente retorna apenas o shipper principal (SCHENKER DEUTSCHLAND AG) como unico exporter

Antes das mudancas recentes, o LLM no Stage 2 recebia o PDF completo (via base64) e conseguia ler as rider pages diretamente, encontrando cada fornecedor com peso, CBM e volumes. Isso FUNCIONAVA -- o primeiro resultado mostrava valores reais como "HBL: 1,320.000 kg", "HBL: 15.700 kg", etc.

**Correcao**: Remover completamente o `matchExportersToHbl()` e as instrucoes de "pre-matched data". Restaurar a abordagem original onde o LLM busca dados dos exportadores diretamente no conteudo do PDF (rider pages) durante o Stage 2.

**Problema 2: Peso total errado (4,038 kg)**

O cabecalho do Manifest mostra:
- `Gross Weight [KG]: 11,291,602` (= 11,291.602 kg)
- `Weighed Weight (KG): 12,001,000` (= 12,001.000 kg)

O HBL mostra total de 12,001.000 KG -- que COMBINA com o Weighed Weight do cabecalho do Manifest.

Porem, a coluna "weight after weighting" nos itens individuais esta parcialmente preenchida (muitos em branco). A soma dos valores preenchidos = ~4,038 kg. O sistema atual soma esses valores individuais e chega em 4,038 kg em vez de usar o total do cabecalho (12,001 kg).

O xlsxExtractor provavelmente ja extrai o total do cabecalho no campo `totals.weighed_weight_kg`. A logica de `reference_weight_kg` deveria usar esse total direto, nao recalcular somando os itens individuais.

**Correcao**: Para o total, usar `totals.weighed_weight_kg` quando disponivel (> 0), em vez de somar individualmente. O total do cabecalho do Manifest e o valor confiavel.

---

### Alteracoes Tecnicas

**Arquivo 1: `supabase/functions/sea-submit-analysis/index.ts`**

1. **REMOVER** as funcoes `normalizeName()`, `nameSimilarity()` e `matchExportersToHbl()` (linhas 32-111)
2. **REMOVER** o bloco "PROGRAMMATIC EXPORTER MATCHING" (linhas 1480-1491) que chama essas funcoes
3. **REMOVER** o bloco "PRE-MATCHED HBL DATA PER EXPORTER" do prompt do Stage 2 (linhas 1178-1187)
4. **CORRIGIR** o calculo de peso total (linhas 1419-1425):
   - Em vez de `manifestData.exporters.reduce(sum + reference_weight_kg)`, usar o total do cabecalho: `totals.weighed_weight_kg > 0 ? totals.weighed_weight_kg : totals.gross_weight_kg`
   - Manter a logica per-exporter inalterada (cada exporter tem seu proprio reference_weight_kg)
   - O total reference_weight_kg deve vir do cabecalho, nao da soma dos itens individuais
5. **MANTER** a logica de `reference_weight_kg` per-exporter (weighing completeness check) — esta correta para itens individuais

**Arquivo 2: `supabase/functions/sea-submit-analysis/prompts.ts`**

1. **REMOVER** o bloco "PRE-MATCHED HBL DATA IN MANIFEST JSON" (linhas 1336-1343)
2. **RESTAURAR** instrucao para o LLM buscar dados dos exportadores:
   ```text
   For Subtotals, you MUST search the HBL data (rider pages / cargo description in the 
   PDF JSON "exporters" array) for each supplier. Look for matching names (the HBL may 
   use abbreviated names like "BOLLHOFF GMBH" for "Bollhoff GmbH"). Extract their 
   gross_weight_kg, cbm, and packages_qty from the HBL data.
   If you cannot find a matching exporter in the HBL data, output 
   "HBL: exporter not found in HBL" with Status: NOT FOUND.
   ```
3. **MANTER** a correcao de invoice_ref vs invoice_numbers (linhas 1345-1350)
4. **MANTER** a proibicao de "not individually specified" (linha 1406)
5. **MANTER** o formato AGGREGATE (itens como referencia)
6. **ATUALIZAR** linha 1407 para remover referencia a "pre-matched fields"

### O que NAO sera alterado
- pdfExtractor.ts (extrai o que consegue)
- xlsxExtractor.ts (extrai corretamente)
- resultFormatter.ts, deterministicCompare.ts
- UI frontend
- Comparacao HBL x MBL e Invoice x HBL

### Arquivos Modificados
1. `supabase/functions/sea-submit-analysis/index.ts` -- Remover matching programatico, corrigir peso total para usar cabecalho
2. `supabase/functions/sea-submit-analysis/prompts.ts` -- Restaurar instrucao para LLM buscar exportadores no PDF, remover referencia a pre-matched data

