

## Correção: Loop infinito no enriquecimento de containers

### Problema

O enriquecimento por armador fica preso re-tentando containers que falham (ex: `AXIU2194982` retorna erro 500 da API). O loop nunca para porque containers com `last_error` continuam sendo re-selecionados.

### Correções

**1. Backend — `supabase/functions/olimpo-proxy/index.ts`**

Na query de seleção do `refresh_sea_tracking` com `carrier_filter`, excluir containers que erraram recentemente:

```sql
AND NOT (last_error IS NOT NULL AND last_check > DATE_SUB(NOW(), INTERVAL 24 HOUR))
```

Isso evita re-tentar containers que falharam nas últimas 24h.

**2. Frontend — `src/pages/ContainerTracking.tsx`**

No loop do `handleCarrierEnrich`, detectar quando não há progresso (containers processados mas nenhum atualizado) e parar após 3 tentativas consecutivas sem sucesso:

```typescript
if (data.updated === 0 && data.processed > 0) {
  consecutiveNoProgress++;
  if (consecutiveNoProgress >= 3) break;
} else {
  consecutiveNoProgress = 0;
}
```

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/olimpo-proxy/index.ts` | Excluir containers com erro recente da seleção |
| `src/pages/ContainerTracking.tsx` | Parar loop quando não houver progresso |

