

## Plano: Corrigir link de rastreio da United Cargo (016)

### Problema
O link direto `https://www.unitedcargo.com/en/us/track/awb/016-XXXXXXXX` está sendo bloqueado pelo servidor da United Cargo (ERR_BLOCKED_BY_RESPONSE).

### Alteração

**`src/pages/air/TrackingAereo.tsx`** (linha 96)

Substituir o URL builder da `016` para apontar para a página de tracking genérica (sem deep link direto, pois o servidor bloqueia):

```typescript
// Antes
"016": (i,a) => `https://www.unitedcargo.com/en/us/track/awb/${i}-${a}`,

// Depois
"016": (i,a) => `https://www.unitedcargo.com/en/us/track`,
```

O usuário será direcionado à página de tracking da United Cargo onde poderá colar o AWB manualmente. Não há URL com parâmetros de query disponível neste site (o formulário usa JavaScript client-side).

