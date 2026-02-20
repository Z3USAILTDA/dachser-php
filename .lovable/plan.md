

# Pipeline Multi-Modelo para Analise Documental SEA

## Resumo

Substituir o pipeline atual (extrai XLS + PDF, compara deterministicamente) por uma nova arquitetura onde 3 modelos de IA trabalham em conjunto: Gemini e Claude analisam em paralelo, GPT arbitra e gera o resultado final. Tudo persistido na tabela `t_sea_analytics_extr` no MariaDB.

## Arquitetura do Pipeline

```text
                    +------------------+
                    |   Arquivos       |
                    | XLS + PDF        |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+          +--------v--------+
     | ETAPA 1A: XLS   |          | ETAPA 1B: PDF   |
     | Claude Sonnet 4  |          | Gemini 3 Pro    |
     | + NCM progr.     |          |                 |
     +--------+--------+          +--------+--------+
              |                             |
              |  json_xls_extraction        |  json_pdf_extraction
              |                             |
              +----> INSERT t_sea_analytics_extr <---+
              |                             |
              +--------------+--------------+
                             |
              +--------------+--------------+  (Promise.all)
              |                             |
     +--------v--------+          +--------v--------+
     | ETAPA 2A:        |          | ETAPA 2B:        |
     | Gemini 3 Pro     |          | Claude Sonnet 4.5|
     | Mesmo prompt     |          | Mesmo prompt     |
     +--------+--------+          +--------+--------+
              |                             |
              |  result_gemini              |  result_claude
              |                             |
              +----> UPDATE t_sea_analytics_extr <---+
              |                             |
              +--------------+--------------+
                             |
                    +--------v--------+
                    | ETAPA 3: GPT-5  |
                    | OpenAI API      |
                    | (CHB_OPENAI_API_KEY)
                    +--------+--------+
                             |
                             |  result_gpt (final)
                             |
                    +--------v--------+
                    | UPDATE DB       |
                    | Retorna ao user |
                    +------------------+
```

## Detalhes Tecnicos

### 1. Tabela MariaDB: `t_sea_analytics_extr`

Criada via `CREATE TABLE IF NOT EXISTS` no inicio do processamento:

```sql
CREATE TABLE IF NOT EXISTS ai_agente.t_sea_analytics_extr (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  run_id          INT NULL,
  item_id         INT NULL,
  processed_at    DATETIME DEFAULT NOW(),
  base_file_name  VARCHAR(500),
  json_xls_extraction  LONGTEXT,
  json_pdf_extraction  LONGTEXT,
  result_gemini        LONGTEXT,
  result_claude        LONGTEXT,
  result_gpt           LONGTEXT,
  analysis_type        VARCHAR(50),
  total_time_ms        INT NULL,
  created_at           DATETIME DEFAULT NOW()
);
```

### 2. Etapa 1A: Extracao XLS (Claude Sonnet 4)

Reutilizar `extractXlsxWithLLM` existente em `xlsxExtractor.ts` -- ja funciona, retorna `ManifestData` JSON com NCM programatico.

### 3. Etapa 1B: Extracao PDF (Gemini 3 Pro)

Reutilizar `extractPdfStructured` existente em `pdfExtractor.ts` -- ja funciona, retorna `PdfExtractedData` JSON via Gemini 3 Pro (com fallback Claude).

### 4. Etapa 2: Analise Comparativa (Gemini + Claude em paralelo)

Nova funcao `runDualAnalysis(jsonXls, jsonPdf, analysisType)`:
- Constroi o prompt usando `getPromptForAnalysisType` existente (prompts.ts)
- Inclui ambos os JSONs serializados como contexto textual
- Adiciona `getShippingDataExtractionInstructions` existente
- Chama Gemini 3 Pro e Claude Sonnet 4.5 via `Promise.all`
- Para Gemini: chamada direta a API Gemini (GEMINI_API_KEY)
- Para Claude: chamada direta a API Anthropic (ANTHROPIC_API_KEY)
- Retorna `{ geminiResult: string, claudeResult: string }`

