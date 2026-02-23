

# Correção do Teste de API Key do Gemini

## Problema Identificado

Na edge function `test-api-key/index.ts`, o teste do Gemini usa o modelo `gemini-2.0-flash`:

```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}
```

Este modelo pode estar indisponível ou depreciado, causando erro HTTP mesmo com uma chave válida. O projeto já usa `gemini-2.5-flash-preview-05-20` em outras funções (como `parse-invoice-pdf`), confirmando que a chave funciona com modelos mais recentes.

## Solução

Atualizar o modelo usado no teste para `gemini-2.5-flash`, que é estável e compatível com a chave configurada.

## Detalhes Técnicos

### Arquivo: `supabase/functions/test-api-key/index.ts`

Alterar a URL na função `testGemini` de:
```
gemini-2.0-flash:generateContent
```
Para:
```
gemini-2.5-flash:generateContent
```

Esta é uma alteração de uma única linha. Nenhum outro arquivo precisa ser modificado.

