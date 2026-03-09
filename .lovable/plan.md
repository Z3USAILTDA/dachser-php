

## Problema

O status na página de detalhes (`ProcessoTimeline`) mostra inicialmente o `status_cct_oficial` vindo do backend (ex: "Manifestada"), e depois de carregar os eventos (segunda chamada API `get_cct_events`), recalcula o `effectiveStatus` a partir do evento mais recente (ex: "Em área de Transferência"). Isso causa um flash visível do status incorreto.

**Causa raiz dupla:**

1. **Backend**: O `get_cct_shipments` já tenta incorporar status RFB via `cctRfbMap` (Step 2.5), mas para muitos processos o `rfb_situacao` vem `null` -- o status da RFB não está sendo incorporado corretamente no `status_cct_oficial` retornado na listagem principal.

2. **Frontend**: O `ProcessoTimeline` mostra `effectiveStatus` que depende de `allEventos` (carregado via `useCCTEvents`, segunda API call). Enquanto os eventos carregam, mostra o status base incorreto.

## Solução

### 1. Frontend: Mostrar skeleton/loading no badge de status enquanto eventos carregam

**Arquivo:** `src/pages/cct/ProcessoTimeline.tsx`

- Quando `isLoadingEvents` é `true`, renderizar o `StatusBadge` com um indicador de carregamento em vez do status base potencialmente incorreto.
- Alterar a lógica do `effectiveStatus` para retornar `null` enquanto os eventos estão carregando, e condicionar o `StatusBadge` a essa flag.

```tsx
// effectiveStatus retorna null enquanto carrega
const effectiveStatus = useMemo(() => {
  if (isLoadingEvents) return null; // Still loading
  const baseStatus = processo?.status_atual?.status_cct_oficial || 'AGUARDANDO_MANIFESTACAO';
  if (allEventos.length === 0) return baseStatus;
  // ... rest of logic unchanged
}, [allEventos, processo, isLoadingEvents]);

// No JSX do header:
{effectiveStatus ? (
  <StatusBadge status={effectiveStatus} />
) : (
  <Skeleton className="h-6 w-32" />
)}
```

### 2. Tabela principal: Também considerar `rfb_situacao` do backend

**Arquivo:** `src/components/cct/ProcessosTable.tsx`

- Na coluna de status, se `rfb_situacao` existir e mapear para um status mais avançado que `status_cct_oficial`, usar o status RFB. Isso resolve parcialmente sem depender de segunda chamada.

A lógica já existe no backend (linhas 3622-3629), mas falha silenciosamente quando o lookup por MAWB não encontra dados. Verificar no `useCCTData.ts` / `mapRowToProcessoCCT` se o campo `rfb_situacao` está sendo propagado.

Ambas as correções são complementares: a primeira elimina o flash visual, a segunda garante que o status correto chegue desde a primeira chamada quando o backend conseguir enriquecer.

