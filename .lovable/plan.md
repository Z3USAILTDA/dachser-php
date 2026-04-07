
## Plano: Adicionar link de rastreio United Cargo (prefixo 016)

Adicionar a entrada `"016"` no mapeamento `airlineTrackingLinks` em `src/components/tracking/TrackingUtils.ts` com o formato correto.

### Alteração

**`src/components/tracking/TrackingUtils.ts`** — adicionar na lista `airlineTrackingLinks`:

```typescript
"016": "https://www.unitedcargo.com/en/us/track/awb/${pr}-${awb}",
```

Isso usará o prefixo (016) e o número AWB separados por hífen, conforme solicitado.
