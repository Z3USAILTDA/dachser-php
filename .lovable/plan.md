

## Corrigir Matching de Exportadores: Enviar PDF Base64 do HBL no Stage 2

### Problema

O Stage 2 (analise comparativa) envia ao LLM apenas o JSON extraido pelo pdfExtractor, que contem apenas 1 shipper (SCHENKER DEUTSCHLAND AG). Os 26 fornecedores individuais estao nas rider pages do HBL PDF na coluna "Marks and Numbers" e nao sao capturados pelo extrator. O LLM precisa ver o PDF original para encontra-los.

Nas 5 analises do TCNU4156682 (IDs 28-32), nenhuma conseguiu extrair pesos individuais dos exportadores do HBL.

### Plano de Correcao

**Arquivo: `supabase/functions/sea-submit-analysis/index.ts`**

1. **Preservar o PDF base64 do HBL apos Stage 1**: Atualmente o PDF e baixado e enviado ao pdfExtractor, mas o base64 e descartado. Salvar o base64 do HBL em uma variavel para reutilizar no Stage 2.

2. **Incluir o PDF base64 no prompt do Stage 2**: Quando a analise for `manifest_hbl`, anexar o PDF do HBL como documento (via `source.type: base64`) na chamada do Claude, e como `inline_data` na chamada do Gemini. Isso permite que o LLM leia as rider pages diretamente.

3. **Manter a correcao de peso total**: O `totals.reference_weight_kg` continua usando `weighed_weight_kg` do cabecalho quando disponivel.

**Arquivo: `supabase/functions/sea-submit-analysis/prompts.ts`**

4. **Atualizar instrucao de subtotais**: Trocar "search the HBL data (rider pages / cargo description in the PDF JSON exporters array)" por "search the HBL PDF document attached below for each supplier. Look in the 'Marks and Numbers' column and cargo description sections of the rider pages."

5. **Manter regras existentes**: invoice_ref vs invoice_numbers, proibicao de "not individually specified", formato AGGREGATE, fallback "NOT FOUND".

### Detalhes Tecnicos

No `index.ts`, na funcao que baixa os arquivos para extracao:
- Ao baixar o PDF do HBL, armazenar `{ base64: pdfBase64, fileName }` em uma variavel `hblPdfData`
- Na chamada `runDualAnalysis`, passar `hblPdfData` como parametro adicional
- Nas funcoes `callClaude` e `callGemini` do Stage 2, incluir o PDF como parte do `content` array (documento para Claude, inline_data para Gemini)

Na funcao de construcao do prompt Stage 2:
- Adicionar instrucao: "An HBL PDF document is attached. Use it to find individual supplier/exporter weights, CBM, and package counts in the rider pages."

### Arquivos Modificados
1. `supabase/functions/sea-submit-analysis/index.ts` — Preservar e enviar PDF base64 do HBL no Stage 2
2. `supabase/functions/sea-submit-analysis/prompts.ts` — Atualizar instrucao para buscar dados no PDF anexado

### O que NAO sera alterado
- pdfExtractor.ts, xlsxExtractor.ts
- resultFormatter.ts, deterministicCompare.ts
- Frontend / UI
