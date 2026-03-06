

# Marcar AWBs como "Em Trânsito" se tiveram DEP/MAN/RCF/ARR na timeline

## Problema
AWBs como 139-47195142 que já tiveram DEP na timeline mas cujo último status regrediu para BKD (novo master swap, por exemplo) aparecem como "No Prazo" na coluna Situação. Deveriam mostrar "Em Trânsito".

## Solução

### 1. Backend: `supabase/functions/fetch-status-aereo/index.ts`

Criar função `detectInTransit(timelineJson, etdStr)` que verifica se algum evento filtrado (respeitando ETD cutoff) possui código DEP, MAN, RCF ou ARR. Retorna `boolean`.

Adicionar ao `baseRow`:
```typescript
in_transit: detectInTransit(timelineStr, etdForTimeline) || 
  (apiRow?.historico_status 
    ? detectInTransit(
        typeof apiRow.historico_status === 'string' 
          ? apiRow.historico_status 
          : JSON.stringify(apiRow.historico_status), 
        etdForTimeline
      ) 
    : false),
```

A função reutiliza a mesma lógica de parsing/ETD cutoff já existente em `resolveUnkFromTimeline`.

### 2. Frontend: `src/pages/Index.tsx`

**a)** Mapear `in_transit` no tipo `AWBData` e na conversão de dados.

**b)** Na coluna Situação (linha ~2870), adicionar antes do bloco de "Crítico/Atraso/No Prazo":

```typescript
// AWBs que já tiveram DEP/MAN/RCF/ARR → "Em Trânsito"
if (awb.in_transit && !["ARR - DESTINO", "DLV", "NFD", "AWD", "POD"].includes(statusCode)) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/40">
      <Plane className="h-3 w-3" />
      Em Trânsito
    </span>
  );
}
```

Isso garante que AWBs já entregues (DLV, NFD, AWD, ARR-DESTINO) não sejam rebaixados para "Em Trânsito", mas AWBs com BKD que já tiveram DEP mostrem corretamente.

