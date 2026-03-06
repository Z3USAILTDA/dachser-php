

# Fix: Link da Aeromexico (139) na página de Rastreio Aéreo

## Problema
O link de rastreio da Aeromexico (código 139) na página principal de tracking (`src/pages/Index.tsx`, linha 128) está usando a URL antiga: `https://www.aeromexico.com/es-mx/carga/rastrear?awb=${iata}${awb}`.

O arquivo `TrackingUtils.ts` já foi corrigido anteriormente, mas a página `/air/tracking` usa sua própria função `getTrackingUrl` em `Index.tsx`.

## Correção
Alterar a linha 128 de `src/pages/Index.tsx`:

**De:**
```typescript
"139": (iata, awb) => `https://www.aeromexico.com/es-mx/carga/rastrear?awb=${iata}${awb}`,
```

**Para:**
```typescript
"139": (iata, awb) => `https://amcargo.aeromexico.com/seguimiento/resultado/${iata}-${awb}`,
```

Isso gera URLs no formato `https://amcargo.aeromexico.com/seguimiento/resultado/139-46748634`.

