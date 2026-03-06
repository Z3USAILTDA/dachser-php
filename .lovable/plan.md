

# Mostrar AWBs com tracking_failed e texto "Sem informação na companhia aérea"

## Problema

O AWB 577-11215772 tem `tracking_failed: true` mas status/last_event são null, resultando em `statusToCheck = ""` e `lastEventCode` vazio. Nenhum deles está na `allowedStatuses`, então `isAllowed = false` e o AWB é filtrado na linha 2009.

## Correção — 2 mudanças em `src/pages/Index.tsx`

### 1. Filtro de visibilidade (linha ~2009)

Antes do `return`, adicionar bypass para `tracking_failed`:

```typescript
if (awb.tracking_failed === true) {
  return matchesSearch && matchesAirline && matchesAnalyst && matchesService && matchesProcessType;
}

return matchesSearch && matchesAirline && matchesAnalyst && matchesService && matchesProcessType && isAllowed;
```

### 2. Badge de status (linha ~2826-2828)

Trocar o texto "Falha no Rastreio" por "Sem informação na companhia aérea":

```typescript
{awb.tracking_failed ? (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
    <AlertTriangle className="h-3 w-3" />
    Sem informação na companhia aérea
  </span>
```

Duas mudanças, um arquivo.

