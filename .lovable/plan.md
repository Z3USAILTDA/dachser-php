

# Problema: AWB 724-86856405 não aparece no Monitoramento

## Causa Raiz
O status `AWR` que adicionamos recentemente ao backend **não foi incluído na whitelist do frontend**. O arquivo `src/pages/Index.tsx` (linha 1945) tem uma lista `allowedStatuses` que controla quais AWBs são exibidos. O status `AWR` não está nessa lista, então o processo é filtrado e não aparece.

## Correção

### Arquivo: `src/pages/Index.tsx`
Adicionar `"AWR"` à lista `allowedStatuses` (após `"AWD"`, linha ~1978):

```typescript
"NFD",
"AWD",
"AWR",  // ← Adicionar aqui: documentação recebida
```

Alteração de 1 linha em 1 arquivo.

