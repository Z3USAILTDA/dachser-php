

## Plano: Corrigir localização automática nas correções CHB

### Problema
A função `chb-corrections` usa a API Gemini diretamente com `GEMINI_API_KEY`, mas essa chave está inválida (erro `API_KEY_INVALID` nos logs). Isso faz com que tanto a localização inicial (Gemini Flash) quanto a re-extração profunda (Gemini Pro) falhem, e a correção é salva sem dados de localização — quebrando o loop de aprendizado.

### Solução
Migrar as duas chamadas de IA para usar o **Lovable AI Gateway** (`ai.gateway.lovable.dev`) com `LOVABLE_API_KEY`, que já funciona no projeto (ex: `parse-manifest-swap`). Manter os mesmos modelos equivalentes via gateway.

### Alterações

**`supabase/functions/chb-corrections/index.ts`**

1. **Função `locateValueInFile`** (linha ~28-121):
   - Trocar `GEMINI_API_KEY` por `LOVABLE_API_KEY`
   - Trocar URL `generativelanguage.googleapis.com` por `ai.gateway.lovable.dev/v1/chat/completions`
   - Converter formato de request de Gemini nativo para OpenAI-compatible (usado pelo gateway)
   - Usar modelo `google/gemini-2.5-flash` (equivalente ao Flash atual)

2. **Função `reextractFieldWithContext`** (linha ~141-297):
   - Mesma migração: `LOVABLE_API_KEY` + gateway URL
   - Usar modelo `google/gemini-2.5-pro` (equivalente ao Pro atual)
   - Converter formato de request para OpenAI-compatible

### Formato da chamada (antes → depois)

Antes (Gemini direto — quebrado):
```typescript
const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview:generateContent?key=${geminiApiKey}`, {
  body: JSON.stringify({ contents: [...], generationConfig: {...} })
});
```

Depois (Lovable AI Gateway — funcional):
```typescript
const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
    temperature: 0.1
  })
});
// Parse: result.choices[0].message.content
```

### Resultado esperado
- Localização automática passa a funcionar
- Re-extração profunda grava regras de extração no banco
- Próximas análises usam as regras aprendidas para extrair corretamente

