
# Plano: Arquitetura de 2 Etapas para Analise Documental SEA

## Problema Atual

O sistema atual envia todos os documentos (Manifest XLSX + HBLs PDF) em uma unica chamada LLM, pedindo que o modelo extraia dados E compare simultaneamente. Isso causa:

- Truncamento de XLSX (limite de 200 linhas / 20.000 caracteres para arquivos grandes)
- Perda de dados em manifests com muitos exportadores
- Dependencia da "visao" do modelo para ler PDFs (falhas em documentos escaneados)
- Saida de texto livre dificil de validar programaticamente
- Hallucinations em NCMs e pesos

## Nova Arquitetura: Pre-Extracao + Comparacao Deterministica

```text
ANTES (1 etapa):
  [XLSX + PDFs] --> [LLM: extrai + compara] --> [texto livre]

DEPOIS (2 etapas):
  Etapa 1: [XLSX] --> [Parser programatico] --> JSON estruturado
           [PDF]  --> [LLM: extrai para JSON] --> JSON estruturado
  Etapa 2: [JSON manifest] + [JSON HBL] --> [Codigo TS: compara] --> Resultado final
```

## Detalhamento Tecnico

### Etapa 1A - Extracao Programatica do Manifest/XLSX

**Arquivo:** `supabase/functions/sea-submit-analysis/xlsxExtractor.ts` (novo)

Substituir a funcao `extractXlsxText` atual (que converte para CSV truncado) por um extrator que gera JSON estruturado:

```text
Entrada: XLSX file URL
Saida: {
  exporters: [
    {
      name: "SUPPLIER ABC",
      invoice_numbers: ["INV-001"],
      gross_weight_kg: 1250.500,
      net_weight_kg: 1100.000,
      cbm: 8.500,
      packages: { qty: 25, type: "CARTONS" },
      ncm_codes: ["84812090", "73182900"],
      container: "GLDU9941805",
      seal: "ML-BX5432",
      cnpj: "12345678000190"
    }
  ],
  totals: {
    gross_weight_kg: 5000.000,
    cbm: 25.500,
    packages: 120,
    ncm_codes: ["84812090", "73182900", ...]
  }
}
```

- Remover limites de truncamento (processar TODAS as linhas)
- Mapear colunas por header (Weight, CBM, NCM Code, Invoice, Supplier, etc.)
- Ignorar linhas de totais/subtotais ("Grand Summary", "Total")
- Calcular somas automaticamente

### Etapa 1B - Extracao Estruturada dos PDFs via LLM

**Arquivo:** `supabase/functions/sea-submit-analysis/pdfExtractor.ts` (novo)

Enviar cada PDF individualmente ao LLM com um prompt curto e focado SOMENTE em extracao (sem comparacao):

```text
Prompt: "Extraia os seguintes dados deste documento de forma exata e retorne APENAS um JSON:"

Saida esperada: {
  document_type: "hbl",
  bl_number: "HDMU1234567",
  shipper: "COMPANY X",
  consignee: "DACHSER DO BRASIL",
  notify_party: "...",
  vessel: "MAERSK LETICIA",
  voyage: "0EWMHS1MA",
  port_of_loading: "HAMBURG",
  port_of_discharge: "SANTOS",
  container: "GLDU9941805",
  seal: "ML-BX5432",
  gross_weight_kg: 1250.500,
  cbm: 8.500,
  packages: { qty: 25, type: "CARTONS" },
  ncm_codes: ["84812090", "73182900"],
  invoice_numbers: ["INV-001"],
  exporters: [
    {
      name: "SUPPLIER ABC",
      gross_weight_kg: 1250.500,
      cbm: 8.500,
      packages: 25,
      ncm_codes: ["84812090"]
    }
  ]
}
```

- Um prompt menor = menos tokens = resposta mais rapida e precisa
- Formato JSON forcado = 100% parseavel (sem regex em texto livre)
- Retry com JSON repair se o parse falhar
- Processar PDFs sequencialmente para economizar memoria

### Etapa 2 - Comparacao Deterministica (Programatica)

**Arquivo:** `supabase/functions/sea-submit-analysis/deterministicCompare.ts` (novo)

Codigo TypeScript puro que recebe os JSONs extraidos e gera o relatorio final:

