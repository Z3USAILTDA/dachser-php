

## Plano: Migrar extração de cadastro Aéreo e Marítimo para API direta da OpenAI

### Funções afetadas

| Função | Uso atual | Modelo atual |
|--------|-----------|-------------|
| `parse-hawb-cadastro` | Cadastro aéreo (HAWB) | Gemini 2.5 Flash via Lovable AI Gateway |
| `parse-bl-cadastro` | Cadastro marítimo (BL) | Gemini 3 Pro via API direta Google |

### Pré-requisito: API Key da OpenAI

Não existe um `OPENAI_API_KEY` configurado nos secrets do projeto. Será necessário adicioná-lo antes da implementação.

### Alterações

**Arquivo 1: `supabase/functions/parse-hawb-cadastro/index.ts`**
- Trocar de Lovable AI Gateway (`LOVABLE_API_KEY` + `ai.gateway.lovable.dev`) para API direta da OpenAI (`OPENAI_API_KEY` + `api.openai.com/v1/chat/completions`)
- Modelo: `gpt-4o` (suporta PDFs via multimodal)
- Enviar PDF como base64 no formato `image_url` com `data:application/pdf;base64,...`
- Manter o mesmo prompt de extração e formato de resposta JSON
- Tratar erros 429 e 402

**Arquivo 2: `supabase/functions/parse-bl-cadastro/index.ts`**
- Trocar de Gemini API direta (`GEMINI_API_KEY` + `generativelanguage.googleapis.com`) para API direta da OpenAI
- Mesmo padrão: `OPENAI_API_KEY`, modelo `gpt-4o`, formato OpenAI chat completions
- Adaptar parsing da resposta de formato Gemini (`candidates[0].content.parts`) para formato OpenAI (`choices[0].message.content`)
- Manter o mesmo prompt e estrutura de saída

### Formato da chamada OpenAI (ambas funções)

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } },
      ],
    }],
    max_tokens: 4000,
  }),
});
// Response: aiResponse.choices[0].message.content
```

### Sequência de implementação

1. Solicitar `OPENAI_API_KEY` como secret do projeto
2. Reescrever `parse-hawb-cadastro/index.ts` para usar OpenAI
3. Reescrever `parse-bl-cadastro/index.ts` para usar OpenAI

