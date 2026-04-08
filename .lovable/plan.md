

## Plano: Corrigir localização automática nas correções CHB

### Problema identificado
Os logs confirmam o fluxo:
1. **Stage 1 (Gemini Flash — quick search)**: retorna `found: false`
2. **Stage 2 (Gemini Pro — re-extraction)**: roda em background, encontra com `confidence: "alta"`, mas o **response HTTP já foi enviado** com `found: false`
3. O usuário vê o toast "Localização automática não disponível" mesmo quando a re-extração encontra

### Causa raiz
O Stage 1 (Flash) é fraco demais para localizar valores em documentos complexos. A re-extração (Pro) funciona mas é fire-and-forget — o resultado nunca chega ao frontend.

### Solução
Tornar a re-extração **síncrona** quando o Stage 1 falha, em vez de fire-and-forget. Isso garante que o usuário receba o resultado correto na mesma resposta.

### Alterações

**`supabase/functions/chb-corrections/index.ts`**

1. Quando `locationResult.found === false` e há `effectiveFileContent`, executar `reextractFieldWithContext` de forma **síncrona** (await) em vez de dispatch paralelo
2. Se a re-extração encontrar (`found: true`), usar esse resultado como o `locationResult` da resposta
3. Atualizar a correção no banco com os dados da re-extração antes de responder
4. Manter o dispatch paralelo apenas como fallback se houver timeout

Lógica simplificada:
```
if (!locationResult.found && effectiveFileContent) {
  // Tenta re-extração síncrona (Pro) antes de responder
  const reextResult = await reextractFieldWithContext(...);
  if (reextResult.found) {
    locationResult = { found: true, location: reextResult.location, ... };
    // Atualiza correção no banco
    // Salva extraction rule
  }
}
// Responde com locationResult atualizado
```

### Arquivo alterado
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/chb-corrections/index.ts` | Re-extração síncrona quando Stage 1 falha, resultado devolvido na resposta |

### Resultado esperado
- Usuário recebe a localização correta no toast (ex: "Localizado: Na seção Accounting Information...")
- A correção é salva com `location_confidence: "alta"` desde o início
- Extraction rules são criadas na mesma request

