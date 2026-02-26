

## Correcao: Remover "HBL not individually specified" por item

### Problema

O prompt atual (linhas 1335-1341 de `prompts.ts`) obriga o LLM a comparar Gross Weight, CBM e Volume **por item/invoice** entre Manifest e HBL. Porem, os documentos HBL quase nunca detalham dados no nivel de invoice individual — eles mostram apenas **totais agregados por fornecedor/exportador**.

Por exemplo, o HBL mostra:
```text
ZF POLSKA  9 X WOODEN PALLET  AUTOPARTS  1,296.000 KG  7.598 CBM
  AS PER INVOICE: 7500744709, 7500744712, ... (multiplas invoices)
```

Enquanto o Manifest lista cada invoice como um item separado com peso/CBM proprio. O LLM nao consegue encontrar detalhamento por invoice no HBL, entao preenche com "HBL: not individually specified" para cada item — gerando ruido massivo no relatorio.

### Solucao

Atualizar o formato de saida por exportador em `prompts.ts` (linhas 1327-1355) para lidar com o caso comum onde HBLs fornecem **agregados por fornecedor** ao inves de detalhamento por invoice.

### Alteracoes

**Arquivo: `supabase/functions/sea-submit-analysis/prompts.ts`** (linhas ~1327-1355)

Substituir o formato obrigatorio por item por uma abordagem de dois niveis:

1. **Nivel por exportador**: Comparar Weight, CBM e Volume no nivel de subtotal do fornecedor (o HBL sempre tem esses dados)
2. **Referencias de invoices**: Continuar verificando que TODOS os numeros de invoice do Manifest aparecem no texto do HBL
3. **Nivel por item (condicional)**: So detalhar comparacoes por item de Weight/CBM/Volume se o HBL realmente tiver detalhamento por invoice. Se o HBL agregar multiplas invoices em uma unica linha, listar os itens do manifest apenas como referencia e comparar numericos somente no nivel de subtotais

O formato atualizado sera:

```text
EXPORTER #N: <NOME_EMPRESA>
- CNPJ: Manifest: <valor> | HBL: <valor> | Status: MATCH|UPDATE REQUIRED|NOT FOUND
- Seal: Manifest: <valor> | HBL: <valor> | Status: MATCH|UPDATE REQUIRED|NOT FOUND

Invoice References:
- Manifest invoices: [INV1, INV2, INV3]
- HBL invoices: [INV1, INV2, INV3]
- Status: MATCH | Missing: [lista] | Extra: [lista]

Manifest Items (referencia — HBL agrega por fornecedor, sem detalhamento por invoice):
  - Invoice INV1: 1,200.000 kg / 5.500 m3 / 2 PALLETS
  - Invoice INV2: 800.000 kg / 3.200 m3 / 1 PALLET

Subtotals EXPORTER #N:
- Total Weight: Manifest: X kg | HBL: Y kg | Delta: Z kg | Status: MATCH|UPDATE REQUIRED
- Total CBM: Manifest: X m3 | HBL: Y m3 | Delta: Z m3 | Status: MATCH|UPDATE REQUIRED
- Total Volumes: Manifest: N | HBL: N | Delta: N | Status: MATCH|UPDATE REQUIRED
```

Regras-chave adicionadas:
- "Se o HBL mostrar UMA unica linha de peso/CBM cobrindo multiplas invoices de um fornecedor, NAO gerar 'HBL: not individually specified' para cada item de invoice"
- "Comparar Weight, CBM e Volumes no nivel de Subtotais por exportador"
- "Continuar verificando que TODAS as referencias de invoices estao presentes no texto do HBL"
- Padrao explicitamente proibido: `"HBL: not individually specified"`

### O que NAO sera alterado
- Regra de fonte de peso (prioridade do reference_weight_kg) — inalterada
- Logica de comparacao de NCM — inalterada
- Logica de soma de multi-HBL — inalterada
- Comparacao HBL x MBL — inalterada
- Comparacao Invoice x HBL — inalterada
- Toda logica de extracao (xlsxExtractor, pdfExtractor) — inalterada
- UI frontend — inalterada

### Arquivos Modificados
1. **`supabase/functions/sea-submit-analysis/prompts.ts`** — Adicionar regra de deteccao per-item vs agregado, atualizar formato obrigatorio de saida, adicionar exemplo concreto

