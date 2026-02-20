

# Usar Claude para extrair dados do Manifest XLSX

## Problema

A funcao `mapColumns` programatica continua mapeando colunas erradas (supplier, description) apesar de multiplas tentativas de correcao. O segundo arquivo (PDF/HBL) ja e processado corretamente pelo LLM. A solucao e usar Claude tambem para extrair os dados estruturados do manifest XLSX.

## Abordagem

Criar uma funcao `extractXlsxWithLLM` que:

1. Le o XLSX como texto bruto (CSV) usando a funcao `extractXlsxText` que ja existe (linhas 427-530 do index.ts)
2. Envia esse texto para Claude com um prompt focado em extracao estruturada
3. Claude retorna JSON no formato `ManifestData` (mesma interface que `extractXlsxStructured` retorna)
4. O NCM continua sendo extraido programaticamente da coluna NCM (Pass 2 isolado) para garantir precisao

## Mudancas

### Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`

**Adicionar nova funcao `extractXlsxWithLLM`:**

- Recebe `fileUrl`, `fileName` e a API key do Anthropic
- Usa a biblioteca XLSX para converter o arquivo em texto CSV (similar ao `extractXlsxText` existente)
- Envia o texto CSV para Claude Sonnet 4 com prompt de extracao estruturada
- O prompt pede que Claude retorne JSON com: exporters (name, invoice_numbers, gross_weight_kg, net_weight_kg, cbm, packages, items com description), container, seal, totals
- Claude NAO extrai NCM — os NCM codes sao extraidos programaticamente da coluna NCM usando a logica atual (Pass 2 com `colMapNcmOnly`)
- A funcao faz merge: dados gerais do Claude + NCM codes do extrator programatico

**Fluxo dentro da funcao:**

```text
1. Fetch XLSX -> parse com biblioteca xlsx
2. Detectar header row (scoreHeaderRow existente)
3. mapColumns existente -> pegar apenas colMap.ncm
4. Loop nas linhas -> extrair NCM codes programaticamente (como hoje)
5. Converter sheet inteira para CSV text
6. Enviar CSV text para Claude com prompt de extracao
7. Claude retorna JSON com exporters, weights, descriptions, invoices
8. Merge: para cada exporter do Claude, associar os NCM codes extraidos programaticamente
9. Retornar ManifestData completo
```

**Prompt para Claude (resumo):**

```text
Voce recebera dados de um manifest de carga maritima em formato CSV.
Extraia os seguintes dados estruturados em JSON:

Para cada exportador/supplier unico:
- name: nome do supplier/exportador
- invoice_numbers: lista de referencias de notas/delivery notes
- gross_weight_kg: peso bruto total em kg
- net_weight_kg: peso liquido total em kg  
- cbm: cubagem total em m3
- packages: {qty: quantidade, type: tipo de embalagem}
- items: lista de itens com description, gross_weight_kg, net_weight_kg, cbm, packages_qty, packages_type, invoice_ref

Dados globais:
- container: numero do container (formato XXXX1234567)
- seal: numero do lacre

NAO extraia NCM codes — eles serao adicionados separadamente.
```

### Arquivo: `supabase/functions/sea-submit-analysis/index.ts`

**Na funcao `analyzeWithStructuredPipeline` (linha ~1044-1061):**

Substituir a chamada a `extractXlsxStructured` por `extractXlsxWithLLM`:

```text
// Antes:
manifestData = await extractXlsxStructured(xlsxFile.file_url, xlsxFile.file_name);

// Depois:
manifestData = await extractXlsxWithLLM(xlsxFile.file_url, xlsxFile.file_name);
```

Importar a nova funcao no topo do arquivo.

### Resultado esperado

- Supplier names: Claude le "Supplier Name" corretamente (nao confunde com "Supplier Country")
- Descriptions: Claude le "ZF Part Description" corretamente (nao confunde com "QTY Material")
- Weights: Claude interpreta valores numericos corretamente
- NCM codes: continuam sendo extraidos programaticamente da coluna NCM com filtro 4/6/8 digitos (sem mudanca)
- O segundo arquivo (PDF/HBL) continua sendo processado como antes (ja funciona)

### Custo e performance

- Uma chamada adicional ao Claude Sonnet 4 por analise (custo baixo pois e apenas texto CSV, sem PDFs)
- Tempo adicional: ~5-10 segundos
- Confiabilidade: muito superior ao mapeamento programatico de colunas

### Fallback

Se a chamada ao Claude falhar, a funcao faz fallback para `extractXlsxStructured` (logica programatica atual) para nao quebrar o fluxo.

