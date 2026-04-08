

## Plano: Migrar todas as chamadas Gemini diretas para Lovable AI Gateway + maximizar tokens

### Resumo
Migrar **7 edge functions** que ainda usam `GEMINI_API_KEY` + API Gemini direta para o **Lovable AI Gateway** (`ai.gateway.lovable.dev`) com `LOVABLE_API_KEY`. Também aumentar `max_tokens` para o máximo em todas as LLMs do projeto.

### Funções afetadas

| # | Edge Function | Chamadas Gemini | Modelo atual | Modelo gateway |
|---|---|---|---|---|
| 1 | `parse-invoice-pdf/index.ts` | 1 chamada | gemini-2.5-flash-preview | google/gemini-2.5-flash |
| 2 | `parse-awb/index.ts` | 1 chamada | gemini-2.5-flash-preview | google/gemini-2.5-flash |
| 3 | `parse-comprovante-pdf/index.ts` | 1 chamada | gemini-2.5-flash-preview | google/gemini-2.5-flash |
| 4 | `analyze-chb-documents/index.ts` | 3 chamadas (2 OCR + 1 fallback) | gemini-2.5-flash / gemini-2.5-pro-preview | google/gemini-2.5-flash / google/gemini-2.5-pro |
| 5 | `sea-submit-analysis/index.ts` | 3 chamadas (OCR + Pro + dual) | gemini-3-pro-preview | google/gemini-2.5-pro |
| 6 | `sea-submit-analysis/pdfExtractor.ts` | 1 chamada | gemini-3-pro-preview | google/gemini-2.5-pro |
| 7 | `maritimo-analyze/llmAnalyzer.ts` | 1 chamada (fallback) | gemini-2.5-flash-preview | google/gemini-2.5-flash |
| 8 | `test-api-key/index.ts` | 1 chamada (teste) | gemini-2.5-flash | google/gemini-2.5-flash |

### Padrão de conversão (igual ao `parse-manifest-swap` existente)

**Antes** (Gemini direto — quebrado):
```typescript
const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
const response = await fetch(`https://generativelanguage.googleapis.com/.../generateContent?key=${geminiApiKey}`, {
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: base64 } }] }],
    generationConfig: { maxOutputTokens: 4096 }
  })
});
const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
```

**Depois** (Lovable AI Gateway — funcional):
```typescript
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } }
      ]
    }],
    max_tokens: 16000
  })
});
const text = result.choices?.[0]?.message?.content;
```

### Maximização de tokens (todas as LLMs)

| Função | LLM | Token atual | Token novo |
|---|---|---|---|
| `chb-corrections` | Lovable AI (flash) | 500 | 8000 |
| `chb-corrections` | Lovable AI (pro) | 2000 | 16000 |
| `analyze-chb-documents` | Anthropic Claude | 64000 | 64000 (já máximo) |
| `analyze-chb-documents` | OCR (flash) | 16000 | 32000 |
| `analyze-chb-documents` | OCR image | 8000 | 16000 |
| `analyze-chb-documents` | Fallback (pro) | 32000 | 65536 |
| `parse-invoice-pdf` | flash | 4096 | 16000 |
| `parse-awb` | flash | 2048 | 16000 |
| `parse-comprovante-pdf` | flash | 1000 | 8000 |
| `sea-submit-analysis` | OCR | 12000 | 32000 |
| `sea-submit-analysis` | Pro analysis | 32000 | 65536 |
| `sea-submit-analysis` | Dual analysis | 32000 | 65536 |
| `sea-submit-analysis/pdfExtractor` | Pro | 8000 | 32000 |
| `maritimo-analyze` | Fallback | 16000 | 32000 |
| `parse-bl-cadastro` | Anthropic | 4000 | 16000 |
| `parse-hawb-cadastro` | Anthropic | 4000 | 16000 |
| `compare-documents-llm` | Anthropic | 8000 | 32000 |
| `sea-submit-analysis` | Claude main | 64000 | 64000 (já máximo) |
| `maritimo-analyze/simplePdfReader` | Haiku | 12000 | 32000 |
| `maritimo-analyze/simplePdfReader` | Sonnet | 16000 | 32000 |
| `maritimo-analyze/llmAnalyzer` | Anthropic | 16000 | 32000 |
| `sea-submit-analysis/xlsxExtractor` | Anthropic | 8192 | 32000 |
| `extract-boleto-barcode` | Anthropic | 500 | 2000 |

### `test-api-key` — atualização especial
O teste de Gemini será convertido para chamar o Lovable AI Gateway em vez da API direta, testando a chave `LOVABLE_API_KEY`.

### Arquivos alterados
| Arquivo | Tipo de alteração |
|---|---|
| `supabase/functions/parse-invoice-pdf/index.ts` | Migrar Gemini → Gateway + max tokens |
| `supabase/functions/parse-awb/index.ts` | Migrar Gemini → Gateway + max tokens |
| `supabase/functions/parse-comprovante-pdf/index.ts` | Migrar Gemini → Gateway + max tokens |
| `supabase/functions/analyze-chb-documents/index.ts` | Migrar 3 chamadas Gemini → Gateway + max tokens |
| `supabase/functions/sea-submit-analysis/index.ts` | Migrar 3 chamadas Gemini → Gateway + max tokens |
| `supabase/functions/sea-submit-analysis/pdfExtractor.ts` | Migrar Gemini → Gateway + max tokens |
| `supabase/functions/maritimo-analyze/llmAnalyzer.ts` | Migrar Gemini fallback → Gateway + max tokens |
| `supabase/functions/test-api-key/index.ts` | Migrar teste Gemini → Gateway |
| `supabase/functions/parse-bl-cadastro/index.ts` | Aumentar max_tokens |
| `supabase/functions/parse-hawb-cadastro/index.ts` | Aumentar max_tokens |
| `supabase/functions/compare-documents-llm/index.ts` | Aumentar max_tokens |
| `supabase/functions/maritimo-analyze/simplePdfReader.ts` | Aumentar max_tokens |
| `supabase/functions/sea-submit-analysis/xlsxExtractor.ts` | Aumentar max_tokens |
| `supabase/functions/extract-boleto-barcode/index.ts` | Aumentar max_tokens |
| `supabase/functions/chb-corrections/index.ts` | Aumentar max_tokens |

### Resultado esperado
- Todas as chamadas de IA passam pelo Lovable AI Gateway (sem depender de `GEMINI_API_KEY`)
- Todas as LLMs operam com tokens maximizados para evitar truncamento
- OCR, fallback e análises voltam a funcionar normalmente