**Para Manifest x HBL:**
1. Match exporters por nome (fuzzy matching, similaridade >= 0.6)
2. Comparar campo a campo com tolerancias definidas:
   - Peso: tolerancia de 1 kg
   - CBM: tolerancia de 0.01 m3
   - NCM: match exato (string comparison)
   - Packages: match exato
   - Seal: match exato
   - Invoice: match exato
3. Multi-HBL: somar pesos/CBMs de todos os HBLs antes de comparar com manifest
4. Gerar relatorio estruturado com status MATCH / UPDATE REQUIRED por campo

**Para HBL x MBL:**
1. Comparar todos os campos extraidos (Shipper, Consignee, Vessel, Voyage, Ports, Container, Seal, Weight, CBM, Packages, NCM)
2. Mesmas tolerancias

**Para Invoices x HBL:**
1. Match invoices por numero
2. Comparar valores, descricoes, quantidades

**Saida da comparacao:**
```text
{
  overall_status: "UPDATE_REQUIRED",
  fields: [
    {
      field: "gross_weight",
      manifest_value: "5000.000 kg",
      hbl_value: "4900.000 kg",
      delta: "100.000 kg",
      status: "DIVERGENCE",
      action: "Update HBL weight to 5000.000 kg"
    },
    {
      field: "ncm_codes",
      manifest_value: ["84812090", "73182900"],
      hbl_value: ["84812090"],
      missing: ["73182900"],
      extra: [],
      status: "DIVERGENCE"
    }
  ]
}
```

### Etapa 3 - Formatacao do Resultado

**Arquivo:** `supabase/functions/sea-submit-analysis/resultFormatter.ts` (novo)

Converte o JSON de comparacao no formato textual atual ("Hello, team...") para manter compatibilidade com:
- `AnalysisResultDisplay` (highlighting de cores)
- Botao "Copiar Divergencias"
- `extractHblShippingData` (extracao de metadados)

### Mudancas no index.ts Principal

A funcao `analyzeWithLLM` sera refatorada para:

1. Chamar `extractXlsxStructured()` em vez de `extractXlsxText()`
2. Chamar `extractPdfStructured()` para cada PDF (usando Claude/Gemini)
3. Chamar `deterministicCompare()` com os JSONs resultantes
4. Chamar `formatResult()` para gerar o texto final
5. Manter o fallback atual (se a extracao JSON falhar, usar o fluxo atual como fallback)

### Impacto na Memoria e Performance

- Extracao XLSX: sem truncamento, mas processamento por streaming (sem carregar tudo na memoria)
- PDFs: processados individualmente (ja e feito assim), mas com prompt menor = resposta mais rapida
- Comparacao: codigo TS puro, custo zero de API
- Tempo total estimado: similar ao atual (a extracao individual e mais rapida que a analise combinada)

## Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `supabase/functions/sea-submit-analysis/xlsxExtractor.ts` | Parser XLSX -> JSON estruturado |
| `supabase/functions/sea-submit-analysis/pdfExtractor.ts` | Extracao PDF via LLM -> JSON estruturado |
| `supabase/functions/sea-submit-analysis/deterministicCompare.ts` | Comparacao programatica JSON vs JSON |
| `supabase/functions/sea-submit-analysis/resultFormatter.ts` | JSON de comparacao -> texto formatado |

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/sea-submit-analysis/index.ts` | Refatorar `analyzeWithLLM` para usar pipeline de 2 etapas |

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| LLM nao retorna JSON valido | JSON repair + retry (ate 2 tentativas) + fallback para fluxo atual |
| Edge Function timeout (50s) | Processar PDFs sequencialmente, prompts menores |
| Memoria (256MB limit) | Manter otimizacoes de streaming existentes |
| Regressao nos resultados | Manter fluxo atual como fallback; testar lado a lado antes de desativar |

## Ordem de Implementacao

1. Criar `xlsxExtractor.ts` (parser programatico - sem LLM)
2. Criar `pdfExtractor.ts` (prompt de extracao + parse JSON)
3. Criar `deterministicCompare.ts` (logica de comparacao)
4. Criar `resultFormatter.ts` (formatacao do texto final)
5. Refatorar `index.ts` para usar o novo pipeline
6. Testar com documentos reais de cada tipo (manifest_hbl, hbl_mbl, invoices_hbl)
