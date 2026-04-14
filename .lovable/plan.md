

## Plano: Corrigir bloqueio do link United Cargo (016)

### Problema
O site da United Cargo bloqueia a abertura quando detecta que veio de uma origem externa (cross-origin referrer). O `window.open(url, "_blank")` envia o referrer, fazendo o servidor rejeitar a requisição.

### Alteração

**`src/pages/air/TrackingAereo.tsx`** (linha ~981)

Alterar o `window.open` para incluir `noopener,noreferrer`, removendo o referrer da requisição:

```typescript
// Antes
window.open(trackingUrl, "_blank")

// Depois
window.open(trackingUrl, "_blank", "noopener,noreferrer")
```

Essa alteração se aplica a **todos** os links de companhias (não apenas 016), o que é uma boa prática de segurança.

### Resultado
O link da United Cargo (e demais) abrirá sem enviar o referrer, evitando o bloqueio do servidor.

