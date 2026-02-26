
## Correcao: Subtotais mostrando "not individually specified" em vez de valores reais do HBL

### Diagnostico

Analisei o resultado da analise e confirmei o problema com a imagem do HBL que voce enviou:

**O que o HBL mostra por exporter (confirmado pela imagem):**
- ZF DE10: 15 X WOODEN PALLET, AUTOPARTS, **4 190,000 KG**, **7,988 CBM**
- Lista de invoices: 7500745428, 7500745429, ... 7500745441

**O que o pdfExtractor ja extrai corretamente:**
O JSON enviado aos LLMs contem um array `exporters[]` com campos `gross_weight_kg`, `cbm`, `packages_qty` para CADA fornecedor. Esses dados estao disponiveis.

**O que acontece no resultado:**
```
Subtotals EXPORTER #22 (ZF DE10):
- Total Weight: Manifest: 3,943.967 kg | HBL: not individually specified | Status: VERIFY
```

### Causa Raiz

O prompt (linhas 1370-1375 de `prompts.ts`) diz:
> "HBL aggregates by supplier, no per-invoice breakdown"

Isso faz os LLMs (Gemini e Claude) acharem que **nao ha dados nenhuns por fornecedor no HBL**, quando na verdade o JSON extraido TEM peso, CBM e volumes por exporter. O problema esta na instrucao ambigua — ela quer dizer "sem detalhamento por invoice" mas os LLMs entendem "sem detalhamento nenhum".

Alem disso, o prompt nao instrui explicitamente os LLMs a **buscar o exporter correspondente no JSON do HBL** para preencher os subtotais.

### Solucao

Alterar a secao PER-ITEM vs AGGREGATE em `prompts.ts` (linhas 1328-1416) para:

1. **Esclarecer que o HBL JSON TEM dados por exporter**: Adicionar instrucao explicita:
   - "O JSON extraido do HBL contem um array `exporters` com `gross_weight_kg`, `cbm`, `packages_qty` para CADA fornecedor. Para os Subtotais, voce DEVE localizar o exporter correspondente pelo nome e usar esses valores."

2. **Diferenciar "per-invoice" de "per-exporter"**:
   - Per-invoice = o HBL nao detalha peso/CBM por invoice individual (correto, nao tentar)
   - Per-exporter = o HBL TEM peso/CBM/volumes por fornecedor no JSON (USAR esses valores nos subtotais)

3. **Atualizar o texto do template** (linhas 1370-1375): Mudar de:
   ```
   Manifest Items (reference — HBL aggregates by supplier, no per-invoice breakdown):
   ```
   Para:
   ```
   Manifest Items (reference — no per-invoice breakdown in HBL, totals verified at exporter level):
   ```

4. **Atualizar o template de subtotais** (linhas 1379-1382): Reforcar que os valores do HBL vem do JSON:
   ```
   Subtotals EXPORTER #N:
   - Total Weight: Manifest: X kg | HBL: Y kg (from exporters JSON) | Delta: Z kg | Status: MATCH|UPDATE REQUIRED
   ```

5. **Atualizar o exemplo concreto** (linhas 1405-1408): Ja mostra valores reais, mas adicionar comentario de onde vem:
   ```
   (Values above come from the HBL JSON "exporters" array for this supplier)
   ```

6. **Adicionar regra final** (linha 1416): 
   - "Para Subtotais, NUNCA output 'not individually specified'. O HBL JSON SEMPRE contem dados por exportador. Encontre o exporter correspondente pelo nome e use seus valores. Se nao encontrar, output 'HBL: exporter not found in HBL JSON' com Status: NOT FOUND."

### Arquivo Modificado
- `supabase/functions/sea-submit-analysis/prompts.ts` — Corrigir instrucoes de subtotais para usar dados reais do HBL JSON

### O que NAO sera alterado
- pdfExtractor.ts (ja extrai corretamente)
- xlsxExtractor.ts
- index.ts (ja passa o JSON correto)
- UI frontend
- Logica de NCM, peso referencia, multi-HBL
