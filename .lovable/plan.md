

## Ajustes na Analise Documental SEA — Manifest x Draft HBL

### Contexto
A comparacao Manifest x HBL usa tres camadas:
1. **xlsxExtractor.ts** — extrai dados estruturados do Manifest (XLSX)
2. **pdfExtractor.ts** — extrai dados estruturados do HBL (PDF)
3. **deterministicCompare.ts** — compara os dados extraidos campo a campo

### Problemas Identificados

**1. Gross Weight usa coluna errada no Manifest**
- Atualmente, o mapeamento de colunas (`COLUMN_ALIASES.gross_weight`) captura "Gross Weight", "Total Gross Weight", etc.
- O usuario quer que a comparacao use "Weighed Weight" do Manifest (e "Gross Weight" do HBL)
- Precisa de um campo separado `weighed_weight` para nao misturar com gross_weight

**2. Peso bruto por invoice, volumes e CBM nao verificados por item**
- A comparacao atual (linhas 301-314 de `deterministicCompare.ts`) faz apenas subtotais por exportador
- O array `items: []` e sempre vazio — nenhuma comparacao item-a-item e feita
- Cada item do manifest tem `gross_weight_kg`, `cbm`, `packages_qty` e `invoice_ref`
- Precisa cruzar itens do manifest com dados do HBL por invoice/descricao

**3. CBM total incorreto**
- Possivel problema no mapeamento de coluna CBM ou na extracao de valores
- Sera adicionado log detalhado e validacao do mapeamento

---

### Plano de Implementacao

#### Etapa 1: Adicionar campo "Weighed Weight" ao extrator XLSX

**Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`**

- Adicionar `weighed_weight` ao `ColumnMap` interface
- Adicionar aliases para `weighed_weight`: `['weighed weight', 'weight after weighting', 'weighted weight', 'peso aferido', 'peso pesado', 'peso balanca']`
- Adicionar campo `weighed_weight_kg` a `ExporterData`, `ExporterItem` e `ManifestData.totals`
- Na extracao programatica e LLM: extrair `weighed_weight` da coluna mapeada
- Logica: se `weighed_weight_kg > 0`, usar como peso de referencia; senao, fallback para `gross_weight_kg`

#### Etapa 2: Atualizar prompt LLM do XLSX para extrair Weighed Weight

**Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`**

- Adicionar `weighed_weight_kg` ao `LLM_EXTRACTION_PROMPT` para que o Claude tambem extraia esse campo
- Garantir merge correto no Step 5 (merge NCM + LLM data)

#### Etapa 3: Modificar comparacao para usar Weighed Weight do Manifest

**Arquivo: `supabase/functions/sea-submit-analysis/deterministicCompare.ts`**

- Na funcao `compareManifestHbl`:
  - Nos subtotais por exportador, usar `mExp.weighed_weight_kg || mExp.gross_weight_kg` como valor do Manifest
  - Nos totais gerais, usar `manifest.totals.weighed_weight_kg || manifest.totals.gross_weight_kg`
  - Renomear o campo de comparacao para "Gross Weight (Weighed)" para clareza

#### Etapa 4: Adicionar comparacao item-a-item (por invoice)

**Arquivo: `supabase/functions/sea-submit-analysis/deterministicCompare.ts`**

- Na funcao `compareManifestHbl`, dentro do loop de exportadores matched:
  - Para cada item do manifest exporter (`mExp.items`), criar comparacoes de:
    - Gross Weight (usando `weighed_weight_kg` do item se disponivel)
    - CBM
    - Volume Qty (packages)
  - Popular o array `items` (atualmente `[]`) com `ItemComparison` entries
  - Matching por `invoice_ref` quando possivel

#### Etapa 5: Fortalecer extracao de CBM

**Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`**

- Adicionar log detalhado ao mapeamento da coluna CBM (qual header foi matched)
- Verificar que os aliases de CBM nao colidem com outras colunas
- Na extracao programatica: logar valor CBM das primeiras linhas para debug
- Na extracao LLM: reforcar no prompt que CBM e "cubic meters" e deve ser extraido do campo correto (nao confundir com peso ou quantidade)

#### Etapa 6: Atualizar formatador de resultado

**Arquivo: `supabase/functions/sea-submit-analysis/resultFormatter.ts`**

- Verificar se o `formatComparisonResult` exibe corretamente os items-level comparisons
- Garantir que itens com divergencias aparecem no output final

---

### O que NAO sera alterado
- Comparacao HBL x MBL (intacta)
- Comparacao Invoices x HBL (intacta)
- Extracao de NCM codes (logica programatica mantida)
- Extracao de PDF (pdfExtractor.ts inalterado)
- Prompts do LLM principal de analise (index.ts system prompt)
- Toda a UI frontend (paginas, componentes)
- Qualquer outra funcionalidade existente

