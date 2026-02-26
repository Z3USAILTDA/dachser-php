

## Fix: Gross Weight coletado incorretamente do Manifest

### Causa Raiz

O pipeline de analise SEA **nao usa** as funcoes deterministicas (`compareManifestHbl`, `formatComparisonResult`). Elas estao importadas mas **nunca sao chamadas**. A analise e feita 100% por LLMs (Claude + Gemini) no Stage 2, que recebem o JSON extraido como texto.

O JSON extraido pelo `xlsxExtractor.ts` ja contem ambos os campos `gross_weight_kg` e `weighed_weight_kg`, mas o **prompt enviado aos LLMs** (em `prompts.ts`) nao instrui explicitamente para usar `weighed_weight_kg` do Manifest na comparacao de peso. Os modelos acabam usando `gross_weight_kg` por padrao.

### Diagnostico

1. **`prompts.ts` linha 268**: Diz vagamente "Weights (Gross Weight, Net Weight, Weight after Weighting - use the authoritative one)" -- sem instrucao clara de prioridade
2. **`runDualAnalysis` (index.ts ~1070)**: Envia o JSON bruto para os LLMs com ambos os campos, sem destaque
3. **Funcoes deterministicas**: `compareManifestHbl`, `compareHblMbl`, etc. estao importadas mas **nunca sao chamadas** -- sao codigo morto

### Plano de Correcao

#### 1. Atualizar prompt `PROMPT_MANIFEST_HBL` em `prompts.ts`

Adicionar instrucao explicita e destacada na secao de extracao de dados do Manifest:

```text
WEIGHT COMPARISON RULE FOR MANIFEST x HBL:
- FROM MANIFEST: Use "weighed_weight_kg" field (Peso Aferido / Weighed Weight). 
  If weighed_weight_kg is 0 or absent, fallback to "gross_weight_kg".
- FROM HBL: Always use "gross_weight_kg" (Gross Weight).
- The JSON data you receive contains BOTH fields. You MUST prioritize weighed_weight_kg.
```

Locais especificos no prompt que precisam de ajuste:
- Secao "FROM MANIFEST/XLSX" (~linha 266-268): Tornar explicito que `weighed_weight_kg` e o campo prioritario
- Secao "WEIGHT VERIFICATION" (~linha 318-328): Adicionar regra de que no Manifest o peso de referencia e `weighed_weight_kg`
- Secao do `runDualAnalysis` prompt (~index.ts linha 1085): Adicionar nota sobre prioridade do campo

#### 2. Enriquecer o JSON do Manifest antes de enviar aos LLMs

No `index.ts`, apos a extracao XLSX (~linha 1293), adicionar um campo computado `reference_weight_kg` em cada exporter e nos totals, que ja resolve a prioridade:

```typescript
// After extracting manifest data, compute reference weights for LLM clarity
if (manifestData) {
  for (const exp of manifestData.exporters) {
    exp.reference_weight_kg = exp.weighed_weight_kg > 0 ? exp.weighed_weight_kg : exp.gross_weight_kg;
    for (const item of exp.items) {
      item.reference_weight_kg = item.weighed_weight_kg > 0 ? item.weighed_weight_kg : item.gross_weight_kg;
    }
  }
  manifestData.totals.reference_weight_kg = manifestData.totals.weighed_weight_kg > 0 
    ? manifestData.totals.weighed_weight_kg : manifestData.totals.gross_weight_kg;
}
```

#### 3. Atualizar instrucao no `runDualAnalysis`

Na funcao `runDualAnalysis` (index.ts ~linha 1085), adicionar instrucao explicita apos o bloco "EXTRACTED DATA FROM XLSX":

```text
IMPORTANT: In the Manifest JSON, each exporter has a "reference_weight_kg" field. 
This is the weight you MUST use for comparison (it prioritizes Weighed Weight over Gross Weight).
Compare this "reference_weight_kg" from Manifest against "gross_weight_kg" from HBL.
```

### Arquivos Modificados

1. **`supabase/functions/sea-submit-analysis/prompts.ts`** -- Instrucoes explicitas de prioridade de peso
2. **`supabase/functions/sea-submit-analysis/index.ts`** -- Campo `reference_weight_kg` computado + instrucao no `runDualAnalysis`

### O que NAO sera alterado

- `xlsxExtractor.ts` (extracao ja funciona corretamente)
- `deterministicCompare.ts` (codigo morto no pipeline atual, mas correto)
- `pdfExtractor.ts` (inalterado)
- `resultFormatter.ts` (inalterado)
- Toda a UI frontend
- Comparacoes HBL x MBL e Invoices x HBL (intactas)