### 5. Etapa 3: Arbitragem GPT-5 (OpenAI API)

Nova funcao `runGptArbitration(geminiResult, claudeResult, analysisType)`:
- Usa `CHB_OPENAI_API_KEY` para chamar `https://api.openai.com/v1/chat/completions`
- Modelo: `gpt-4.1` (ou `gpt-4o` se preferir)
- Prompt de arbitragem: "Voce recebeu duas analises do mesmo par de documentos. Compare ambas. Se uma identificou divergencias que a outra nao viu, inclua. Se ambas concordam, use essa versao. Gere a versao final consolidada."
- Inclui `getShippingDataExtractionInstructions` para que o GPT tambem gere o bloco `hbl_shipping_data`
- Retorna o texto final consolidado

### 6. Orquestracao no index.ts

Modificar `processAnalysis` (linha ~1671) para:

```text
1. Criar tabela t_sea_analytics_extr (IF NOT EXISTS)
2. Extrair XLS -> jsonXls via extractXlsxWithLLM (Claude, existente)
3. Extrair PDFs -> jsonPdf via extractPdfStructured (Gemini, existente)
4. INSERT na t_sea_analytics_extr com json_xls e json_pdf
5. Promise.all([analyzeGemini, analyzeClaude]) -- ambos recebem jsonXls + jsonPdf + prompt
6. UPDATE t_sea_analytics_extr com result_gemini e result_claude
7. runGptArbitration(geminiResult, claudeResult)
8. UPDATE t_sea_analytics_extr com result_gpt e total_time_ms
9. UPDATE t_dachser_sea_runs com result_gpt como resultado final
10. Continuar fluxo existente (extrair shipping data, atualizar item, etc.)
```

A funcao `analyzeWithStructuredPipeline` sera substituida por esta nova logica. O fallback legado (`analyzeWithAnthropic` + `analyzeWithGeminiPro`) continua existindo caso o pipeline inteiro falhe.

### 7. Modelos e APIs

| Etapa | Modelo | API Key | Endpoint |
|-------|--------|---------|----------|
| Extracao XLS | Claude Sonnet 4 | ANTHROPIC_API_KEY | api.anthropic.com |
| Extracao PDF | Gemini 3 Pro Preview | GEMINI_API_KEY | generativelanguage.googleapis.com |
| Analise 1 | Gemini 3 Pro Preview | GEMINI_API_KEY | generativelanguage.googleapis.com |
| Analise 2 | Claude Sonnet 4.5 | ANTHROPIC_API_KEY | api.anthropic.com |
| Arbitragem | GPT-4.1 | CHB_OPENAI_API_KEY | api.openai.com |

### 8. Arquivo Modificado

**`supabase/functions/sea-submit-analysis/index.ts`** (unico arquivo):
- Adicionar funcao `ensureAnalyticsTable(dbClient)` -- CREATE TABLE IF NOT EXISTS
- Adicionar funcao `runDualAnalysis(jsonXls, jsonPdfs, analysisType, metadata)` -- analise paralela
- Adicionar funcao `runGptArbitration(geminiResult, claudeResult, analysisType)` -- arbitragem OpenAI
- Modificar `processAnalysis()` para usar o novo pipeline de 3 etapas
- Manter todo o fluxo de upload, criacao de run, e atualizacao de item intacto

Nenhum outro arquivo precisa ser modificado.

### 9. Fallback

- Etapa 1 falha: erro propagado, cai no pipeline legado (analyzeWithAnthropic)
- Etapa 2 falha parcialmente (so um modelo respondeu): usar a analise disponivel como resultado final, pular arbitragem
- Etapa 3 falha (GPT): usar a analise do Claude (etapa 2) como resultado final
- Pipeline inteiro falha: cair no pipeline legado existente (ja implementado em `analyzeWithLLM`)

### 10. Tempo Estimado

- Etapa 1 (paralelo XLS + PDF): ~10s
- Etapa 2 (paralelo Gemini + Claude): ~15-20s
- Etapa 3 (GPT arbitragem): ~10s
- **Total: ~35-40s**

