

## Plano: Forçar discrepância de peças no AWB 996-12994413

### Problema
O AWB 996-12994413 teve variação de peças (6 → 3 → 6) mas a discrepância não está sendo detectada automaticamente porque os dados de peças não estão presentes na timeline armazenada no banco.

### Correção em `supabase/functions/fetch-status-aereo/index.ts`

Adicionar um override para o AWB na seção `MANUAL_OVERRIDES` (~linha 1668):

```typescript
'996-12994413': {
  force_discrepancy: true,
  force_baseline_pieces: 6,
},
```

Isso ativa o flag `pieces_discrepancy = true` e define o baseline como 6 peças, fazendo o AWB aparecer com o indicador de discrepância na lista.

### Arquivo modificado
1. `supabase/functions/fetch-status-aereo/index.ts` — adicionar override com `force_discrepancy` e `force_baseline_pieces`

