

# Atualizar Gemini para versao 3 na Analise SEA

## Objetivo

Atualizar todas as chamadas Gemini nos arquivos de analise documental SEA para usar o **Gemini 3 Pro Preview**, a versao mais recente disponivel.

## Alteracoes

### 1. `supabase/functions/sea-submit-analysis/pdfExtractor.ts`

- Linha 201: Atualizar modelo de `gemini-2.5-flash-preview-05-20` para `gemini-3-pro-preview`
- Adicionar `thinkingConfig` com `thinkingBudget: 8192`
- Remover `temperature: 0` (incompativel com thinking mode)

### 2. `supabase/functions/sea-submit-analysis/index.ts`

- Linha 285 (`extractTextViaVisionAPI`): Atualizar de `gemini-2.0-flash` para `gemini-3-pro-preview`
- Linha 999 (`analyzeWithGeminiPro`): Atualizar de `gemini-2.5-pro-preview-06-05` para `gemini-3-pro-preview`
- Adicionar `thinkingConfig` em ambas as funcoes

### 3. `supabase/functions/compare-documents-llm/index.ts`

- Atualizar de `gemini-2.5-pro-preview-06-05` para `gemini-3-pro-preview` (analise documental comparativa)

## Resumo das versoes

| Arquivo | Funcao | Antes | Depois |
|---------|--------|-------|--------|
| `pdfExtractor.ts` | callGemini | gemini-2.5-flash-preview-05-20 | gemini-3-pro-preview |
| `index.ts` | extractTextViaVisionAPI | gemini-2.0-flash | gemini-3-pro-preview |
| `index.ts` | analyzeWithGeminiPro | gemini-2.5-pro-preview-06-05 | gemini-3-pro-preview |
| `compare-documents-llm/index.ts` | comparacao | gemini-2.5-pro-preview-06-05 | gemini-3-pro-preview |

Todas as chamadas terao `thinkingConfig` habilitado para modo raciocinio.

